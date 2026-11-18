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
static MEDIA_PLAYING: AtomicBool = AtomicBool::new(true);
static MEDIA_TRACK_INDEX: AtomicU64 = AtomicU64::new(0);
static MEDIA_POSITION_SEC: AtomicU64 = AtomicU64::new(42);
static MEDIA_VOLUME_PCT: AtomicU64 = AtomicU64::new(75);
static MEDIA_MUTE: AtomicBool = AtomicBool::new(false);
static MEDIA_SESSION_INDEX: AtomicU64 = AtomicU64::new(0);
static MEDIA_DIRTY: AtomicBool = AtomicBool::new(true);

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
        // Mock album art endpoint
        .route(
            "/api/media/art/{art_id}",
            get(|axum::extract::Path(_art_id): axum::extract::Path<String>| async move {
                let track_idx = MEDIA_TRACK_INDEX.load(Ordering::SeqCst) % 3;
                let (color1, color2, track_name) = match track_idx {
                    0 => ("#7C5CFF", "#00E599", "ALBERTO BALSALM"),
                    1 => ("#FF3B5C", "#7C5CFF", "WINDOWLICKER"),
                    _ => ("#FFB800", "#7C5CFF", "XTAL"),
                };

                let svg = format!(
                    r##"<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
                      <defs>
                        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stop-color="{}" />
                          <stop offset="60%" stop-color="#121217" />
                          <stop offset="100%" stop-color="{}" />
                        </linearGradient>
                      </defs>
                      <rect width="512" height="512" fill="url(#g)" />
                      <circle cx="256" cy="256" r="160" fill="#0A0A0E" stroke="#27272A" stroke-width="4"/>
                      <circle cx="256" cy="256" r="110" fill="none" stroke="#27272A" stroke-width="1.5" stroke-dasharray="3,6"/>
                      <circle cx="256" cy="256" r="60" fill="{}" opacity="0.85"/>
                      <circle cx="256" cy="256" r="14" fill="#FFFFFF"/>
                      <text x="256" y="445" font-family="monospace" font-size="20" font-weight="bold" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">APHEX TWIN</text>
                      <text x="256" y="475" font-family="monospace" font-size="13" fill="#A1A1AA" text-anchor="middle">{}</text>
                    </svg>"##,
                    color1, color2, color1, track_name
                );
                ([(axum::http::header::CONTENT_TYPE, "image/svg+xml")], svg)
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

                        if let Some(media_act) = val.get("media_action").and_then(|a| a.as_str()) {
                            match media_act {
                                "play" => {
                                    MEDIA_PLAYING.store(true, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "pause" => {
                                    MEDIA_PLAYING.store(false, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "toggle" => {
                                    let cur = MEDIA_PLAYING.load(Ordering::SeqCst);
                                    MEDIA_PLAYING.store(!cur, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "next" => {
                                    MEDIA_TRACK_INDEX.fetch_add(1, Ordering::SeqCst);
                                    MEDIA_POSITION_SEC.store(0, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "prev" => {
                                    let cur = MEDIA_TRACK_INDEX.load(Ordering::SeqCst);
                                    MEDIA_TRACK_INDEX.store(if cur > 0 { cur - 1 } else { 2 }, Ordering::SeqCst);
                                    MEDIA_POSITION_SEC.store(0, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "cycle_source" => {
                                    MEDIA_SESSION_INDEX.fetch_add(1, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                "mute" => {
                                    let cur = MEDIA_MUTE.load(Ordering::SeqCst);
                                    MEDIA_MUTE.store(!cur, Ordering::SeqCst);
                                    MEDIA_DIRTY.store(true, Ordering::SeqCst);
                                }
                                _ => {}
                            }
                        }

                        if let Some(seek) = val.get("media_seek").and_then(|s| s.as_u64()) {
                            MEDIA_POSITION_SEC.store(seek, Ordering::SeqCst);
                            MEDIA_DIRTY.store(true, Ordering::SeqCst);
                        }

                        if let Some(vol) = val.get("media_volume").and_then(|v| v.as_u64()) {
                            MEDIA_VOLUME_PCT.store(vol.min(100), Ordering::SeqCst);
                            MEDIA_DIRTY.store(true, Ordering::SeqCst);
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

        // Media Mock state (Section 10 & Part B)
        let is_playing = MEDIA_PLAYING.load(Ordering::SeqCst);
        let track_idx = (MEDIA_TRACK_INDEX.load(Ordering::SeqCst) % 3) as usize;
        let session_idx = (MEDIA_SESSION_INDEX.load(Ordering::SeqCst) % 4) as usize;
        let vol_pct = MEDIA_VOLUME_PCT.load(Ordering::SeqCst) as u8;
        let mute = MEDIA_MUTE.load(Ordering::SeqCst);

        let tracks = [
            ("Alberto Balsalm", "Aphex Twin", "...I Care Because You Do", 311u32, "#7C5CFF,#121217,#00E599"),
            ("Windowlicker", "Aphex Twin", "Windowlicker EP", 367u32, "#FF3B5C,#121217,#7C5CFF"),
            ("Xtal", "Aphex Twin", "Selected Ambient Works 85-92", 294u32, "#FFB800,#121217,#7C5CFF"),
        ];
        let sessions = ["Spotify", "Opera GX", "Google Chrome", "VLC Media Player"];

        let (title, artist, album, duration, palette) = tracks[track_idx];
        let source_app = sessions[session_idx];

        if is_playing && tick % 2 == 0 {
            let cur_pos = MEDIA_POSITION_SEC.load(Ordering::SeqCst);
            if cur_pos >= duration as u64 {
                MEDIA_POSITION_SEC.store(0, Ordering::SeqCst);
                MEDIA_TRACK_INDEX.fetch_add(1, Ordering::SeqCst);
            } else {
                MEDIA_POSITION_SEC.fetch_add(1, Ordering::SeqCst);
            }
        }
        let pos = MEDIA_POSITION_SEC.load(Ordering::SeqCst) as u32;

        curr_state.set(FieldId::MediaPlaying, is_playing);
        curr_state.set(FieldId::MediaStatus, if is_playing { "playing" } else { "paused" });
        curr_state.set(FieldId::MediaTitle, title);
        curr_state.set(FieldId::MediaArtist, artist);
        curr_state.set(FieldId::MediaAlbum, album);
        curr_state.set(FieldId::MediaDurationSec, duration);
        curr_state.set(FieldId::MediaPositionSec, pos);
        curr_state.set(FieldId::MediaPlaybackRate, 1000u64); // 1.0x
        curr_state.set(FieldId::MediaSourceApp, source_app);
        curr_state.set(FieldId::MediaControls, "play,pause,next,prev,seek");
        curr_state.set(FieldId::MediaArtId, format!("mock-art-{}", track_idx));
        curr_state.set(FieldId::MediaPalette, palette);
        curr_state.set(FieldId::MasterVolumePct, vol_pct as u64);
        curr_state.set(FieldId::MasterMute, mute);
        curr_state.set(FieldId::MediaSessionList, r#"["Spotify","Opera GX","Google Chrome","VLC Media Player"]"#);

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
