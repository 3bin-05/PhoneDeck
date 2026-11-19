use crate::net::get_lan_ips;
use crate::pairing::PairedDeviceInfo;
use crate::rules::{RuleAction, RuleDefinition};
use crate::shortcuts::{InstalledApp, ShortcutItem, ShortcutManager};
use crate::AgentAppState;
use protocol::PairUri;
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct PairingStatusPayload {
    pub qr_svg: String,
    pub pair_uri: String,
    pub expires_in_seconds: u64,
    pub agent_id: String,
    pub port: u16,
    pub fingerprint: String,
    pub hosts: Vec<String>,
}

#[tauri::command]
pub fn get_pairing_status(state: State<'_, AgentAppState>) -> Result<PairingStatusPayload, String> {
    let (token, expires_in) = state.pairing.get_or_refresh_token();
    let lan_ips = get_lan_ips();
    let mut hosts = lan_ips.iter().map(|ip| ip.to_string()).collect::<Vec<_>>();
    if !hosts.iter().any(|h| h == "127.0.0.1") {
        hosts.push("127.0.0.1".to_string());
    }

    let pair_uri = PairUri {
        hosts: hosts.clone(),
        port: state.port,
        token,
        fingerprint: state.fingerprint.clone(),
        agent_id: state.agent_id.clone(),
    }
    .to_uri_string();

    let qr = QrCode::new(pair_uri.as_bytes())
        .map_err(|e| format!("Failed to generate QR code: {}", e))?;
    let qr_svg = qr.render::<svg::Color>().quiet_zone(false).build();

    Ok(PairingStatusPayload {
        qr_svg,
        pair_uri,
        expires_in_seconds: expires_in,
        agent_id: state.agent_id.clone(),
        port: state.port,
        fingerprint: state.fingerprint.clone(),
        hosts,
    })
}

#[tauri::command]
pub fn refresh_pairing_token(state: State<'_, AgentAppState>) -> Result<PairingStatusPayload, String> {
    let (token, expires_in) = state.pairing.refresh_token();
    let lan_ips = get_lan_ips();
    let mut hosts = lan_ips.iter().map(|ip| ip.to_string()).collect::<Vec<_>>();
    if !hosts.iter().any(|h| h == "127.0.0.1") {
        hosts.push("127.0.0.1".to_string());
    }

    let pair_uri = PairUri {
        hosts: hosts.clone(),
        port: state.port,
        token,
        fingerprint: state.fingerprint.clone(),
        agent_id: state.agent_id.clone(),
    }
    .to_uri_string();

    let qr = QrCode::new(pair_uri.as_bytes())
        .map_err(|e| format!("Failed to generate QR code: {}", e))?;
    let qr_svg = qr.render::<svg::Color>().quiet_zone(false).build();

    Ok(PairingStatusPayload {
        qr_svg,
        pair_uri,
        expires_in_seconds: expires_in,
        agent_id: state.agent_id.clone(),
        port: state.port,
        fingerprint: state.fingerprint.clone(),
        hosts,
    })
}

#[tauri::command]
pub fn get_paired_devices(state: State<'_, AgentAppState>) -> Vec<PairedDeviceInfo> {
    state.pairing.list_devices()
}

#[tauri::command]
pub fn revoke_device(state: State<'_, AgentAppState>, device_id: String) -> bool {
    state.pairing.revoke_device(&device_id)
}

#[tauri::command]
pub fn revoke_all_devices(state: State<'_, AgentAppState>) {
    state.pairing.revoke_all();
}

#[tauri::command]
pub async fn get_shortcuts(state: State<'_, AgentAppState>) -> Result<Vec<ShortcutItem>, String> {
    Ok(state.shortcuts.get_all().await)
}

