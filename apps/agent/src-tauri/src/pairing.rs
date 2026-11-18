use protocol::{
    derive_client_key, derive_stored_key, generate_device_key, generate_pairing_token,
    verify_auth_proof,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const TOKEN_TTL_SECS: u64 = 120;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedDeviceRecord {
    pub device_id: String,
    pub device_name: String,
    /// The stored key (hex-encoded SHA-256 of ClientKey). We NEVER store the device key!
    pub stored_key_hex: String,
    pub paired_at: u64,
    pub last_seen: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub paired_at: u64,
    pub last_seen: u64,
}

struct ActiveToken {
    token: String,
    created_at: Instant,
}

pub struct PairingManager {
    storage_path: PathBuf,
    active_token: Mutex<ActiveToken>,
    devices: Mutex<HashMap<String, PairedDeviceRecord>>,
}

impl PairingManager {
    pub fn new(storage_dir: &Path) -> Self {
        let storage_path = storage_dir.join("paired_devices.json");
        let initial_devices = if storage_path.exists() {
            match fs::read_to_string(&storage_path) {
                Ok(content) => serde_json::from_str::<HashMap<String, PairedDeviceRecord>>(&content)
                    .unwrap_or_default(),
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        let initial_token = generate_pairing_token();

        Self {
            storage_path,
            active_token: Mutex::new(ActiveToken {
                token: initial_token,
                created_at: Instant::now(),
            }),
            devices: Mutex::new(initial_devices),
        }
    }

    /// Get current token and remaining seconds, auto-refreshing if expired.
    pub fn get_or_refresh_token(&self) -> (String, u64) {
        let mut guard = self.active_token.lock().unwrap();
        let elapsed = guard.created_at.elapsed().as_secs();
        if elapsed >= TOKEN_TTL_SECS {
            let new_token = generate_pairing_token();
            guard.token = new_token.clone();
            guard.created_at = Instant::now();
            (new_token, TOKEN_TTL_SECS)
        } else {
            (guard.token.clone(), TOKEN_TTL_SECS - elapsed)
        }
    }

    /// Force generation of a new 120s pairing token.
    pub fn refresh_token(&self) -> (String, u64) {
        let mut guard = self.active_token.lock().unwrap();
        let new_token = generate_pairing_token();
        guard.token = new_token.clone();
        guard.created_at = Instant::now();
        (new_token, TOKEN_TTL_SECS)
    }

    /// Verify a pairing token, and if valid, consume it immediately (single-use).
    pub fn verify_and_consume_token(&self, presented_token: &str) -> bool {
        let mut guard = self.active_token.lock().unwrap();
        if guard.created_at.elapsed().as_secs() >= TOKEN_TTL_SECS {
            return false;
        }

        if protocol::subtle_eq(&guard.token, presented_token) {
            // Consume token immediately by replacing it with a new one
            guard.token = generate_pairing_token();
            guard.created_at = Instant::now();
            true
        } else {
            false
        }
    }

    /// Complete pairing for a new device. Generates device_key and stores ONLY stored_key.
    pub fn pair_device(
        &self,
        token: &str,
        device_id: String,
        device_name: String,
    ) -> Result<String, String> {
        if !self.verify_and_consume_token(token) {
            return Err("Invalid or expired pairing token".to_string());
        }

        // Generate 256-bit random device key
        let device_key_hex = generate_device_key();
        let device_key_bytes = hex::decode(&device_key_hex)
            .map_err(|e| format!("Hex decode error: {}", e))?;

        // Derive ClientKey and StoredKey
        let client_key = derive_client_key(&device_key_bytes);
        let stored_key = derive_stored_key(&client_key);
        let stored_key_hex = hex::encode(stored_key);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let record = PairedDeviceRecord {
            device_id: device_id.clone(),
            device_name,
            stored_key_hex,
            paired_at: now,
            last_seen: now,
        };

        {
            let mut guard = self.devices.lock().unwrap();
            guard.insert(device_id, record);
        }

        self.persist_devices();

        // Return device_key to client ONCE (never logged, never stored on agent)
        Ok(device_key_hex)
    }

    /// Verify an authentication challenge response using stored_key.
    pub fn verify_device_auth(&self, device_id: &str, nonce: &[u8], proof: &[u8; 32]) -> bool {
        let mut guard = self.devices.lock().unwrap();
        if let Some(record) = guard.get_mut(device_id) {
            if let Ok(stored_key_bytes) = hex::decode(&record.stored_key_hex) {
                if stored_key_bytes.len() == 32 {
                    let mut stored_key = [0u8; 32];
                    stored_key.copy_from_slice(&stored_key_bytes);

                    if verify_auth_proof(&stored_key, nonce, proof) {
                        record.last_seen = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_secs();
                        return true;
                    }
                }
            }
        }
        false
    }

    /// List all currently paired devices.
    pub fn list_devices(&self) -> Vec<PairedDeviceInfo> {
        let guard = self.devices.lock().unwrap();
        guard
            .values()
            .map(|d| PairedDeviceInfo {
                device_id: d.device_id.clone(),
                device_name: d.device_name.clone(),
                paired_at: d.paired_at,
                last_seen: d.last_seen,
            })
            .collect()
    }

    /// Revoke a specific paired device.
    pub fn revoke_device(&self, device_id: &str) -> bool {
        let mut guard = self.devices.lock().unwrap();
        let removed = guard.remove(device_id).is_some();
        if removed {
            drop(guard);
            self.persist_devices();
        }
        removed
    }

    /// Revoke all paired devices.
    pub fn revoke_all(&self) {
        let mut guard = self.devices.lock().unwrap();
        guard.clear();
        drop(guard);
        self.persist_devices();
    }

    fn persist_devices(&self) {
        let guard = self.devices.lock().unwrap();
        if let Ok(json) = serde_json::to_string_pretty(&*guard) {
            let _ = fs::write(&self.storage_path, json);
        }
    }
}
