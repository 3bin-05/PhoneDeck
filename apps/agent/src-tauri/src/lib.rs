pub mod adb;
pub mod app_registry;
pub mod bridge;
pub mod commands;
pub mod discovery;
pub mod git_stats;
pub mod hub;
pub mod media_session;
pub mod net;
pub mod pairing;
pub mod rules;
pub mod sensors;
pub mod server;
pub mod shortcuts;
pub mod tls;
pub mod updater;
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
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tls::TlsManager;
use tokio_rustls::TlsAcceptor;
use updater::AgentUpdaterManager;
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
    pub media: Arc<media_session::MediaSessionManager>,
    pub app_registry: Arc<app_registry::AppRegistryManager>,
    pub updater: Arc<AgentUpdaterManager>,
    pub hub: Arc<AgentHub>,
    pub adb: Arc<adb::AdbManager>,
    pub telemetry_hub: Arc<TelemetryHub>,
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
            let media = media_session::MediaSessionManager::new(telemetry_hub.clone());
            let app_registry = app_registry::AppRegistryManager::new(telemetry_hub.clone(), media.clone());
            let updater = Arc::new(AgentUpdaterManager::new(&storage_dir, env!("CARGO_PKG_VERSION")));
            let adb_mgr = Arc::new(adb::AdbManager::new());
            adb::spawn_adb_supervisor(adb_mgr.clone(), vec![AGENT_PORT, bridge::HTTP_BRIDGE_PORT]);

            // Record startup health
            let updater_health = updater.clone();
            tauri::async_runtime::spawn(async move {
                updater_health.record_startup().await;
            });

            // Register desktop updater plugin
            #[cfg(desktop)]
            {
                if let Err(e) = app.handle().plugin(tauri_plugin_updater::Builder::new().build()) {
                    log::warn!("[Agent] Updater plugin registration note: {}", e);
                }
            }

            // Periodic auto-update check loop (every 6h with jitter)
            let updater_loop = updater.clone();
            let app_handle_for_updater = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Initial delay before first check
                tokio::time::sleep(Duration::from_secs(20)).await;
                loop {
                    let cfg = updater_loop.get_config().await;
                    if cfg.auto_update_enabled && !cfg.safe_mode {
                        let _ = updater_loop.check_for_updates(&app_handle_for_updater).await;
                    }
                    // 6 hours +- 15 minutes jitter
                    let jitter_secs = 21600 + (protocol::generate_random_bytes(1)[0] as u64 % 1800) - 900;
                    tokio::time::sleep(Duration::from_secs(jitter_secs)).await;
                }
            });

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
                media: media.clone(),
                app_registry: app_registry.clone(),
                updater: updater.clone(),
                hub: hub.clone(),
                adb: adb_mgr.clone(),
                telemetry_hub: telemetry_hub.clone(),
            };

            // Start LAN-only WSS server (axum + rustls)
            let server_state = ServerState {
                pairing: pairing_mgr,
                telemetry_hub,
                hub,
                shortcuts,
                rules,
                media,
                app_registry,
                updater: updater.clone(),
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

            // Register system tray icon on desktop
            #[cfg(desktop)]
            {
                let show_item = MenuItemBuilder::with_id("show", "Show Phone Deck").build(app)?;
                let quit_item = MenuItemBuilder::with_id("quit", "Quit Phone Deck").build(app)?;
                let tray_menu = MenuBuilder::new(app)
                    .item(&show_item)
                    .separator()
                    .item(&quit_item)
                    .build()?;

                let mut tray_builder = TrayIconBuilder::new()
                    .tooltip("Phone Deck Agent (Background)")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    });

                let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                    .ok()
                    .or_else(|| app.default_window_icon().cloned());

                if let Some(icon) = tray_icon {
                    tray_builder = tray_builder.icon(icon);
                    if let Err(e) = tray_builder.build(app) {
                        log::warn!("[Agent] Failed to build tray icon: {}", e);
                    } else {
                        log::info!("[Agent] System tray icon registered successfully");
                    }
                } else {
                    log::warn!("[Agent] No tray icon available, skipping tray builder");
                }

                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png")) {
                        let _ = window.set_icon(icon);
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
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
            commands::check_processes_running,
            commands::control_media,
            commands::get_media_state,
            commands::get_app_registry,
            commands::save_app_definition,
            commands::delete_app_definition,
            commands::get_running_processes,
            commands::test_title_parser,
            commands::execute_app_action,
            commands::get_app_runtime_states,
            commands::get_updater_status,
            commands::check_for_updates,
            commands::apply_staged_update,
            commands::set_updater_config,
            commands::mark_changelog_viewed,
            commands::get_adb_status,
            commands::adb_install_phone_apk,
            commands::adb_launch_phone_app,
            commands::get_system_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
