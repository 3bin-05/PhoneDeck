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

    let authenticated = if let Some(resp) = auth_resp {
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

    if !authenticated {
        log::warn!("[WSS/Auth] Authentication failed or device revoked. Terminating connection.");
        let result = AuthResult {
            success: false,
            error: Some("Authentication challenge-response failed or device revoked".to_string()),
        };
        let _ = socket.send(Message::Text(serde_json::to_string(&result).unwrap().into())).await;
        let _ = socket.close().await;
        return;
    }

    log::info!("[WSS/Auth] Device authenticated successfully!");
    let result = AuthResult {
        success: true,
        error: None,
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

    let send_task = tokio::spawn(async move {
        while let Ok(bytes) = rx.recv().await {
            if sender.send(Message::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });

    let hub_clone = state.telemetry_hub.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(dimmed) = v.get("dimmed").and_then(|d| d.as_bool()) {
                            if dimmed {
                                // Dimmed / night mode: poll only Uptime (< 0.2 KB/s)
                                hub_clone.update_client_subscriptions(vec![14]).await;
                            } else {
                                // Active page: standard metrics
                                hub_clone
                                    .update_client_subscriptions(vec![1, 2, 4, 5, 10, 11, 14])
                                    .await;
                            }
                        } else if let Some(subs) = v.get("subscribe").and_then(|s| s.as_array()) {
                            let list = subs
                                .iter()
                                .filter_map(|x| x.as_u64().map(|n| n as u16))
                                .collect::<Vec<_>>();
                            hub_clone.update_client_subscriptions(list).await;
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