#[tauri::command]
pub async fn save_shortcut(state: State<'_, AgentAppState>, shortcut: ShortcutItem) -> Result<(), String> {
    state.shortcuts.add_or_update(shortcut).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_shortcut(state: State<'_, AgentAppState>, id: String) -> Result<bool, String> {
    Ok(state.shortcuts.remove(&id).await)
}

#[tauri::command]
pub async fn execute_shortcut(state: State<'_, AgentAppState>, id: String) -> Result<String, String> {
    state.shortcuts.execute(&id).await
}

#[tauri::command]
pub fn scan_installed_apps() -> Vec<InstalledApp> {
    ShortcutManager::scan_installed_apps()
}

#[tauri::command]
pub async fn get_rules(state: State<'_, AgentAppState>) -> Result<Vec<RuleDefinition>, String> {
    Ok(state.rules.get_rules().await)
}

#[tauri::command]
pub async fn save_rules(state: State<'_, AgentAppState>, rules: Vec<RuleDefinition>) -> Result<(), String> {
    state.rules.set_rules(rules).await;
    Ok(())
}

#[tauri::command]
pub async fn test_rule(state: State<'_, AgentAppState>, rule_id: String) -> Result<RuleAction, String> {
    state.rules.test_rule(&rule_id).await
}

#[tauri::command]
pub fn check_processes_running(process_names: Vec<String>) -> HashMap<String, bool> {
    let mut sys = sysinfo::System::new();
    ShortcutManager::check_processes_running(&mut sys, &process_names)
}

#[tauri::command]
pub fn control_media(
    state: State<'_, AgentAppState>,
    action: String,
    param: Option<String>,
) -> Result<(), String> {
    match action.as_str() {
        "play" => state.media.play(),
        "pause" => state.media.pause(),
        "toggle" => state.media.toggle_play_pause(),
        "next" => state.media.next(),
        "prev" => state.media.prev(),
        "seek" => {
            if let Some(sec_str) = param {
                if let Ok(sec) = sec_str.parse::<u32>() {
                    state.media.seek(sec);
                }
            }
        }
        "volume" => {
            if let Some(vol_str) = param {
                if let Ok(vol) = vol_str.parse::<u8>() {
                    state.media.set_master_volume(vol);
                }
            }
        }
        "mute" => state.media.toggle_master_mute(),
        "cycle_source" => state.media.cycle_source(),
        "set_source" => state.media.set_preferred_source(param),
        _ => return Err(format!("Unknown media action: {}", action)),
    }
    Ok(())
}

#[tauri::command]
pub fn get_media_state(state: State<'_, AgentAppState>) -> Result<serde_json::Value, String> {
    let snap = state.media.snapshot.read().unwrap();
    Ok(serde_json::json!({
        "playing": snap.playing,
        "status": snap.status,
        "title": snap.title,
        "artist": snap.artist,
        "album": snap.album,
        "source_app": snap.source_app,
        "position_sec": snap.position_sec,
        "duration_sec": snap.duration_sec,
        "playback_rate": snap.playback_rate,
        "controls": snap.controls,
        "art_id": snap.art_id,
        "palette": snap.palette,
        "master_volume_pct": snap.master_volume_pct,
        "master_mute": snap.master_mute,
        "available_sessions": snap.available_sessions,
    }))
}

#[tauri::command]
pub async fn get_app_registry(
    state: State<'_, AgentAppState>,
) -> Result<Vec<crate::app_registry::AppDefinition>, String> {
    Ok(state.app_registry.get_all_apps().await)
}

#[tauri::command]
pub async fn save_app_definition(
    state: State<'_, AgentAppState>,
    app: crate::app_registry::AppDefinition,
) -> Result<(), String> {
    state.app_registry.add_or_update_app(app).await;
    Ok(())
}

#[tauri::command]
pub async fn delete_app_definition(
    state: State<'_, AgentAppState>,
    id: String,
) -> Result<bool, String> {
    Ok(state.app_registry.remove_app(&id).await)
}

#[tauri::command]
pub async fn get_running_processes(
    state: State<'_, AgentAppState>,
) -> Result<Vec<crate::app_registry::RunningProcessInfo>, String> {
    Ok(state.app_registry.detect_running_processes().await)
}

#[tauri::command]
pub fn test_title_parser(
    raw_title: String,
    parser_type: String,
    template: Option<String>,
    strip_suffix: Option<String>,
) -> serde_json::Value {
    let cfg = Some(crate::app_registry::TitleParserConfig {
        parser_type,
        template,
        strip_suffix,
    });
    let (project, file, unsaved, tab_title, audio_active) =
        crate::app_registry::AppRegistryManager::parse_title(&raw_title, &cfg, false);
    serde_json::json!({
        "project": project,
        "file": file,
        "unsaved": unsaved,
        "tab_title": tab_title,
        "audio_active": audio_active,
    })
}

#[tauri::command]
pub async fn execute_app_action(
    state: State<'_, AgentAppState>,
    app_id: String,
    action: String,
    quick_launch_id: Option<String>,
) -> Result<String, String> {
    state
        .app_registry
        .execute_action(&app_id, &action, quick_launch_id.as_deref())
        .await
}

#[tauri::command]
pub async fn get_app_runtime_states(
    state: State<'_, AgentAppState>,
) -> Result<HashMap<String, crate::app_registry::AppRuntimeState>, String> {
    Ok(state.app_registry.get_runtime_states().await)
}

#[tauri::command]
pub async fn get_updater_status(
    state: State<'_, AgentAppState>,
) -> Result<crate::updater::UpdaterStatusResponse, String> {
    Ok(state.updater.get_status().await)
}

#[tauri::command]
pub async fn check_for_updates(
    app: tauri::AppHandle,
    state: State<'_, AgentAppState>,
) -> Result<Option<String>, String> {
    state.updater.check_for_updates(&app).await
}

#[tauri::command]
pub async fn apply_staged_update(
    app: tauri::AppHandle,
    state: State<'_, AgentAppState>,
) -> Result<(), String> {
    state
        .updater
        .apply_update_with_notification(&app, &state.hub)
        .await
}

#[tauri::command]
pub async fn set_updater_config(
    state: State<'_, AgentAppState>,
    config: crate::updater::AgentUpdaterConfig,
) -> Result<(), String> {
    state.updater.save_config(config).await
}

#[tauri::command]
pub async fn mark_changelog_viewed(
    state: State<'_, AgentAppState>,
    version: String,
) -> Result<(), String> {
    let mut cfg = state.updater.get_config().await;
    cfg.changelog_viewed = Some(version);
    state.updater.save_config(cfg).await
}

#[tauri::command]
pub async fn get_adb_status(state: State<'_, AgentAppState>) -> Result<crate::adb::AdbStatus, String> {
    Ok(state.adb.get_status().await)
}

#[tauri::command]
pub async fn adb_install_phone_apk(
    device: Option<String>,
    state: State<'_, AgentAppState>,
) -> Result<String, String> {
    let devices = state.adb.query_devices().await;
    let target_device = match device {
        Some(d) => d,
        None => devices
            .first()
            .cloned()
            .ok_or_else(|| "No Android device connected over USB".to_string())?,
    };

    let candidate_paths = [
        std::path::PathBuf::from(r"D:\PhoneDeck\executable files\PhoneDeck-Display-armv7.apk"),
        std::path::PathBuf::from(r"D:\PhoneDeck\executable files\PhoneDeck-Display.apk"),
        std::path::PathBuf::from(r"D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\arm\release\app-arm-release.apk"),
        std::path::PathBuf::from(r"D:\PhoneDeck\apps\display\src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"),
    ];

    let apk = candidate_paths
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "Display APK not found on PC".to_string())?;

    state.adb.install_apk(&target_device, &apk)?;
    let _ = state.adb.launch_app(&target_device);
    Ok(format!("Installed and launched {} successfully on {}", apk.file_name().unwrap_or_default().to_string_lossy(), target_device))
}

