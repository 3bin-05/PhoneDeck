use crate::pairing::PairingManager;
use crate::sensors::TelemetryHub;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto;
use protocol::{
    generate_nonce, AuthChallenge, AuthResponse, AuthResult, PairRequest, PairResponse,
};
use std::net::SocketAddr;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct ServerState {
    pub pairing: Arc<PairingManager>,
    pub telemetry_hub: Arc<TelemetryHub>,
    pub hub: Arc<crate::hub::AgentHub>,
    pub shortcuts: Arc<crate::shortcuts::ShortcutManager>,
    pub rules: Arc<crate::rules::RulesEngine>,
    pub media: Arc<crate::media_session::MediaSessionManager>,
    pub app_registry: Arc<crate::app_registry::AppRegistryManager>,
    pub updater: Arc<crate::updater::AgentUpdaterManager>,
    pub agent_id: String,
}

pub async fn start_wss_server(
    addr: SocketAddr,
    tls_acceptor: TlsAcceptor,
    state: ServerState,
) -> Result<(), String> {
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind TCP listener on {}: {}", e, addr))?;

    log::info!("[WSS] Secure server listening on wss://{}", addr);

    let app = Router::new()
        .route(
            "/pair",
            get(|ws: WebSocketUpgrade, State(s): State<ServerState>| async move {
                ws.on_upgrade(move |socket| handle_pair_socket(socket, s))
            }),
        )
        .route(
            "/ws",
            get(|ws: WebSocketUpgrade, State(s): State<ServerState>| async move {
                ws.on_upgrade(move |socket| handle_auth_and_stream_socket(socket, s))
            }),
        )
        // Localhost protected webhook / push endpoints
        .route(
            "/api/push/{key}",
            post(|headers: HeaderMap| async move {
                if !verify_localhost_headers(&headers) {
                    return StatusCode::FORBIDDEN.into_response();
                }
                "OK".into_response()
            }),
        )
        .route(
            "/api/notify",
            post(|headers: HeaderMap| async move {
                if !verify_localhost_headers(&headers) {
                    return StatusCode::FORBIDDEN.into_response();
                }
                "OK".into_response()
            }),
        )
        // Public LAN asset endpoint for album art cache
        .route(
            "/api/media/art/{art_id}",
            get(|axum::extract::Path(art_id): axum::extract::Path<String>, State(s): State<ServerState>| async move {
                if let Some(bytes) = s.media.get_art(&art_id) {
                    ([(axum::http::header::CONTENT_TYPE, "image/webp")], bytes).into_response()
                } else {
                    StatusCode::NOT_FOUND.into_response()
                }
            }),
        )
        // Public LAN asset endpoint for app icons cache
        .route(
            "/api/app/icon/{icon_id}",
            get(|axum::extract::Path(icon_id): axum::extract::Path<String>| async move {
                let initial = icon_id.chars().next().unwrap_or('A').to_ascii_uppercase();
                let svg = format!(
                    r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="10" fill="#181822"/><text x="24" y="29" fill="#7C5CFF" font-family="monospace" font-size="16" font-weight="bold" text-anchor="middle">{}</text></svg>"##,
                    initial
                );
                ([(axum::http::header::CONTENT_TYPE, "image/svg+xml")], svg).into_response()
            }),
        )
        // LAN Android update manifest endpoint (phone gets updates over LAN even with no internet)
        .route(
            "/api/update/android-latest.json",
            get(|State(s): State<ServerState>| async move {
                if let Some(json) = s.updater.get_android_manifest() {
                    ([(axum::http::header::CONTENT_TYPE, "application/json")], json).into_response()
                } else {
                    StatusCode::NOT_FOUND.into_response()
                }
            }),
        )
        // LAN Android APK chunked/resumable download endpoint
        .route(
            "/api/update/apk/{filename}",
            get(|axum::extract::Path(filename): axum::extract::Path<String>, headers: HeaderMap, State(s): State<ServerState>| async move {
                let range_hdr = headers.get("range").and_then(|h| h.to_str().ok());
                if let Some((bytes, start, end, total, sha256)) = s.updater.get_apk_bytes_range(&filename, range_hdr) {
                    let mut resp_headers = HeaderMap::new();
                    resp_headers.insert(axum::http::header::CONTENT_TYPE, "application/vnd.android.package-archive".parse().unwrap());
                    resp_headers.insert(axum::http::header::ACCEPT_RANGES, "bytes".parse().unwrap());
                    resp_headers.insert(
                        axum::http::header::CONTENT_RANGE,
                        format!("bytes {}-{}/{}", start, end, total).parse().unwrap(),
                    );
                    resp_headers.insert("X-Checksum-Sha256", sha256.parse().unwrap());

                    let status = if range_hdr.is_some() {
                        StatusCode::PARTIAL_CONTENT
                    } else {
                        StatusCode::OK
                    };
                    (status, resp_headers, bytes).into_response()
                } else {
                    StatusCode::NOT_FOUND.into_response()
                }
            }),
        )
        .with_state(state)
        .layer(CorsLayer::permissive());

    tokio::spawn(async move {
        let auto_server = auto::Builder::new(TokioExecutor::new());

        loop {
            let (stream, client_addr) = match listener.accept().await {
                Ok(res) => res,
                Err(e) => {
                    log::warn!("[WSS] Accept failed: {}", e);
                    continue;
                }
            };

            let acceptor = tls_acceptor.clone();
            let app = app.clone();
            let auto_server = auto_server.clone();

            tokio::spawn(async move {
                let tls_stream = match acceptor.accept(stream).await {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("[WSS] TLS handshake failed with {}: {}", client_addr, e);
                        return;
                    }
                };

                let io = TokioIo::new(tls_stream);
                let hyper_service = hyper_util::service::TowerToHyperService::new(app);

                if let Err(e) = auto_server.serve_connection_with_upgrades(io, hyper_service).await {
                    log::debug!("[WSS] Connection closed with {}: {}", client_addr, e);
                }
            });
        }
    });

    Ok(())
}

