use ring::signature::{self, UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Protocol version number for Phone Deck handshake and version negotiation.
pub const PROTOCOL_VERSION: u32 = 1;

/// Minimum protocol version this client/server is capable of speaking.
pub const MIN_COMPATIBLE_VERSION: u32 = 1;

/// Official Phone Deck Ed25519 Public Key for verifying Android release manifests.
/// Manifests fetched from GitHub Releases or LAN Agent must be signed with the matching private key.
pub const EMBEDDED_ED25519_PUBLIC_KEY: &str =
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

/// Deterministic test Ed25519 PKCS8 keypair for local test harnesses (deck-mock & deck-sim)
pub const TEST_MANIFEST_PKCS8: &[u8] = &[
    0x30, 0x53, 0x02, 0x01, 0x01, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c, 0xc4,
    0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae, 0x7f, 0x60,
    0xa1, 0x23, 0x03, 0x21, 0x00, 0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe,
    0xd3, 0xc9, 0x64, 0x07, 0x3a, 0x0e, 0xe1, 0x72, 0xf3, 0xda, 0xa6, 0x23, 0x25, 0xaf, 0x02, 0x1a,
    0x68, 0xf7, 0x07, 0x51, 0x1a,
];

/// Artifact entry inside an Android release manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApkArtifact {
    pub abi: String, // "arm64-v8a", "armeabi-v7a", "universal"
    pub url: String,
    pub size: u64,
    pub sha256: String,
}

/// Manifest structure describing an Android release channel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AndroidReleaseManifest {
    pub version_name: String,
    pub version_code: u64,
    pub min_protocol: u32,
    pub protocol: u32,
    pub released_at: String,
    pub changelog: String,
    pub apks: Vec<ApkArtifact>,
    pub signing_cert_sha256: String,
}

/// Envelope containing the Android release manifest and its Ed25519 signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SignedAndroidManifest {
    pub manifest: AndroidReleaseManifest,
    /// Hex-encoded Ed25519 signature computed over the canonical JSON bytes of `manifest`
    pub signature: String,
}

/// Convert a semver string (e.g. "0.1.0", "1.2.3", "2.0.4-beta.1") into an integer versionCode.
/// Formula: major * 10,000 + minor * 100 + patch
pub fn semver_to_version_code(version_str: &str) -> Result<u64, String> {
    let clean = version_str.trim().trim_start_matches('v');
    let core = clean.split('-').next().unwrap_or(clean);
    let parts: Vec<&str> = core.split('.').collect();

    if parts.len() < 3 {
        return Err(format!(
            "Invalid semver '{}': expected at least major.minor.patch",
            version_str
        ));
    }

    let major: u64 = parts[0]
        .parse()
        .map_err(|e| format!("Invalid major version '{}': {}", parts[0], e))?;
    let minor: u64 = parts[1]
        .parse()
        .map_err(|e| format!("Invalid minor version '{}': {}", parts[1], e))?;
    let patch: u64 = parts[2]
        .parse()
        .map_err(|e| format!("Invalid patch version '{}': {}", parts[2], e))?;

    Ok(major * 10_000 + minor * 100 + patch)
}

/// Check if candidate versionCode is a strictly positive upgrade over installed versionCode.
/// Enforces downgrade prevention per plan.md section 9.
pub fn is_version_code_upgrade(installed: u64, candidate: u64) -> bool {
    candidate > installed
}

/// Check if two peers speaking protocol versions are compatible.
pub fn is_protocol_compatible(local_proto: u32, local_min: u32, remote_proto: u32, remote_min: u32) -> bool {
    // Both sides must support at least the other's minimum requirements
    local_proto >= remote_min && remote_proto >= local_min
}

