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
    let hosts = lan_ips.iter().map(|ip| ip.to_string()).collect::<Vec<_>>();

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
    let hosts = lan_ips.iter().map(|ip| ip.to_string()).collect::<Vec<_>>();

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
