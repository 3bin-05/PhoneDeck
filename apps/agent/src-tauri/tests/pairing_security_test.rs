use agent_lib::pairing::PairingManager;
use agent_lib::server::{start_wss_server, verify_localhost_headers, ServerState};
use agent_lib::tls::TlsManager;
use axum::http::HeaderMap;
use futures_util::{SinkExt, StreamExt};
use protocol::{
    create_auth_proof, derive_client_key, AuthChallenge, AuthResponse, AuthResult, PairRequest,
    PairResponse,
};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{CertificateError, ClientConfig, DigitallySignedStruct, Error as RustlsError, SignatureScheme};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio_rustls::{TlsAcceptor, TlsConnector};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug)]
struct TestPinnedVerifier {
    expected_fp: String,
}

impl ServerCertVerifier for TestPinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        let actual_fp = protocol::compute_cert_fingerprint(end_entity.as_ref());
        if protocol::subtle_eq(&actual_fp, &self.expected_fp) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(RustlsError::InvalidCertificate(
                CertificateError::ApplicationVerificationFailure,
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

async fn create_client_tls(
    target_addr: SocketAddr,
    expected_fp: &str,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>, String> {
    let verifier = Arc::new(TestPinnedVerifier {
        expected_fp: expected_fp.to_lowercase(),
    });

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
        .map_err(|e| format!("TCP connect failed: {}", e))?;

    let server_name = ServerName::try_from("localhost".to_string())
        .map_err(|e| format!("ServerName error: {:?}", e))?;

    connector
        .connect(server_name, tcp_stream)
        .await
        .map_err(|e| format!("TLS connect error: {}", e))
}

#[tokio::test]
async fn test_pairing_tls_challenge_response_and_revocation() {
    let temp_dir = std::env::temp_dir().join(format!("phonedeck_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).unwrap();

    let tls_mgr = Arc::new(TlsManager::load_or_generate(&temp_dir, &[]).unwrap());
    let pairing_mgr = Arc::new(PairingManager::new(&temp_dir));
    let agent_id = "test-agent".to_string();

    let (valid_token, _) = pairing_mgr.get_or_refresh_token();
    let port: u16 = 18766;
    let bind_addr = SocketAddr::from(([127, 0, 0, 1], port));

    let (telemetry_hub, _) = agent_lib::sensors::TelemetryHub::new();
    let server_state = ServerState {
        pairing: pairing_mgr.clone(),
        telemetry_hub: Arc::new(telemetry_hub),
        hub: Arc::new(agent_lib::hub::AgentHub::new()),
        shortcuts: Arc::new(agent_lib::shortcuts::ShortcutManager::new()),
        rules: Arc::new(agent_lib::rules::RulesEngine::new()),
        agent_id: agent_id.clone(),
    };
    let tls_acceptor = TlsAcceptor::from(tls_mgr.server_config.clone());

    tokio::spawn(async move {
        start_wss_server(bind_addr, tls_acceptor, server_state).await.unwrap();
    });

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // 1. TEST WRONG FINGERPRINT -> REJECTED
    let wrong_fp = "0000000000000000000000000000000000000000000000000000000000000000";
    let bad_tls = create_client_tls(bind_addr, wrong_fp).await;
    assert!(bad_tls.is_err(), "Connection with wrong fingerprint MUST fail!");

    // 2. TEST VALID FINGERPRINT -> TLS HANDSHAKE SUCCEEDS
    let tls_stream = create_client_tls(bind_addr, &tls_mgr.fingerprint)
        .await
        .expect("Valid fingerprint must connect");

    let pair_req = format!("wss://127.0.0.1:{}/pair", port)
        .into_client_request()
        .unwrap();
    let (mut ws_stream, _) = tokio_tungstenite::client_async(pair_req, tls_stream)
        .await
        .expect("WS upgrade must succeed");

    // Send PairRequest with valid token
    let req = PairRequest {
        token: valid_token.clone(),
        device_id: "phone-test-1".to_string(),
        device_name: "Pixel 7 Pro".to_string(),
    };
    ws_stream
        .send(Message::Text(serde_json::to_string(&req).unwrap().into()))
        .await
        .unwrap();

    let resp_msg = ws_stream.next().await.unwrap().unwrap();
    let pair_resp: PairResponse = match resp_msg {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected text response"),
    };
    assert!(pair_resp.success, "Pairing with valid token must succeed");
    let device_key = pair_resp.device_key.expect("Device key must be issued");

    // 3. TEST TOKEN REUSE (SINGLE-USE) -> MUST FAIL
    let tls_stream2 = create_client_tls(bind_addr, &tls_mgr.fingerprint).await.unwrap();
    let pair_req2 = format!("wss://127.0.0.1:{}/pair", port).into_client_request().unwrap();
    let (mut ws_stream2, _) = tokio_tungstenite::client_async(pair_req2, tls_stream2).await.unwrap();

    let req_reuse = PairRequest {
        token: valid_token.clone(),
        device_id: "phone-test-2".to_string(),
        device_name: "Pixel 7 Pro".to_string(),
    };
    ws_stream2
        .send(Message::Text(serde_json::to_string(&req_reuse).unwrap().into()))
        .await
        .unwrap();

    let resp_msg2 = ws_stream2.next().await.unwrap().unwrap();
    let pair_resp2: PairResponse = match resp_msg2 {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected text response"),
    };
    assert!(!pair_resp2.success, "Reused pairing token MUST be rejected");

    // 4. TEST SUBSEQUENT RECONNECT WITH HMAC CHALLENGE-RESPONSE -> SUCCEEDS
    let tls_stream3 = create_client_tls(bind_addr, &tls_mgr.fingerprint).await.unwrap();
    let ws_req = format!("wss://127.0.0.1:{}/ws", port).into_client_request().unwrap();
    let (mut ws_stream3, _) = tokio_tungstenite::client_async(ws_req, tls_stream3).await.unwrap();

    // Read challenge
    let challenge_msg = ws_stream3.next().await.unwrap().unwrap();
    let challenge: AuthChallenge = match challenge_msg {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected challenge text"),
    };

    // Compute proof
    let nonce_bytes = hex::decode(&challenge.nonce).unwrap();
    let device_key_bytes = hex::decode(&device_key).unwrap();
    let client_key = derive_client_key(&device_key_bytes);
    let proof = create_auth_proof(&client_key, &nonce_bytes);

    let auth_resp = AuthResponse {
        device_id: "phone-test-1".to_string(),
        proof: hex::encode(proof),
    };
    ws_stream3
        .send(Message::Text(serde_json::to_string(&auth_resp).unwrap().into()))
        .await
        .unwrap();

    let result_msg = ws_stream3.next().await.unwrap().unwrap();
    let auth_result: AuthResult = match result_msg {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected auth result text"),
    };
    assert!(auth_result.success, "Challenge-response auth must succeed");

    // 5. TEST REVOKE DEVICE -> RECONNECT MUST BE REFUSED
    pairing_mgr.revoke_device("phone-test-1");

    let tls_stream4 = create_client_tls(bind_addr, &tls_mgr.fingerprint).await.unwrap();
    let ws_req4 = format!("wss://127.0.0.1:{}/ws", port).into_client_request().unwrap();
    let (mut ws_stream4, _) = tokio_tungstenite::client_async(ws_req4, tls_stream4).await.unwrap();

    // Read challenge
    let challenge_msg4 = ws_stream4.next().await.unwrap().unwrap();
    let challenge4: AuthChallenge = match challenge_msg4 {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected challenge text"),
    };

    let nonce_bytes4 = hex::decode(&challenge4.nonce).unwrap();
    let proof4 = create_auth_proof(&client_key, &nonce_bytes4);

    let auth_resp4 = AuthResponse {
        device_id: "phone-test-1".to_string(),
        proof: hex::encode(proof4),
    };
    ws_stream4
        .send(Message::Text(serde_json::to_string(&auth_resp4).unwrap().into()))
        .await
        .unwrap();

    let result_msg4 = ws_stream4.next().await.unwrap().unwrap();
    let auth_result4: AuthResult = match result_msg4 {
        Message::Text(t) => serde_json::from_str(&t).unwrap(),
        _ => panic!("Expected auth result text"),
    };
    assert!(!auth_result4.success, "Revoked phone MUST be refused");

    // 6. TEST LOCALHOST SECURITY: Foreign Host / Origin header rejection
    let mut bad_headers = HeaderMap::new();
    bad_headers.insert("host", "evil-website.com".parse().unwrap());
    assert!(!verify_localhost_headers(&bad_headers), "Foreign Host must be rejected");

    let mut bad_origin = HeaderMap::new();
    bad_origin.insert("host", "localhost:8766".parse().unwrap());
    bad_origin.insert("origin", "https://malicious-site.com".parse().unwrap());
    assert!(!verify_localhost_headers(&bad_origin), "Foreign Origin must be rejected");

    let mut good_headers = HeaderMap::new();
    good_headers.insert("host", "127.0.0.1:8766".parse().unwrap());
    good_headers.insert("origin", "http://localhost:5173".parse().unwrap());
    assert!(verify_localhost_headers(&good_headers), "Localhost origin must be accepted");

    let _ = std::fs::remove_dir_all(&temp_dir);
}