/// Verify an Ed25519 signature against canonical JSON data using ring.
pub fn verify_manifest_signature(
    manifest_bytes: &[u8],
    signature_hex: &str,
    public_key_hex: &str,
) -> Result<bool, String> {
    let signature_bytes =
        hex::decode(signature_hex).map_err(|e| format!("Invalid hex signature: {}", e))?;
    let public_key_bytes =
        hex::decode(public_key_hex).map_err(|e| format!("Invalid hex public key: {}", e))?;

    let peer_public_key = UnparsedPublicKey::new(&ED25519, &public_key_bytes);
    match peer_public_key.verify(manifest_bytes, &signature_bytes) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Sign manifest bytes using an Ed25519 PKCS8 keypair.
pub fn sign_manifest(manifest_bytes: &[u8], keypair_pkcs8: &[u8]) -> Result<String, String> {
    let key_pair = signature::Ed25519KeyPair::from_pkcs8(keypair_pkcs8)
        .map_err(|e| format!("Failed to parse PKCS8 keypair: {}", e))?;
    let sig = key_pair.sign(manifest_bytes);
    Ok(hex::encode(sig.as_ref()))
}

/// Find the best matching APK artifact for a given list of supported device ABIs.
/// Matches in order of preference, falling back to "universal" if present.
pub fn select_apk_for_abi<'a>(
    apks: &'a [ApkArtifact],
    supported_abis: &[String],
) -> Option<&'a ApkArtifact> {
    // 1. First attempt exact match in supported_abis priority order
    for preferred_abi in supported_abis {
        let preferred_lower = preferred_abi.to_lowercase();
        if let Some(artifact) = apks.iter().find(|a| a.abi.to_lowercase() == preferred_lower) {
            return Some(artifact);
        }
    }

    // 2. Fall back to universal artifact
    apks.iter().find(|a| a.abi.to_lowercase() == "universal")
}

/// Idle install scheduler rule:
/// Determines whether an update can be safely applied without disrupting active tasks or user actions.
pub fn can_install_idle(
    has_pending_approval: bool,
    seconds_since_last_agent_event: u64,
    seconds_since_last_touch: u64,
    is_dark_mode: bool,
) -> bool {
    // Rule 1: Never interrupt an in-progress approval
    if has_pending_approval {
        return false;
    }

    // Rule 2: Night Clock / dark mode is always idle for background installations
    if is_dark_mode {
        return true;
    }

    // Rule 3: Idle threshold: at least 3 minutes since last agent event and 2 minutes since last touch
    seconds_since_last_agent_event >= 180 && seconds_since_last_touch >= 120
}

/// Helper structure for streaming SHA-256 calculation
pub struct Sha256Hasher {
    ctx: ring::digest::Context,
}

