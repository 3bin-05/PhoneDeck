use crate::tls_verifier::PinnedFingerprintVerifier;
use futures_util::{SinkExt, StreamExt};
use protocol::{
    create_auth_proof, derive_client_key, AuthChallenge, AuthResponse, AuthResult, PairRequest,
    PairResponse, PairUri,
};
use rustls::pki_types::ServerName;
use rustls::ClientConfig;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{client_async, WebSocketStream};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayConfig {
    pub agent_id: String,
    pub hosts: Vec<String>,
    pub port: u16,
    pub fingerprint: String,
    pub device_id: String,
    pub device_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub paired: bool,
    pub connected: bool,
    pub agent_id: Option<String>,
    pub active_host: Option<String>,
    pub error: Option<String>,
}

pub struct DisplayClientManager {
    storage_path: PathBuf,
}

impl DisplayClientManager {
    pub fn new(storage_dir: &Path) -> Self {
        Self {
            storage_path: storage_dir.join("display_config.json"),
        }
    }

    pub fn load_config(&self) -> Option<DisplayConfig> {
        if self.storage_path.exists() {
            let content = fs::read_to_string(&self.storage_path).ok()?;
            serde_json::from_str(&content).ok()
        } else {
            None
        }
    }

    pub fn save_config(&self, config: &DisplayConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(&self.storage_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_config(&self) {
        let _ = fs::remove_file(&self.storage_path);
    }

    /// Pair with agent by parsing pairing URI and performing TLS handshake with pinned fingerprint.
    pub async fn pair_with_uri(
        &self,
        pair_uri_str: &str,
        device_id: String,
        device_name: String,
    ) -> Result<DisplayConfig, String> {
        let uri = PairUri::parse(pair_uri_str)?;
        log::info!(
            "[Display/Pair] Initiating pairing with agent {} on port {}",
            uri.agent_id,
            uri.port
        );

        // Race candidate hosts
        let target_addr = race_candidate_hosts(&uri.hosts, uri.port).await?;
        log::info!("[Display/Pair] Won host race: {}", target_addr);

        // Build rustls client config with pinned fingerprint
        let verifier = PinnedFingerprintVerifier::new(&uri.fingerprint);
        let mut client_config = ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("{:?}", e))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

        client_config.alpn_protocols = vec![b"http/1.1".to_vec()];

        let connector = TlsConnector::from(Arc::new(client_config));
        let tcp_stream = TcpStream::connect(target_addr)
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;

        let server_name = ServerName::try_from("localhost".to_string())
            .map_err(|e| format!("ServerName error: {:?}", e))?;

        let tls_stream = connector
            .connect(server_name, tcp_stream)
            .await
            .map_err(|e| format!("TLS handshake failed (possible fingerprint mismatch): {}", e))?;

        let pair_ws_url = format!("wss://{}:{}/pair", target_addr.ip(), uri.port);
        let request = pair_ws_url
            .into_client_request()
            .map_err(|e| format!("Invalid WS request: {}", e))?;

        let (mut ws_stream, _) = client_async(request, tls_stream)
            .await
            .map_err(|e| format!("WebSocket upgrade failed: {}", e))?;

        // Send PairRequest
        let req = PairRequest {
            token: uri.token.clone(),
            device_id: device_id.clone(),
            device_name,
        };
        let req_json = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        ws_stream
            .send(Message::Text(req_json.into()))
            .await
            .map_err(|e| format!("Send pair request failed: {}", e))?;

        // Await PairResponse
        let resp_msg = ws_stream
            .next()
            .await
            .ok_or_else(|| "Connection closed before pair response".to_string())?
            .map_err(|e| format!("Read pair response failed: {}", e))?;

        let pair_resp: PairResponse = match resp_msg {
            Message::Text(text) => serde_json::from_str(&text).map_err(|e| e.to_string())?,
            Message::Binary(bytes) => {
                protocol::from_msgpack(&bytes).map_err(|e| e.to_string())?
            }
            _ => return Err("Unexpected WebSocket message type for pairing".to_string()),
        };

        if !pair_resp.success {
            return Err(pair_resp
                .error
                .unwrap_or_else(|| "Pairing refused by agent".to_string()));
        }

        let device_key = pair_resp
            .device_key
            .ok_or_else(|| "Pairing succeeded but no device key returned".to_string())?;

        let config = DisplayConfig {
            agent_id: uri.agent_id,
            hosts: uri.hosts,
            port: uri.port,
            fingerprint: uri.fingerprint,
            device_id,
            device_key,
        };

        self.save_config(&config)?;
        log::info!("[Display/Pair] Pairing completed and saved successfully!");

        Ok(config)
    }

    /// Authenticate with agent using HMAC challenge-response.
    pub async fn authenticate(
        &self,
        config: &DisplayConfig,
    ) -> Result<(WebSocketStream<tokio_rustls::client::TlsStream<TcpStream>>, SocketAddr), String> {
        let target_addr = race_candidate_hosts(&config.hosts, config.port).await?;

        let verifier = PinnedFingerprintVerifier::new(&config.fingerprint);
        let mut client_config = ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("{:?}", e))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

        client_config.alpn_protocols = vec![b"http/1.1".to_vec()];

        let connector = TlsConnector::from(Arc::new(client_config));
        let tcp_stream = TcpStream::connect(target_addr)
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;

        let server_name = ServerName::try_from("localhost".to_string())
            .map_err(|e| format!("ServerName error: {:?}", e))?;

        let tls_stream = connector
            .connect(server_name, tcp_stream)
            .await
            .map_err(|e| format!("TLS handshake failed: {}", e))?;

        let ws_url = format!("wss://{}:{}/ws", target_addr.ip(), config.port);
        let request = ws_url
            .into_client_request()
            .map_err(|e| format!("Invalid WS request: {}", e))?;

        let (mut ws_stream, _) = client_async(request, tls_stream)
            .await
            .map_err(|e| format!("WebSocket upgrade failed: {}", e))?;

        // 1. Receive AuthChallenge { nonce }
        let challenge_msg = ws_stream
            .next()
            .await
            .ok_or_else(|| "Connection closed before auth challenge".to_string())?
            .map_err(|e| format!("Read auth challenge failed: {}", e))?;

        let challenge: AuthChallenge = match challenge_msg {
            Message::Text(text) => serde_json::from_str(&text).map_err(|e| e.to_string())?,
            Message::Binary(bytes) => {
                protocol::from_msgpack(&bytes).map_err(|e| e.to_string())?
            }
            _ => return Err("Unexpected message for challenge".to_string()),
        };

        // 2. Compute proof using SCRAM HMAC-SHA256
        let nonce_bytes = hex::decode(&challenge.nonce).map_err(|e| e.to_string())?;
        let device_key_bytes = hex::decode(&config.device_key).map_err(|e| e.to_string())?;
        let client_key = derive_client_key(&device_key_bytes);
        let proof = create_auth_proof(&client_key, &nonce_bytes);
        let proof_hex = hex::encode(proof);

        // 3. Send AuthResponse
        let auth_resp = AuthResponse {
            device_id: config.device_id.clone(),
            proof: proof_hex,
        };
        ws_stream
            .send(Message::Text(serde_json::to_string(&auth_resp).unwrap().into()))
            .await
            .map_err(|e| format!("Send auth response failed: {}", e))?;

        // 4. Receive AuthResult
        let result_msg = ws_stream
            .next()
            .await
            .ok_or_else(|| "Connection closed before auth result".to_string())?
            .map_err(|e| format!("Read auth result failed: {}", e))?;

        let result: AuthResult = match result_msg {
            Message::Text(text) => serde_json::from_str(&text).map_err(|e| e.to_string())?,
            Message::Binary(bytes) => {
                protocol::from_msgpack(&bytes).map_err(|e| e.to_string())?
            }
            _ => return Err("Unexpected message for auth result".to_string()),
        };

        if !result.success {
            return Err(result
                .error
                .unwrap_or_else(|| "Device authentication rejected or device revoked".to_string()));
        }

        log::info!("[Display/Auth] Challenge-response authentication succeeded!");
        Ok((ws_stream, target_addr))
    }
}

/// Race TCP connection attempts to candidate hosts with exponential backoff & jitter.
pub async fn race_candidate_hosts(hosts: &[String], port: u16) -> Result<SocketAddr, String> {
    if hosts.is_empty() {
        return Err("No candidate hosts to connect to".to_string());
    }

    // Try all hosts concurrently with timeout
    let mut tasks = Vec::new();
    for host in hosts {
        let host_clone = host.clone();
        tasks.push(tokio::spawn(async move {
            let addr_str = format!("{}:{}", host_clone, port);
            match tokio::time::timeout(Duration::from_millis(1500), TcpStream::connect(&addr_str)).await {
                Ok(Ok(stream)) => stream.peer_addr().ok(),
                _ => None,
            }
        }));
    }

    for task in tasks {
        if let Ok(Some(addr)) = task.await {
            return Ok(addr);
        }
    }

    Err(format!(
        "Failed to reach agent on any candidate IP ({:?}:{})",
        hosts, port
    ))
}
