pub mod bridge;
pub mod commands;
pub mod discovery;
pub mod git_stats;
pub mod hub;
pub mod net;
pub mod pairing;
pub mod rules;
pub mod sensors;
pub mod server;
pub mod shortcuts;
pub mod tls;
pub mod watcher;

use bridge::{start_http_bridge, BridgeState};
use discovery::MdnsAdvertiser;
use hub::AgentHub;
use net::get_lan_ips;
use pairing::PairingManager;
use rules::RulesEngine;
use sensors::{spawn_sampler_thread, TelemetryHub};
use server::{start_wss_server, ServerState};
use shortcuts::ShortcutManager;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tls::TlsManager;
use tokio_rustls::TlsAcceptor;
use watcher::spawn_session_watcher;

pub const AGENT_PORT: u16 = 8766;

pub struct AgentAppState {
    pub agent_id: String,
    pub fingerprint: String,
    pub port: u16,
    pub pairing: Arc<PairingManager>,
    pub tls: Arc<TlsManager>,
    pub storage_dir: PathBuf,
    pub shortcuts: Arc<ShortcutManager>,
    pub rules: Arc<RulesEngine>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let storage_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./data"));
            let _ = std::fs::create_dir_all(&storage_dir);

            let lan_ips = get_lan_ips();
            log::info!("[Agent] Discovered LAN IPs: {:?}", lan_ips);

            // Generate or load TLS cert & keys
            let tls_mgr = Arc::new(
                TlsManager::load_or_generate(&storage_dir, &lan_ips)
                    .expect("Failed to initialize TLS certificate"),
            );

            let pairing_mgr = Arc::new(PairingManager::new(&storage_dir));
            let agent_id = "phone-deck-pc".to_string();

            // Initialize TelemetryHub & spawn adaptive sampler thread
            let (telemetry_hub, _rx) = TelemetryHub::new();
            let telemetry_hub = Arc::new(telemetry_hub);
            spawn_sampler_thread(telemetry_hub.clone());

            // Initialize AI Agent Hub & local HTTP bridge
            let hub = Arc::new(AgentHub::new());
            spawn_session_watcher(hub.clone());

            // Initialize Shortcuts & Rules Engines
            let shortcuts = Arc::new(ShortcutManager::new());
            let rules = Arc::new(RulesEngine::new());

            // Forward hub events into rules engine
            let mut event_sub = hub.event_tx.subscribe();
            let rules_for_events = rules.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(event) = event_sub.recv().await {
                    rules_for_events.evaluate_event(&event).await;
                }
            });

            let bridge_state = BridgeState {
                hub: hub.clone(),
                telemetry_hub: telemetry_hub.clone(),
                shortcuts: shortcuts.clone(),
                rules: rules.clone(),
            };
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_http_bridge(bridge_state).await {
                    log::error!("[Agent] Local HTTP bridge error: {}", e);
                }
            });

            let app_state = AgentAppState {
                agent_id: agent_id.clone(),
                fingerprint: tls_mgr.fingerprint.clone(),
                port: AGENT_PORT,
                pairing: pairing_mgr.clone(),
                tls: tls_mgr.clone(),
                storage_dir,
                shortcuts: shortcuts.clone(),
                rules: rules.clone(),
            };

            // Start LAN-only WSS server (axum + rustls)
            let server_state = ServerState {
                pairing: pairing_mgr,
                telemetry_hub,
                hub,
                shortcuts,
                rules,
                agent_id: agent_id.clone(),
            };
            let tls_acceptor = TlsAcceptor::from(tls_mgr.server_config.clone());
            let bind_addr = SocketAddr::from(([0, 0, 0, 0], AGENT_PORT));

            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_wss_server(bind_addr, tls_acceptor, server_state).await {
                    log::error!("[Agent] WSS Server error: {}", e);
                }
            });

            // Advertise service via mDNS
            let fp = tls_mgr.fingerprint.clone();
            tauri::async_runtime::spawn(async move {
                match MdnsAdvertiser::start(&agent_id, AGENT_PORT, &fp) {
                    Ok(_advertiser) => {
                        log::info!("[Agent] mDNS advertisement active");
                    }
                    Err(e) => {
                        log::warn!("[Agent] mDNS advertising failed: {}", e);
                    }
                }
            });

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_pairing_status,
            commands::refresh_pairing_token,
            commands::get_paired_devices,
            commands::revoke_device,
            commands::revoke_all_devices,
            commands::get_shortcuts,
            commands::save_shortcut,
            commands::delete_shortcut,
            commands::execute_shortcut,
            commands::scan_installed_apps,
            commands::get_rules,
            commands::save_rules,
            commands::test_rule,
            commands::check_processes_running
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
