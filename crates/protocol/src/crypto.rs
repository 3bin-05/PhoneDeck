use ring::digest::{digest, SHA256};
use ring::hmac::{Key, HMAC_SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

/// URI scheme prefix for Phone Deck pairing QR codes.
pub const PAIRING_SCHEME: &str = "phonedeck://pair";

/// Parsed representation of `phonedeck://pair?h=<ips>&p=<port>&t=<token>&fp=<fingerprint>&id=<agent_id>`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PairUri {
    /// Comma-separated list of agent IP addresses
    pub hosts: Vec<String>,
    /// Port of the agent WSS server
    pub port: u16,
    /// 120-second single-use pairing token
    pub token: String,
    /// SHA-256 fingerprint of the agent's self-signed TLS cert (hex encoded)
    pub fingerprint: String,
    /// Unique agent identifier
    pub agent_id: String,
}

impl PairUri {
    /// Serialize to the canonical URI string.
    pub fn to_uri_string(&self) -> String {
        format!(
            "{}?h={}&p={}&t={}&fp={}&id={}",
            PAIRING_SCHEME,
            self.hosts.join(","),
            self.port,
            self.token,
            self.fingerprint,
            self.agent_id
        )
    }

    /// Parse from a `phonedeck://pair?...` URI string.
    pub fn parse(uri: &str) -> Result<Self, String> {
        let trimmed = uri.trim();
        let query_str = if let Some(stripped) = trimmed.strip_prefix(PAIRING_SCHEME) {
            if let Some(q) = stripped.strip_prefix('?') {
                q
            } else {
                return Err("Missing query parameters in pairing URI".to_string());
            }
        } else {
            return Err("Invalid URI scheme (expected phonedeck://pair)".to_string());
        };

        let mut params = HashMap::new();
        for pair in query_str.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                params.insert(k.trim(), v.trim());
            }
        }

        let hosts_raw = params
            .get("h")
            .ok_or_else(|| "Missing 'h' (hosts) parameter".to_string())?;
        let hosts = hosts_raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();

        if hosts.is_empty() {
            return Err("At least one host IP must be specified".to_string());
        }

        let port = params
            .get("p")
            .ok_or_else(|| "Missing 'p' (port) parameter".to_string())?
            .parse::<u16>()
            .map_err(|e| format!("Invalid port number: {}", e))?;

        let token = params
            .get("t")
            .ok_or_else(|| "Missing 't' (token) parameter".to_string())?
            .to_string();

        let fingerprint = params
            .get("fp")
            .ok_or_else(|| "Missing 'fp' (fingerprint) parameter".to_string())?
            .to_lowercase();

        let agent_id = params
            .get("id")
            .ok_or_else(|| "Missing 'id' (agent_id) parameter".to_string())?
            .to_string();

        Ok(Self {
            hosts,
            port,
            token,
            fingerprint,
            agent_id,
        })
    }
}

/// Request sent by phone to agent when presenting the single-use pairing token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PairRequest {
    pub token: String,
    pub device_id: String,
    pub device_name: String,
}

/// Response returned by agent upon pairing verification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PairResponse {
    pub success: bool,
    /// 256-bit device key hex encoded, issued once and never sent again
    pub device_key: Option<String>,
    pub error: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Challenge issued by agent to client on subsequent connections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AuthChallenge {
    pub nonce: String,
    #[serde(default)]
    pub protocol_version: u32,
    #[serde(default)]
    pub min_compatible_version: u32,
    #[serde(default)]
    pub agent_version: String,
}

impl AuthChallenge {
    pub fn new(nonce: String) -> Self {
        Self {
            nonce,
            protocol_version: crate::PROTOCOL_VERSION,
            min_compatible_version: crate::MIN_COMPATIBLE_VERSION,
            agent_version: "0.1.0".to_string(),
        }
    }
}

/// Client proof computed using HMAC-SHA256 and client key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AuthResponse {
    pub device_id: String,
    pub proof: String,
    #[serde(default)]
    pub client_protocol_version: u32,
    #[serde(default)]
    pub client_version: String,
    #[serde(default)]
    pub version_code: u64,
}

impl AuthResponse {
    pub fn new(device_id: String, proof: String) -> Self {
        Self {
            device_id,
            proof,
            client_protocol_version: crate::PROTOCOL_VERSION,
            client_version: "0.1.0".to_string(),
            version_code: 100,
        }
    }
}

/// Authentication result returned to client.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AuthResult {
    pub success: bool,
    pub error: Option<String>,
    #[serde(default = "default_true")]
    pub protocol_compatible: bool,
    #[serde(default)]
    pub agent_protocol_version: u32,
    #[serde(default)]
    pub min_compatible_version: u32,
}

impl AuthResult {
    pub fn ok() -> Self {
        Self {
            success: true,
            error: None,
            protocol_compatible: true,
            agent_protocol_version: crate::PROTOCOL_VERSION,
            min_compatible_version: crate::MIN_COMPATIBLE_VERSION,
        }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(msg.into()),
            protocol_compatible: true,
            agent_protocol_version: crate::PROTOCOL_VERSION,
            min_compatible_version: crate::MIN_COMPATIBLE_VERSION,
        }
    }
}

/// Generate cryptographically secure random bytes.
pub fn generate_random_bytes(len: usize) -> Vec<u8> {
    let rng = SystemRandom::new();
    let mut bytes = vec![0u8; len];
    rng.fill(&mut bytes).expect("SystemRandom failed");
    bytes
}

/// Generate a 16-byte random pairing token (hex-encoded string).
pub fn generate_pairing_token() -> String {
    let bytes = generate_random_bytes(16);
    hex::encode(bytes)
}

