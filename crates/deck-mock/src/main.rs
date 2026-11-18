use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use protocol::{
    compute_delta, to_msgpack, AgentEvent, AgentEventKind, DeadbandConfig, Envelope, FieldId,
    GitStats, TelemetryState, PROTOCOL_VERSION,
};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

static SEQ: AtomicU64 = AtomicU64::new(1);
static IS_DARK: AtomicBool = AtomicBool::new(false);

type AppState = Arc<broadcast::Sender<Vec<u8>>>;

#[tokio::main]
async fn main() {
    let (tx, _rx) = broadcast::channel::<Vec<u8>>(100);
    let state: AppState = Arc::new(tx);

    // Background generator for live fake telemetry + sample AgentEvents
    let sim_tx = state.clone();
    tokio::spawn(async move {
        run_simulation_generator(sim_tx).await;
    });

    let app = Router::new()
        .route(
            "/",
            get(|ws: WebSocketUpgrade, State(tx): State<AppState>| async move {
                ws.on_upgrade(move |socket| handle_socket(socket, tx))
            }),
        )
        .route(
            "/ws",
            get(|ws: WebSocketUpgrade, State(tx): State<AppState>| async move {
                ws.on_upgrade(move |socket| handle_socket(socket, tx))
            }),
        )
        .with_state(state)
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([127, 0, 0, 1], 8765));
    println!("┌────────────────────────────────────────────────────────┐");
    println!(
        "│ Phone Deck Mock Agent (protocol v{})                    │",
        PROTOCOL_VERSION
    );
    println!("│ Serving WebSocket on ws://127.0.0.1:8765/ws            │");
    println!("│ Simulating live telemetry + AI agent completion alerts │");
    println!("└────────────────────────────────────────────────────────┘");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}

