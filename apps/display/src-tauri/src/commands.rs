use crate::client::ConnectionStatus;
use crate::DisplayAppState;
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
