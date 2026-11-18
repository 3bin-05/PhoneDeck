pub mod commands;
pub mod discovery;
pub mod net;
pub mod pairing;
pub mod server;
pub mod tls;

use discovery::MdnsAdvertiser;
use net::get_lan_ips;
use pairing::PairingManager;
use server::{start_wss_server, ServerState};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tls::TlsManager;
use tokio_rustls::TlsAcceptor;

pub const AGENT_PORT: u16 = 8766;

pub struct AgentAppState {
    pub agent_id: String,
    pub fingerprint: String,
    pub port: u16,
    pub pairing: Arc<PairingManager>,
    pub tls: Arc<TlsManager>,
    pub storage_dir: PathBuf,
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

            let app_state = AgentAppState {
                agent_id: agent_id.clone(),
                fingerprint: tls_mgr.fingerprint.clone(),
                port: AGENT_PORT,
                pairing: pairing_mgr.clone(),
                tls: tls_mgr.clone(),
                storage_dir,
            };

            // Start LAN-only WSS server (axum + rustls)
            let server_state = ServerState {
                pairing: pairing_mgr,
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
            commands::revoke_all_devices
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
