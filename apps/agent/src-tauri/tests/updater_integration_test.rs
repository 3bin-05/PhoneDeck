use protocol::updater::{
    can_install_idle, compute_sha256, is_protocol_compatible, is_version_code_upgrade,
    select_apk_for_abi, semver_to_version_code, sign_manifest, verify_manifest_signature,
    AndroidReleaseManifest, ApkArtifact, Sha256Hasher,
    EMBEDDED_ED25519_PUBLIC_KEY, TEST_MANIFEST_PKCS8,
};

#[test]
fn test_updater_flow_walkthrough() {
    println!("=== 1. SEMVER & DOWNGRADE DEFENSE ===");
    let installed_semver = "0.1.0";
    let installed_code = semver_to_version_code(installed_semver).expect("parse semver");
    assert_eq!(installed_code, 100);

    // Downgrade attempt: 0.0.9 -> code 9
    let downgrade_code = semver_to_version_code("0.0.9").expect("parse semver");
    assert!(!is_version_code_upgrade(installed_code, downgrade_code));

    // Same version attempt: 0.1.0 -> code 100
    assert!(!is_version_code_upgrade(installed_code, installed_code));

    // Valid upgrade: 0.2.0 -> code 200
    let upgrade_code = semver_to_version_code("0.2.0").expect("parse semver");
    assert_eq!(upgrade_code, 200);
    assert!(is_version_code_upgrade(installed_code, upgrade_code));

    println!("=== 2. PROTOCOL COMPATIBILITY CHECKS ===");
    // Matching protocols: local (1, min 1), remote (1, min 1)
    assert!(is_protocol_compatible(1, 1, 1, 1));

    // Compatible upgrade: local (2, min 1), remote (1, min 1)
    assert!(is_protocol_compatible(2, 1, 1, 1));

    // Incompatible breaking upgrade: remote requires protocol 2, local only speaks 1
    assert!(!is_protocol_compatible(1, 1, 2, 2));

    // Incompatible backwards: local requires protocol 2, remote only speaks 1
    assert!(!is_protocol_compatible(2, 2, 1, 1));

    println!("=== 3. ED25519 MANIFEST SIGNATURE VERIFICATION ===");
    let canned_payload: Vec<u8> = (0..16384).map(|i| (i % 256) as u8).collect();
    let canned_hash = compute_sha256(&canned_payload);

    let manifest = AndroidReleaseManifest {
        version_name: "0.2.0".to_string(),
        version_code: 200,
        min_protocol: 1,
        protocol: 1,
        released_at: "2026-11-18T12:00:00Z".to_string(),
        changelog: "- Night clock\n- Auto updater".to_string(),
        signing_cert_sha256: "4a72e819b16893630f9d0c64952d73347c64a3e218c575cf2a33f381c6e1db02".to_string(),
        apks: vec![
            ApkArtifact {
                abi: "arm64-v8a".to_string(),
                url: "http://127.0.0.1:8765/api/update/apk/display-v0.2.0-arm64-v8a.apk".to_string(),
                size: canned_payload.len() as u64,
                sha256: canned_hash.clone(),
            },
            ApkArtifact {
                abi: "universal".to_string(),
                url: "http://127.0.0.1:8765/api/update/apk/display-v0.2.0-universal.apk".to_string(),
                size: canned_payload.len() as u64,
                sha256: canned_hash.clone(),
            },
        ],
    };

    let canonical_bytes = serde_json::to_vec(&manifest).expect("serialize manifest");

    // Valid signature with embedded key
    let valid_signature = sign_manifest(&canonical_bytes, TEST_MANIFEST_PKCS8).expect("sign manifest");
    assert!(
        verify_manifest_signature(&canonical_bytes, &valid_signature, EMBEDDED_ED25519_PUBLIC_KEY)
            .expect("verify signature")
    );

    // Tampered payload fails verification
    let mut tampered_manifest = manifest.clone();
    tampered_manifest.version_code = 999;
    let tampered_bytes = serde_json::to_vec(&tampered_manifest).expect("serialize tampered");
    assert!(
        !verify_manifest_signature(&tampered_bytes, &valid_signature, EMBEDDED_ED25519_PUBLIC_KEY)
            .expect("verify signature")
    );

    println!("=== 4. ABI SELECTION ===");
    // arm64-v8a device selects arm64-v8a apk
    let selected_arm64 = select_apk_for_abi(
        &manifest.apks,
        &["arm64-v8a".to_string(), "universal".to_string()],
    )
    .expect("select arm64");
    assert_eq!(selected_arm64.abi, "arm64-v8a");

    // x86_64 device falls back to universal apk
    let selected_fallback = select_apk_for_abi(
        &manifest.apks,
        &["x86_64".to_string()],
    )
    .expect("fallback universal");
    assert_eq!(selected_fallback.abi, "universal");

    println!("=== 5. RESUMABLE RANGE STREAMING & SHA-256 VERIFICATION ===");
    // Simulating interrupted download at 4096 bytes
    let _total_len = canned_payload.len();
    let part1 = &canned_payload[..4096];
    let part2 = &canned_payload[4096..];

    // Compute streaming hash over resumed pieces
    let mut hasher = Sha256Hasher::new();
    hasher.update(part1);
    hasher.update(part2);
    let resumed_hash = hasher.finish();
    assert_eq!(resumed_hash, canned_hash);

    // Corrupted payload detection
    let mut corrupted = canned_payload.clone();
    corrupted[500] ^= 0xAA;
    let corrupt_hash = compute_sha256(&corrupted);
    assert_ne!(corrupt_hash, canned_hash);

    println!("=== 6. IDLE INSTALL SCHEDULER RULES ===");
    // Rule 1: Never interrupt pending approval
    assert!(!can_install_idle(true, 500, 500, false));

    // Rule 2: Night Clock / dark mode is always idle for background installations
    assert!(can_install_idle(false, 10, 10, true));

    // Rule 3: Bright mode requires idle thresholds: >= 180s event idle AND >= 120s touch idle
    assert!(!can_install_idle(false, 100, 200, false)); // recent event
    assert!(!can_install_idle(false, 200, 50, false));  // recent touch
    assert!(can_install_idle(false, 200, 150, false));  // both idle -> true
}