impl Default for Sha256Hasher {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256Hasher {
    pub fn new() -> Self {
        Self {
            ctx: ring::digest::Context::new(&ring::digest::SHA256),
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.ctx.update(data);
    }

    pub fn finish(self) -> String {
        hex::encode(self.ctx.finish().as_ref())
    }
}

pub fn compute_sha256(data: &[u8]) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA256, data);
    hex::encode(digest.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::rand::SystemRandom;
    use ring::signature::KeyPair;

    #[test]
    fn test_semver_to_version_code() {
        assert_eq!(semver_to_version_code("0.1.0").unwrap(), 100);
        assert_eq!(semver_to_version_code("v0.1.0").unwrap(), 100);
        assert_eq!(semver_to_version_code("1.0.0").unwrap(), 10000);
        assert_eq!(semver_to_version_code("1.2.3").unwrap(), 10203);
        assert_eq!(semver_to_version_code("2.10.5").unwrap(), 21005);
        assert_eq!(semver_to_version_code("0.2.1-beta.3").unwrap(), 201);
        assert!(semver_to_version_code("invalid").is_err());
    }

    #[test]
    fn test_downgrade_prevention() {
        assert!(!is_version_code_upgrade(100, 100)); // Same version = reject
        assert!(!is_version_code_upgrade(200, 100)); // Downgrade = reject
        assert!(is_version_code_upgrade(100, 101));  // Upgrade = accept
    }

    #[test]
    fn test_protocol_compatibility() {
        // Both speak proto 1, min 1
        assert!(is_protocol_compatible(1, 1, 1, 1));
        // Server speaks proto 2, min 1; client speaks proto 1, min 1
        assert!(is_protocol_compatible(2, 1, 1, 1));
        // Server dropped proto 1 (speaks proto 2, min 2); client speaks proto 1, min 1
        assert!(!is_protocol_compatible(2, 2, 1, 1));
        // Client requires proto 3, server only has proto 2
        assert!(!is_protocol_compatible(2, 1, 3, 3));
    }

    #[test]
    fn test_ed25519_sign_and_verify() {
        let rng = SystemRandom::new();
        let pkcs8_bytes =
            signature::Ed25519KeyPair::generate_pkcs8(&rng).expect("generate_pkcs8 failed");
        let key_pair =
            signature::Ed25519KeyPair::from_pkcs8(pkcs8_bytes.as_ref()).expect("keypair parse failed");
        let pubkey_hex = hex::encode(key_pair.public_key().as_ref());

        let payload = b"{\"versionName\":\"0.2.0\",\"versionCode\":200}";
        let sig_hex = sign_manifest(payload, pkcs8_bytes.as_ref()).expect("sign failed");

        // Valid signature verifies true
        assert!(verify_manifest_signature(payload, &sig_hex, &pubkey_hex).unwrap());

        // Test deterministic test keypair
        let test_sig = sign_manifest(payload, TEST_MANIFEST_PKCS8).expect("test sign failed");
        assert!(verify_manifest_signature(payload, &test_sig, EMBEDDED_ED25519_PUBLIC_KEY).unwrap());

        // Tampered payload fails verification
        let tampered = b"{\"versionName\":\"0.2.0\",\"versionCode\":999}";
        assert!(!verify_manifest_signature(tampered, &sig_hex, &pubkey_hex).unwrap());

        // Wrong public key fails verification
        let wrong_pubkey = "0000000000000000000000000000000000000000000000000000000000000000";
        assert!(!verify_manifest_signature(payload, &sig_hex, wrong_pubkey).unwrap());
    }

    #[test]
    fn test_select_apk_for_abi() {
        let apks = vec![
            ApkArtifact {
                abi: "armeabi-v7a".into(),
                url: "http://example.com/v7a.apk".into(),
                size: 1000,
                sha256: "aaa".into(),
            },
            ApkArtifact {
                abi: "arm64-v8a".into(),
                url: "http://example.com/v8a.apk".into(),
                size: 2000,
                sha256: "bbb".into(),
            },
            ApkArtifact {
                abi: "universal".into(),
                url: "http://example.com/universal.apk".into(),
                size: 3000,
                sha256: "ccc".into(),
            },
        ];

        // Preference 1: arm64
        let choice1 = select_apk_for_abi(&apks, &["arm64-v8a".into(), "armeabi-v7a".into()]);
        assert_eq!(choice1.unwrap().abi, "arm64-v8a");

        // Preference 2: 32-bit only device
        let choice2 = select_apk_for_abi(&apks, &["armeabi-v7a".into()]);
        assert_eq!(choice2.unwrap().abi, "armeabi-v7a");

        // Preference 3: x86 device falling back to universal
        let choice3 = select_apk_for_abi(&apks, &["x86_64".into(), "x86".into()]);
        assert_eq!(choice3.unwrap().abi, "universal");
    }

    #[test]
    fn test_idle_install_scheduler() {
        // Pending approval blocks install even if idle
        assert!(!can_install_idle(true, 500, 500, false));

        // Dark mode allows install regardless of timers (if no approval)
        assert!(can_install_idle(false, 10, 10, true));

        // Normal mode requires >= 180s event idle and >= 120s touch idle
        assert!(!can_install_idle(false, 179, 150, false));
        assert!(!can_install_idle(false, 200, 119, false));
        assert!(can_install_idle(false, 180, 120, false));
        assert!(can_install_idle(false, 300, 240, false));
    }
}