#[tauri::command]
pub async fn adb_launch_phone_app(
    device: Option<String>,
    state: State<'_, AgentAppState>,
) -> Result<String, String> {
    let devices = state.adb.query_devices().await;
    let target_device = match device {
        Some(d) => d,
        None => devices
            .first()
            .cloned()
            .ok_or_else(|| "No Android device connected over USB".to_string())?,
    };

    state.adb.launch_app(&target_device)?;
    Ok(format!("Launched PhoneDeck Display on {}", target_device))
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemMetricsPayload {
    pub cpu_pct: f64,
    pub cpu_freq_mhz: u32,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub net_in_bytes_sec: u64,
    pub net_out_bytes_sec: u64,
    pub disk_used_bytes: u64,
    pub disk_total_bytes: u64,
    pub uptime_secs: u64,
}

#[tauri::command]
pub async fn get_system_metrics(
    state: State<'_, AgentAppState>,
) -> Result<SystemMetricsPayload, String> {
    let snapshot = state.telemetry_hub.get_current_state().await;

    let cpu_raw = snapshot
        .metrics
        .get(&protocol::fields::FieldId::CpuTotal.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cpu_pct = cpu_raw as f64 / 10.0;

    let cpu_freq_mhz = snapshot
        .metrics
        .get(&protocol::fields::FieldId::CpuFreqMhz.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let ram_used_bytes = snapshot
        .metrics
        .get(&protocol::fields::FieldId::RamUsedBytes.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let ram_total_bytes = snapshot
        .metrics
        .get(&protocol::fields::FieldId::RamTotalBytes.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let net_in_bytes_sec = snapshot
        .metrics
        .get(&protocol::fields::FieldId::NetInBytesSec.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let net_out_bytes_sec = snapshot
        .metrics
        .get(&protocol::fields::FieldId::NetOutBytesSec.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let disk_used_bytes = snapshot
        .metrics
        .get(&protocol::fields::FieldId::DiskUsedBytes.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let disk_total_bytes = snapshot
        .metrics
        .get(&protocol::fields::FieldId::DiskTotalBytes.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let uptime_secs = snapshot
        .metrics
        .get(&protocol::fields::FieldId::UptimeSeconds.id())
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Ok(SystemMetricsPayload {
        cpu_pct,
        cpu_freq_mhz,
        ram_used_bytes,
        ram_total_bytes,
        net_in_bytes_sec,
        net_out_bytes_sec,
        disk_used_bytes,
        disk_total_bytes,
        uptime_secs,
    })
}
