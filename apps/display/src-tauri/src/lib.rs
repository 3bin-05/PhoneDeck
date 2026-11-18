pub mod client;
pub mod commands;
pub mod tls_verifier;

use client::{ConnectionStatus, DisplayClientManager};
use futures_util::StreamExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct DisplayAppState {
    pub device_id: String,
    pub client_mgr: Arc<DisplayClientManager>,
    pub status: Arc<Mutex<ConnectionStatus>>,
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

            let client_mgr = Arc::new(DisplayClientManager::new(&storage_dir));
            let saved_config = client_mgr.load_config();

            let device_id = format!("device-{}", &protocol::generate_nonce()[0..8]);

            let initial_status = ConnectionStatus {
                paired: saved_config.is_some(),
                connected: false,
                agent_id: saved_config.as_ref().map(|c| c.agent_id.clone()),
                active_host: None,
                error: None,
            };

            let status = Arc::new(Mutex::new(initial_status));

            // Background automatic reconnect loop if previously paired
            if let Some(config) = saved_config {
                let client = client_mgr.clone();
                let status_clone = status.clone();

                tauri::async_runtime::spawn(async move {
                    log::info!("[Display] Starting background reconnect loop to {}", config.agent_id);
                    loop {
                        match client.authenticate(&config).await {
                            Ok((mut ws, addr)) => {
                                {
                                    let mut s = status_clone.lock().unwrap();
                                    s.connected = true;
                                    s.active_host = Some(addr.to_string());
                                    s.error = None;
                                }
                                log::info!("[Display] Connected and streaming with {}", addr);

                                // Read loop
                                while let Some(msg) = ws.next().await {
                                    if msg.is_err() {
                                        break;
                                    }
                                }

                                {
                                    let mut s = status_clone.lock().unwrap();
                                    s.connected = false;
                                }
                            }
                            Err(e) => {
                                {
                                    let mut s = status_clone.lock().unwrap();
                                    s.connected = false;
                                    s.error = Some(e.clone());
                                }
                                log::warn!("[Display] Reconnect failed: {}. Retrying in 3s...", e);
                                tokio::time::sleep(std::time::Duration::from_millis(3000)).await;
                            }
                        }
                    }
                });
            }

            let app_state = DisplayAppState {
                device_id,
                client_mgr,
                status,
            };

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pair_with_uri,
            commands::get_connection_status,
            commands::unpair_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