/// Generate a 32-byte (256-bit) device key (hex-encoded string).
pub fn generate_device_key() -> String {
    let bytes = generate_random_bytes(32);
    hex::encode(bytes)
}

/// Generate a 32-byte random challenge nonce (hex-encoded string).
pub fn generate_nonce() -> String {
    let bytes = generate_random_bytes(32);
    hex::encode(bytes)
}

/// Compute SHA-256 fingerprint of DER certificate bytes (lowercase hex).
pub fn compute_cert_fingerprint(cert_der: &[u8]) -> String {
    let d = digest(&SHA256, cert_der);
    hex::encode(d.as_ref())
}

/// Constant-time verification of certificate fingerprint.
pub fn verify_cert_fingerprint(cert_der: &[u8], expected_hex: &str) -> bool {
    let actual = compute_cert_fingerprint(cert_der);
    subtle_eq(&actual, &expected_hex.to_lowercase())
}

/// Constant time slice comparison to prevent timing attacks.
pub fn subtle_eq_bytes(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut res = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        res |= x ^ y;
    }
    res == 0
}

/// Constant time string comparison to prevent timing attacks.
pub fn subtle_eq(a: &str, b: &str) -> bool {
    subtle_eq_bytes(a.as_bytes(), b.as_bytes())
}

/// Derives `ClientKey` from `device_key` via HMAC-SHA256.
/// `ClientKey = HMAC(device_key, b"PhoneDeckClientKey")`
pub fn derive_client_key(device_key: &[u8]) -> [u8; 32] {
    let key = Key::new(HMAC_SHA256, device_key);
    let tag = ring::hmac::sign(&key, b"PhoneDeckClientKey");
    let mut out = [0u8; 32];
    out.copy_from_slice(tag.as_ref());
    out
}

/// Derives `StoredKey` from `client_key` via SHA-256.
/// The agent stores ONLY `StoredKey`, never `device_key` or `ClientKey`.
/// `StoredKey = SHA256(ClientKey)`
pub fn derive_stored_key(client_key: &[u8; 32]) -> [u8; 32] {
    let d = digest(&SHA256, client_key);
    let mut out = [0u8; 32];
    out.copy_from_slice(d.as_ref());
    out
}

/// Creates SCRAM-style client proof for challenge-response.
/// `auth_mask = HMAC(StoredKey, nonce)`
/// `proof = ClientKey XOR auth_mask`
pub fn create_auth_proof(client_key: &[u8; 32], nonce: &[u8]) -> [u8; 32] {
    let stored_key = derive_stored_key(client_key);
    let key = Key::new(HMAC_SHA256, &stored_key);
    let auth_mask = ring::hmac::sign(&key, nonce);

    let mut proof = [0u8; 32];
    for i in 0..32 {
        proof[i] = client_key[i] ^ auth_mask.as_ref()[i];
    }
    proof
}

/// Verifies client proof on the agent using ONLY `stored_key` and `nonce`.
/// `auth_mask = HMAC(StoredKey, nonce)`
/// `recovered_client_key = proof XOR auth_mask`
/// Checks `SHA256(recovered_client_key) == stored_key`.
pub fn verify_auth_proof(stored_key: &[u8; 32], nonce: &[u8], proof: &[u8; 32]) -> bool {
    let key = Key::new(HMAC_SHA256, stored_key);
    let auth_mask = ring::hmac::sign(&key, nonce);

    let mut recovered_client_key = [0u8; 32];
    for i in 0..32 {
        recovered_client_key[i] = proof[i] ^ auth_mask.as_ref()[i];
    }

    let actual_stored_key = derive_stored_key(&recovered_client_key);
    subtle_eq_bytes(&actual_stored_key, stored_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pair_uri_roundtrip() {
        let uri = PairUri {
            hosts: vec!["192.168.1.100".to_string(), "10.0.0.5".to_string()],
            port: 8766,
            token: "0123456789abcdef".to_string(),
            fingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            agent_id: "deck-agent-pc1".to_string(),
        };

        let uri_str = uri.to_uri_string();
        let parsed = PairUri::parse(&uri_str).expect("parse failed");
        assert_eq!(uri, parsed);
    }

    #[test]
    fn test_challenge_response_authentication() {
        // Agent generates 32-byte device key upon pairing
        let device_key = generate_random_bytes(32);

        // Phone derives and stores client_key
        let client_key = derive_client_key(&device_key);

        // Agent derives and stores stored_key (agent never stores device_key!)
        let stored_key = derive_stored_key(&client_key);

        // Subsequent connection: Agent issues random challenge nonce
        let nonce = generate_random_bytes(32);

        // Phone computes proof
        let proof = create_auth_proof(&client_key, &nonce);

        // Agent verifies proof with stored_key and nonce
        assert!(verify_auth_proof(&stored_key, &nonce, &proof));

        // Wrong nonce must fail
        let bad_nonce = generate_random_bytes(32);
        assert!(!verify_auth_proof(&stored_key, &bad_nonce, &proof));

        // Tampered proof must fail
        let mut bad_proof = proof;
        bad_proof[0] ^= 0x01;
        assert!(!verify_auth_proof(&stored_key, &nonce, &bad_proof));
    }

    #[test]
    fn test_cert_fingerprint_verification() {
        let fake_cert_bytes = b"sample self-signed der certificate bytes";
        let fp = compute_cert_fingerprint(fake_cert_bytes);
        assert_eq!(fp.len(), 64);
        assert!(verify_cert_fingerprint(fake_cert_bytes, &fp));
        assert!(!verify_cert_fingerprint(b"wrong cert", &fp));
    }
}