/// Rejects foreign Host and Origin headers on localhost-only endpoints.
pub fn verify_localhost_headers(headers: &HeaderMap) -> bool {
    if let Some(host) = headers.get("host") {
        if let Ok(host_str) = host.to_str() {
            let host_clean = host_str.split(':').next().unwrap_or("").to_lowercase();
            if host_clean != "localhost" && host_clean != "127.0.0.1" && host_clean != "::1" {
                return false;
            }
        }
    }

    if let Some(origin) = headers.get("origin") {
        if let Ok(origin_str) = origin.to_str() {
            let origin_lower = origin_str.to_lowercase();
            if !origin_lower.starts_with("http://localhost")
                && !origin_lower.starts_with("http://127.0.0.1")
                && !origin_lower.starts_with("https://localhost")
                && !origin_lower.starts_with("tauri://localhost")
                && origin_lower != "null"
            {
                return false;
            }
        }
    }

    true
}

/// Handle pairing handshake over WebSocket `/pair`
async fn handle_pair_socket(mut socket: WebSocket, state: ServerState) {
    log::info!("[WSS/Pair] New client connected for pairing");

    if let Some(Ok(msg)) = socket.next().await {
        let pair_req: Option<PairRequest> = match msg {
            Message::Text(text) => serde_json::from_str(&text).ok(),
            Message::Binary(bytes) => {
                protocol::from_msgpack(&bytes).ok().or_else(|| serde_json::from_slice(&bytes).ok())
            }
            _ => None,
        };

        let response = match pair_req {
            Some(req) => match state.pairing.pair_device(&req.token, req.device_id, req.device_name) {
                Ok(device_key) => PairResponse {
                    success: true,
                    device_key: Some(device_key),
                    error: None,
                },
                Err(err) => PairResponse {
                    success: false,
                    device_key: None,
                    error: Some(err),
                },
            },
            None => PairResponse {
                success: false,
                device_key: None,
                error: Some("Invalid pair request format".to_string()),
            },
        };

        let resp_json = serde_json::to_string(&response).unwrap();
        let _ = socket.send(Message::Text(resp_json.into())).await;
    }

    let _ = socket.close().await;
}

