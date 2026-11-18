use crate::net::get_lan_ips;
use crate::pairing::PairedDeviceInfo;
use crate::AgentAppState;
use protocol::PairUri;
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Serialize;
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
