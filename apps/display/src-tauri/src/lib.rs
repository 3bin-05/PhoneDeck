pub mod client;
pub mod commands;
pub mod tls_verifier;
pub mod updater;

use client::{ConnectionStatus, DisplayClientManager};
use futures_util::StreamExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use updater::DisplayUpdater;

pub struct DisplayAppState {
    pub device_id: String,
    pub client_mgr: Arc<DisplayClientManager>,
    pub status: Arc<Mutex<ConnectionStatus>>,
    pub updater: Arc<DisplayUpdater>,
    pub action_tx: Arc<tokio::sync::Mutex<Option<tokio::sync::mpsc::UnboundedSender<String>>>>,
    pub reconnect_notify: Arc<tokio::sync::Notify>,
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
            let updater = Arc::new(DisplayUpdater::new(&storage_dir));
            let action_tx = Arc::new(tokio::sync::Mutex::new(None));
            let reconnect_notify = Arc::new(tokio::sync::Notify::new());

            let device_id = format!("device-{}", &protocol::generate_nonce()[0..8]);

            let initial_status = ConnectionStatus {
                paired: saved_config.is_some(),
                connected: false,
                agent_id: saved_config.as_ref().map(|c| c.agent_id.clone()),
                active_host: None,
                error: None,
                protocol_incompatible: false,
            };

            let status = Arc::new(Mutex::new(initial_status));

            // Background automatic reconnect loop
            let client = client_mgr.clone();
            let status_clone = status.clone();
            let reconnect_notify_loop = reconnect_notify.clone();
            let action_tx_holder = action_tx.clone();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                loop {
                    let config_opt = client.load_config();
                    let config = match config_opt {
                        Some(c) => c,
                        None => {
                            log::info!("[Display] Waiting for pairing configuration...");
                            reconnect_notify_loop.notified().await;
                            continue;
                        }
                    };

                    log::info!("[Display] Attempting connection to {}", config.agent_id);
                    match client.authenticate(&config).await {
                        Ok((ws, addr)) => {
                            let (mut ws_sender, mut ws_receiver) = ws.split();
                            let (act_tx, mut act_rx) =
                                tokio::sync::mpsc::unbounded_channel::<String>();
                            {
                                let mut holder = action_tx_holder.lock().await;
                                *holder = Some(act_tx);
                            }

                            {
                                let mut s = status_clone.lock().unwrap();
                                s.connected = true;
                                s.active_host = Some(addr.to_string());
                                s.error = None;
                                let _ = app_handle.emit("deck-status", &*s);
                            }
                            log::info!("[Display] Connected and streaming with {}", addr);

                            let send_task = tokio::spawn(async move {
                                use futures_util::SinkExt;
                                while let Some(msg_text) = act_rx.recv().await {
                                    if ws_sender
                                        .send(tokio_tungstenite::tungstenite::Message::Text(
                                            msg_text.into(),
                                        ))
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
                                }
                            });

                            let app_handle_recv = app_handle.clone();
                            while let Some(msg_res) = ws_receiver.next().await {
                                match msg_res {
                                    Ok(tokio_tungstenite::tungstenite::Message::Binary(bytes)) => {
                                        let _ = app_handle_recv.emit("deck-payload", bytes.to_vec());
                                    }
                                    Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                                        let _ = app_handle_recv.emit("deck-text", text.to_string());
                                    }
                                    Err(e) => {
                                        log::warn!("[Display] Socket read error: {}", e);
                                        break;
                                    }
                                    _ => {}
                                }
                            }

                            send_task.abort();
                            {
                                let mut holder = action_tx_holder.lock().await;
                                *holder = None;
                            }

                            {
                                let mut s = status_clone.lock().unwrap();
                                s.connected = false;
                                let _ = app_handle.emit("deck-status", &*s);
                            }
                            log::warn!(
                                "[Display] Disconnected from {}. Reconnecting in 3s...",
                                addr
                            );
                            tokio::select! {
                                _ = tokio::time::sleep(std::time::Duration::from_millis(3000)) => {}
                                _ = reconnect_notify_loop.notified() => {}
                            }
                        }
                        Err(e) => {
                            let is_incompatible = e.contains("PROTOCOL_INCOMPATIBLE");
                            {
                                let mut s = status_clone.lock().unwrap();
                                s.connected = false;
                                s.error = Some(e.clone());
                                s.protocol_incompatible = is_incompatible;
                                let _ = app_handle.emit("deck-status", &*s);
                            }
                            if is_incompatible {
                                log::error!(
                                    "[Display] Protocol incompatible: {}. Retrying in 10s...",
                                    e
                                );
                                tokio::select! {
                                    _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {}
                                    _ = reconnect_notify_loop.notified() => {}
                                }
                            } else {
                                log::warn!("[Display] Connect failed: {}. Retrying in 3s...", e);
                                tokio::select! {
                                    _ = tokio::time::sleep(std::time::Duration::from_millis(3000)) => {}
                                    _ = reconnect_notify_loop.notified() => {}
                                }
                            }
                        }
                    }
                }
            });

            // Periodic auto-update check loop (every 6 hours with jitter)
            let updater_loop = updater.clone();
            let status_loop = status.clone();
            tauri::async_runtime::spawn(async move {
                // Initial delay on launch: 10s
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                loop {
                    let should_check = {
                        let cfg = updater_loop.get_config();
                        cfg.auto_update
                    };

                    if should_check {
                        let (lan_host, lan_port) = {
                            let s = status_loop.lock().unwrap();
                            if let Some(ref host_addr) = s.active_host {
                                let parts: Vec<&str> = host_addr.split(':').collect();
                                let host = parts.first().copied();
                                let port = parts.get(1).and_then(|p| p.parse::<u16>().ok());
                                (host.map(|h| h.to_string()), port)
                            } else {
                                (None, None)
                            }
                        };

                        log::info!("[DisplayUpdater] Running periodic background update check");
                        let _ = updater_loop
                            .check_for_updates(lan_host.as_deref(), lan_port, "arm64-v8a")
                            .await;
                    }

                    // Sleep 6 hours ± 15 mins jitter
                    let jitter_secs = 21600 + (rand_jitter_secs() % 1800);
                    tokio::time::sleep(std::time::Duration::from_secs(jitter_secs)).await;
                }
            });

            let app_state = DisplayAppState {
                device_id,
                client_mgr,
                status,
                updater,
                action_tx,
                reconnect_notify,
            };

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pair_with_uri,
            commands::get_connection_status,
            commands::send_deck_action,
            commands::unpair_device,
            commands::get_display_updater_status,
            commands::get_display_updater_config,
            commands::set_display_updater_config,
            commands::check_display_updates,
            commands::download_display_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

fn rand_jitter_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    (now % 1800) as u64
}