/// Handle challenge-response authentication over WebSocket `/ws`
async fn handle_auth_and_stream_socket(mut socket: WebSocket, state: ServerState) {
    let nonce_hex = generate_nonce();
    let nonce_bytes = hex::decode(&nonce_hex).unwrap();

    let challenge = AuthChallenge {
        nonce: nonce_hex.clone(),
        protocol_version: protocol::PROTOCOL_VERSION,
        min_compatible_version: protocol::MIN_COMPATIBLE_VERSION,
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    let challenge_json = serde_json::to_string(&challenge).unwrap();
    if socket.send(Message::Text(challenge_json.into())).await.is_err() {
        return;
    }

    let auth_resp: Option<AuthResponse> = match socket.next().await {
        Some(Ok(Message::Text(text))) => serde_json::from_str(&text).ok(),
        Some(Ok(Message::Binary(bytes))) => {
            protocol::from_msgpack(&bytes).ok().or_else(|| serde_json::from_slice(&bytes).ok())
        }
        _ => None,
    };

    let authenticated = if let Some(ref resp) = auth_resp {
        if let Ok(proof_bytes) = hex::decode(&resp.proof) {
            if proof_bytes.len() == 32 {
                let mut proof = [0u8; 32];
                proof.copy_from_slice(&proof_bytes);
                state.pairing.verify_device_auth(&resp.device_id, &nonce_bytes, &proof)
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    let protocol_compatible = if let Some(ref resp) = auth_resp {
        if resp.client_protocol_version > 0 {
            protocol::is_protocol_compatible(
                protocol::PROTOCOL_VERSION,
                protocol::MIN_COMPATIBLE_VERSION,
                resp.client_protocol_version,
                resp.client_protocol_version,
            )
        } else {
            true
        }
    } else {
        true
    };

    if !authenticated {
        log::warn!("[WSS/Auth] Authentication failed or device revoked. Terminating connection.");
        let result = AuthResult {
            success: false,
            error: Some("Authentication challenge-response failed or device revoked".to_string()),
            protocol_compatible,
            agent_protocol_version: protocol::PROTOCOL_VERSION,
            min_compatible_version: protocol::MIN_COMPATIBLE_VERSION,
        };
        let _ = socket.send(Message::Text(serde_json::to_string(&result).unwrap().into())).await;
        let _ = socket.close().await;
        return;
    }

    if !protocol_compatible {
        log::warn!("[WSS/Auth] Client protocol incompatible. Update required.");
        let result = AuthResult {
            success: false,
            error: Some("Protocol version incompatible. An update is required.".to_string()),
            protocol_compatible: false,
            agent_protocol_version: protocol::PROTOCOL_VERSION,
            min_compatible_version: protocol::MIN_COMPATIBLE_VERSION,
        };
        let _ = socket.send(Message::Text(serde_json::to_string(&result).unwrap().into())).await;
        let _ = socket.close().await;
        return;
    }

    log::info!("[WSS/Auth] Device authenticated successfully (protocol v{})!", protocol::PROTOCOL_VERSION);
    let result = AuthResult {
        success: true,
        error: None,
        protocol_compatible: true,
        agent_protocol_version: protocol::PROTOCOL_VERSION,
        min_compatible_version: protocol::MIN_COMPATIBLE_VERSION,
    };
    if socket.send(Message::Text(serde_json::to_string(&result).unwrap().into())).await.is_err() {
        return;
    }

    // Client authenticated: Register with TelemetryHub
    state.telemetry_hub.add_client();
    // Default subscription on connect: CPU, Frequency, RAM used/total, Network in/out, Uptime
    state
        .telemetry_hub
        .update_client_subscriptions(vec![1, 2, 4, 5, 10, 11, 14])
        .await;

    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.telemetry_hub.telemetry_tx.subscribe();
    let mut event_rx = state.hub.event_tx.subscribe();

    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Ok(bytes) = rx.recv() => {
                    if sender.send(Message::Binary(bytes.into())).await.is_err() {
                        break;
                    }
                }
                Ok(event) = event_rx.recv() => {
                    let envelope = protocol::Envelope::event(0, event);
                    if let Ok(bytes) = protocol::to_msgpack(&envelope) {
                        if sender.send(Message::Binary(bytes.into())).await.is_err() {
                            break;
                        }
                    }
                }
                else => break,
            }
        }
    });

    let hub_clone = state.telemetry_hub.clone();
    let agent_hub_clone = state.hub.clone();
    let media_clone = state.media.clone();
    let app_registry_clone = state.app_registry.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(dimmed) = v.get("dimmed").and_then(|d| d.as_bool()) {
                            app_registry_clone.set_paused(dimmed);
                            if dimmed {
                                // Dimmed / night mode: poll only Uptime (< 0.2 KB/s)
                                hub_clone.update_client_subscriptions(vec![14]).await;
                            } else {
                                // Active page: standard metrics
                                hub_clone
                                    .update_client_subscriptions(vec![1, 2, 4, 5, 10, 11, 14])
                                    .await;
                            }
                        } else if let Some(disp) = v.get("display_state").and_then(|s| s.as_str()) {
                            app_registry_clone.set_paused(disp == "dark");
                        } else if let Some(subs) = v.get("subscribe").and_then(|s| s.as_array()) {
                            let list = subs
                                .iter()
                                .filter_map(|x| x.as_u64().map(|n| n as u16))
                                .collect::<Vec<_>>();
                            hub_clone.update_client_subscriptions(list).await;
                        } else if let Some(ans) = v.get("answer") {
                            if let (Some(id), Some(appr)) = (
                                ans.get("id").and_then(|s| s.as_str()),
                                ans.get("approved").and_then(|b| b.as_bool()),
                            ) {
                                agent_hub_clone.resolve_approval(id, appr).await;
                            }
                        } else if let Some(act) = v.get("action") {
                            let action = act.get("type").and_then(|s| s.as_str()).unwrap_or("");
                            let cwd = act.get("cwd").and_then(|s| s.as_str()).unwrap_or(".");
                            let _ = agent_hub_clone.execute_action(action, cwd);
                        } else if let Some(media_act) = v.get("media_action").and_then(|a| a.as_str()) {
                            match media_act {
                                "play" => media_clone.play(),
                                "pause" => media_clone.pause(),
                                "toggle" => media_clone.toggle_play_pause(),
                                "next" => media_clone.next(),
                                "prev" => media_clone.prev(),
                                "cycle_source" => media_clone.cycle_source(),
                                "mute" => media_clone.toggle_master_mute(),
                                _ => {}
                            }
                        } else if let Some(seek_pos) = v.get("media_seek").and_then(|p| p.as_u64()) {
                            media_clone.seek(seek_pos as u32);
                        } else if let Some(vol) = v.get("media_volume").and_then(|p| p.as_u64()) {
                            media_clone.set_master_volume(vol as u8);
                        } else if let Some(pref) = v.get("media_source").and_then(|s| s.as_str()) {
                            media_clone.set_preferred_source(Some(pref.to_string()));
                        } else if let Some(app_act) = v.get("app_action") {
                            let app_id = app_act.get("app_id").and_then(|s| s.as_str()).unwrap_or("");
                            let action = app_act.get("action").and_then(|s| s.as_str()).unwrap_or("");
                            let ql = app_act.get("quick_launch_id").and_then(|s| s.as_str());
                            let app_reg = app_registry_clone.clone();
                            let app_id_owned = app_id.to_string();
                            let action_owned = action.to_string();
                            let ql_owned = ql.map(|s| s.to_string());
                            tokio::spawn(async move {
                                let _ = app_reg
                                    .execute_action(&app_id_owned, &action_owned, ql_owned.as_deref())
                                    .await;
                            });
                        } else if let Some(app_subs) = v.get("app_subscribe").and_then(|s| s.as_array()) {
                            let list = app_subs
                                .iter()
                                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                                .collect::<Vec<_>>();
                            app_registry_clone.update_subscriptions(list).await;
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    state.telemetry_hub.remove_client();
    log::info!(
        "[WSS/Auth] Client disconnected. Active clients: {}",
        state.telemetry_hub.client_count.load(Ordering::SeqCst)
    );
}
