use crate::hub::AgentHub;
use crate::sensors::TelemetryHub;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use protocol::{AgentEvent, AgentEventKind, MetricValue};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

pub const HTTP_BRIDGE_PORT: u16 = 8767;

#[derive(Clone)]
pub struct BridgeState {
    pub hub: Arc<AgentHub>,
    pub telemetry_hub: Arc<TelemetryHub>,
    pub shortcuts: Arc<crate::shortcuts::ShortcutManager>,
    pub rules: Arc<crate::rules::RulesEngine>,
}

#[derive(Deserialize)]
pub struct NotifyPayload {
    pub agent: Option<String>,
    pub project: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub kind: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Deserialize)]
pub struct AskPayload {
    pub prompt: String,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub timeout: Option<u64>,
}

#[derive(Serialize)]
pub struct AskResponse {
    pub approved: bool,
}

#[derive(Deserialize)]
pub struct ActionPayload {
    pub action: String,
    pub cwd: Option<String>,
}

#[derive(Deserialize)]
pub struct AnswerPayload {
    pub approved: bool,
}

/// Starts the local-only HTTP bridge on 127.0.0.1:8767.
/// Per plan.md section 6: Localhost needs no key. Rejects foreign Host/Origin headers.
pub async fn start_http_bridge(state: BridgeState) -> Result<(), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], HTTP_BRIDGE_PORT));
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind local HTTP bridge on {}: {}", addr, e))?;

    log::info!("[Bridge] Localhost HTTP bridge listening on http://{}", addr);

    let app = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        // POST /api/push/<key>
        .route(
            "/api/push/{key}",
            post(
                |headers: HeaderMap,
                 Path(key): Path<u16>,
                 State(s): State<BridgeState>,
                 body: String| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    if let Ok(val) = body.trim().parse::<u64>() {
                        s.telemetry_hub.push_custom_metric(key, MetricValue::U64(val));
                    } else if let Ok(val) = body.trim().parse::<i64>() {
                        s.telemetry_hub.push_custom_metric(key, MetricValue::I64(val));
                    } else {
                        s.telemetry_hub
                            .push_custom_metric(key, MetricValue::String(body.trim().to_string()));
                    }
                    s.rules.evaluate_webhook(&key.to_string(), body.trim()).await;
                    (StatusCode::OK, "OK").into_response()
                },
            ),
        )
        // POST /api/notify
        .route(
            "/api/notify",
            post(
                |headers: HeaderMap,
                 State(s): State<BridgeState>,
                 Json(payload): Json<NotifyPayload>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }

                    let kind = match payload.kind.as_deref() {
                        Some("needs_input") => AgentEventKind::NeedsInput,
                        Some("approval") => AgentEventKind::Approval,
                        Some("error") => AgentEventKind::Error,
                        Some("working") => AgentEventKind::Working,
                        Some("idle") => AgentEventKind::Idle,
                        _ => AgentEventKind::Done,
                    };

                    let cwd = payload.cwd.unwrap_or_else(|| {
                        std::env::current_dir()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_default()
                    });

                    let project = payload.project.unwrap_or_else(|| {
                        std::path::Path::new(&cwd)
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| "project".to_string())
                    });

                    let event = AgentEvent {
                        id: format!("evt-{}", std::time::Instant::now().elapsed().as_nanos()),
                        ts: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs(),
                        agent: payload.agent.unwrap_or_else(|| "agent".to_string()),
                        project,
                        cwd,
                        kind,
                        title: payload.title.unwrap_or_else(|| "Task Complete".to_string()),
                        summary: payload.summary.unwrap_or_default(),
                        stats: None,
                        actions: vec![
                            "open_editor".to_string(),
                            "open_folder".to_string(),
                            "mark_reviewed".to_string(),
                            "dismiss".to_string(),
                        ],
                        expires_at: None,
                    };

                    s.hub.dispatch_event(event).await;
                    (StatusCode::OK, "OK").into_response()
                },
            ),
        )
        // POST /api/ask
        .route(
            "/api/ask",
            post(
                |headers: HeaderMap,
                 State(s): State<BridgeState>,
                 Json(payload): Json<AskPayload>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }

                    let timeout = payload.timeout.unwrap_or(60);
                    match s
                        .hub
                        .ask_approval(payload.prompt, payload.command, payload.cwd, timeout)
                        .await
                    {
                        Ok(approved) => Json(AskResponse { approved }).into_response(),
                        Err(e) => (StatusCode::REQUEST_TIMEOUT, e).into_response(),
                    }
                },
            ),
        )
        // POST /api/goto/<page>
        .route(
            "/api/goto/{page}",
            post(
                |headers: HeaderMap,
                 Path(page): Path<u32>,
                 State(s): State<BridgeState>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    let _ = s.hub.goto_page_tx.send(page);
                    (StatusCode::OK, "OK").into_response()
                },
            ),
        )
        // POST /api/action (execute PC action: open_editor, open_folder)
        .route(
            "/api/action",
            post(
                |headers: HeaderMap,
                 State(s): State<BridgeState>,
                 Json(payload): Json<ActionPayload>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    if payload.action.starts_with("shortcut:") {
                        let id = &payload.action["shortcut:".len()..];
                        match s.shortcuts.execute(id).await {
                            Ok(msg) => (StatusCode::OK, msg).into_response(),
                            Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
                        }
                    } else if payload.action.starts_with("rule_test:") {
                        let id = &payload.action["rule_test:".len()..];
                        match s.rules.test_rule(id).await {
                            Ok(_) => (StatusCode::OK, "Rule tested").into_response(),
                            Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
                        }
                    } else {
                        let cwd = payload.cwd.as_deref().unwrap_or(".");
                        match s.hub.execute_action(&payload.action, cwd) {
                            Ok(()) => (StatusCode::OK, "OK").into_response(),
                            Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
                        }
                    }
                },
            ),
        )
        // POST /api/shortcut/{id}
        .route(
            "/api/shortcut/{id}",
            post(
                |headers: HeaderMap,
                 Path(id): Path<String>,
                 State(s): State<BridgeState>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    match s.shortcuts.execute(&id).await {
                        Ok(msg) => (StatusCode::OK, msg).into_response(),
                        Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
                    }
                },
            ),
        )
        // POST /api/rule/test/{id}
        .route(
            "/api/rule/test/{id}",
            post(
                |headers: HeaderMap,
                 Path(id): Path<String>,
                 State(s): State<BridgeState>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    match s.rules.test_rule(&id).await {
                        Ok(_) => (StatusCode::OK, "OK").into_response(),
                        Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
                    }
                },
            ),
        )
        // POST /api/answer/<id> (phone resolves approval)
        .route(
            "/api/answer/{id}",
            post(
                |headers: HeaderMap,
                 Path(id): Path<String>,
                 State(s): State<BridgeState>,
                 Json(payload): Json<AnswerPayload>| async move {
                    if !verify_localhost(&headers) {
                        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
                    }
                    if s.hub.resolve_approval(&id, payload.approved).await {
                        (StatusCode::OK, "OK").into_response()
                    } else {
                        (StatusCode::NOT_FOUND, "Approval ID not found or expired").into_response()
                    }
                },
            ),
        )
        .with_state(state)
        .layer(CorsLayer::permissive());

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("[Bridge] Server error: {}", e);
        }
    });

    Ok(())
}

fn verify_localhost(headers: &HeaderMap) -> bool {
    if let Some(host) = headers.get("host").and_then(|h| h.to_str().ok()) {
        let is_local = host.starts_with("127.0.0.1")
            || host.starts_with("localhost")
            || host.starts_with("[::1]");
        if !is_local {
            return false;
        }
    }

    if let Some(origin) = headers.get("origin").and_then(|o| o.to_str().ok()) {
        let is_local = origin.contains("localhost")
            || origin.contains("127.0.0.1")
            || origin.contains("tauri://localhost")
            || origin.contains("http://localhost");
        if !is_local {
            return false;
        }
    }

    true
}
