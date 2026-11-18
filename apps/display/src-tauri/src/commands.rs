use crate::client::ConnectionStatus;
use crate::updater::{DisplayUpdateStatus, DisplayUpdaterConfig};
use crate::DisplayAppState;
use protocol::updater::AndroidReleaseManifest;
use tauri::State;

#[tauri::command]
pub async fn pair_with_uri(
    state: State<'_, DisplayAppState>,
    pair_uri: String,
    device_name: Option<String>,
) -> Result<ConnectionStatus, String> {
    let name = device_name.unwrap_or_else(|| "Phone Deck Display".to_string());
    let device_id = state.device_id.clone();

    match state.client_mgr.pair_with_uri(&pair_uri, device_id, name).await {
        Ok(config) => {
            let mut status = state.status.lock().unwrap();
            status.paired = true;
            status.agent_id = Some(config.agent_id);
            status.error = None;
            Ok(status.clone())
        }
        Err(e) => {
            let mut status = state.status.lock().unwrap();
            status.error = Some(e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub fn get_connection_status(state: State<'_, DisplayAppState>) -> ConnectionStatus {
    let status = state.status.lock().unwrap();
    status.clone()
}

#[tauri::command]
pub fn unpair_device(state: State<'_, DisplayAppState>) -> bool {
    state.client_mgr.clear_config();
    let mut status = state.status.lock().unwrap();
    status.paired = false;
    status.connected = false;
    status.agent_id = None;
    status.active_host = None;
    status.error = None;
    true
}

#[tauri::command]
pub fn get_display_updater_status(state: State<'_, DisplayAppState>) -> DisplayUpdateStatus {
    state.updater.get_status()
}

#[tauri::command]
pub fn get_display_updater_config(state: State<'_, DisplayAppState>) -> DisplayUpdaterConfig {
    state.updater.get_config()
}

#[tauri::command]
pub fn set_display_updater_config(
    state: State<'_, DisplayAppState>,
    config: DisplayUpdaterConfig,
) -> bool {
    state.updater.update_config(config);
    true
}

#[tauri::command]
pub async fn check_display_updates(
    state: State<'_, DisplayAppState>,
    current_abi: Option<String>,
) -> Result<Option<AndroidReleaseManifest>, String> {
    let (lan_host, lan_port) = {
        let status = state.status.lock().unwrap();
        if let Some(ref host_addr) = status.active_host {
            let parts: Vec<&str> = host_addr.split(':').collect();
            let host = parts.first().copied();
            let port = parts.get(1).and_then(|p| p.parse::<u16>().ok());
            (host.map(|s| s.to_string()), port)
        } else {
            (None, None)
        }
    };

    let abi = current_abi.unwrap_or_else(|| "arm64-v8a".to_string());
    state
        .updater
        .check_for_updates(lan_host.as_deref(), lan_port, &abi)
        .await
}

#[tauri::command]
pub async fn download_display_update(state: State<'_, DisplayAppState>) -> Result<String, String> {
    let path = state.updater.download_selected_apk().await?;
    Ok(path.to_string_lossy().to_string())
}