async fn handle_socket(socket: WebSocket, tx: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = tx.subscribe();

    println!("[deck-mock] Client connected!");

    let send_task = tokio::spawn(async move {
        while let Ok(msg_bytes) = rx.recv().await {
            if sender.send(Message::Binary(msg_bytes.into())).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Binary(bytes) => {
                    println!("[deck-mock] Received {} bytes from client", bytes.len());
                }
                Message::Text(text) => {
                    println!("[deck-mock] Received text: {}", text);
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(t) = val.get("type").and_then(|v| v.as_str()) {
                            if t == "display_state" {
                                if let Some(s) = val.get("state").and_then(|v| v.as_str()) {
                                    if s == "dark" {
                                        IS_DARK.store(true, Ordering::SeqCst);
                                        println!("[deck-mock] -> Activated Ambient Profile: Telemetry paused (heartbeat only)");
                                    } else {
                                        IS_DARK.store(false, Ordering::SeqCst);
                                        println!("[deck-mock] -> Activated Active Profile: Telemetry streaming resumed");
                                    }
                                }
                            }
                        }
                    }
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    println!("[deck-mock] Client disconnected.");
}

async fn run_simulation_generator(tx: AppState) {
    let mut prev_state = TelemetryState::new();
    let deadbands = DeadbandConfig::default();
    let mut tick = 0u64;

    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        tick += 1;

        // Generate synthetic wave data
        let t = (tick as f64) * 0.1;
        let cpu_pct = ((f64::sin(t) * 25.0 + 45.0) * 10.0) as u64; // 20.0% to 70.0%
        let cpu_temp = ((f64::cos(t * 0.7) * 8.0 + 52.0) * 10.0) as i64; // 44.0°C to 60.0°C
        let cpu_freq = 3600 + ((f64::sin(t * 1.5) * 400.0) as u32);
        let ram_used = 14_000_000_000u64 + ((f64::sin(t * 0.5) * 2_000_000_000.0) as u64);
        let gpu_usage = ((f64::sin(t * 1.2) * 20.0 + 35.0) * 10.0) as u64;
        let gpu_temp = ((f64::cos(t * 0.5) * 6.0 + 56.0) * 10.0) as i64;
        let net_in = (f64::sin(t * 2.0).abs() * 800_000.0 + 50_000.0) as u64;
        let net_out = (f64::cos(t * 2.0).abs() * 300_000.0 + 20_000.0) as u64;

        let mut curr_state = TelemetryState::new();
        curr_state.set(FieldId::CpuTotal, cpu_pct);
        curr_state.set(FieldId::CpuFreqMhz, cpu_freq);
        curr_state.set(FieldId::CpuTempC, cpu_temp);
        curr_state.set(FieldId::RamUsedBytes, ram_used);
        curr_state.set(FieldId::RamTotalBytes, 34_359_738_368u64); // 32 GB
        curr_state.set(FieldId::GpuUsage, gpu_usage);
        curr_state.set(FieldId::GpuTempC, gpu_temp);
        curr_state.set(FieldId::GpuVramUsedBytes, 5_800_000_000u64);
        curr_state.set(FieldId::GpuVramTotalBytes, 17_179_869_184u64); // 16 GB
        curr_state.set(FieldId::NetInBytesSec, net_in);
        curr_state.set(FieldId::NetOutBytesSec, net_out);
        curr_state.set(FieldId::DiskUsedBytes, 720_000_000_000u64);
        curr_state.set(FieldId::DiskTotalBytes, 1_000_000_000_000u64);
        curr_state.set(FieldId::UptimeSeconds, tick / 2 + 14200);
        curr_state.set(FieldId::PcBatteryPct, 82u8);
        curr_state.set(FieldId::PcBatteryCharging, true);
        curr_state.set(FieldId::MediaPlaying, true);
        curr_state.set(FieldId::MediaTitle, "Selected Ambient Works");
        curr_state.set(FieldId::MediaArtist, "Aphex Twin");
        curr_state.set(FieldId::MediaPositionSec, (tick % 240) as u32);
        curr_state.set(FieldId::MediaDurationSec, 240u32);

        let is_dark = IS_DARK.load(Ordering::SeqCst);

        if !is_dark {
            let delta = compute_delta(&prev_state, &curr_state, &deadbands);
            if !delta.is_empty() {
                let seq = SEQ.fetch_add(1, Ordering::SeqCst);
                let env = Envelope::telemetry(seq, delta);
                if let Ok(bytes) = to_msgpack(&env) {
                    let _ = tx.send(bytes);
                }
                prev_state = curr_state;
            }
        } else if tick % 10 == 0 {
            // Ambient mode: Send minimal heartbeat packet every 5 seconds (<50 B/s)
            let seq = SEQ.fetch_add(1, Ordering::SeqCst);
            let empty_delta = protocol::TelemetryDelta::default();
            let env = Envelope::telemetry(seq, empty_delta);
            if let Ok(bytes) = to_msgpack(&env) {
                let _ = tx.send(bytes);
            }
        }

        // Periodically emit an AgentEvent alert (every ~12 seconds = 24 ticks)
        if tick % 24 == 0 {
            let seq = SEQ.fetch_add(1, Ordering::SeqCst);
            let is_approval = (tick % 48) == 0;

            let event = if is_approval {
                AgentEvent {
                    id: format!("req-{}", tick),
                    ts: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    agent: "claude-code".to_string(),
                    project: "phone-deck".to_string(),
                    cwd: "D:\\PhoneDeck".to_string(),
                    kind: AgentEventKind::Approval,
                    title: "Run Database Migration?".to_string(),
                    summary: "cargo run -p deck-cli -- migrate --target=local".to_string(),
                    stats: None,
                    actions: vec!["approve".to_string(), "deny".to_string()],
                    expires_at: Some(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs()
                            + 60,
                    ),
                }
            } else {
                AgentEvent {
                    id: format!("evt-{}", tick),
                    ts: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    agent: "claude-code".to_string(),
                    project: "phone-deck".to_string(),
                    cwd: "D:\\PhoneDeck".to_string(),
                    kind: AgentEventKind::Done,
                    title: "Task completed: protocol crate".to_string(),
                    summary: "Finished MessagePack envelope and delta tests".to_string(),
                    stats: Some(GitStats {
                        duration_s: 142,
                        files_changed: 4,
                        insertions: 218,
                        deletions: 12,
                    }),
                    actions: vec![
                        "open_editor".to_string(),
                        "open_folder".to_string(),
                        "mark_reviewed".to_string(),
                    ],
                    expires_at: None,
                }
            };

            let env = Envelope::event(seq, event);
            if let Ok(bytes) = to_msgpack(&env) {
                let _ = tx.send(bytes);
            }
        }
    }
}
