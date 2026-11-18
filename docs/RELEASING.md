# Phone Deck — Release & Cryptographic Key Management Guide

This document defines the release pipeline, key generation, and signing procedures for Phone Deck.
Security boundary: All updates are cryptographically signed before distribution. Both the Windows Agent and the Android Display enforce signature verification and downgrade protection before applying any update.

---

## 1. Key Infrastructure Overview

Phone Deck relies on three distinct cryptographic keypairs/credentials:

| Key Name | Algorithm / Type | Used By | Stored In | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Tauri Updater Key** | Minisign / Ed25519 | Windows Agent | GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_KEY_PASSWORD` | Signs Windows NSIS `.exe` and `.zip` updater artifacts. Embedded pubkey in `apps/agent/src-tauri/tauri.conf.json`. |
| **Android Keystore** | RSA 4096 / PKCS12 | Android Display APK | GitHub Secret `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` | Signs Android APK (`.apk`). Verified by Android OS and Phone Deck's Kotlin plugin (`GET_SIGNING_CERTIFICATES`). |
| **Manifest Signing Key**| Ed25519 | Release Manifests | GitHub Secret `MANIFEST_ED25519_PRIVATE_KEY` (hex) | Signs `android-latest.json` release manifest. Embedded pubkey in `crates/protocol` (`MANIFEST_PUBLIC_KEY`). Prevents tampering by compromised CDNs or LAN MITM. |

> [!CAUTION]
> **CRITICAL BACKUP REQUIREMENT**:
> Losing ANY of these private keys permanently breaks the auto-update path for all deployed users.
> If a signing key is lost:
> 1. Existing clients will reject newer builds because the signature or certificate SHA-256 will not match.
> 2. Users will be forced to manually download and reinstall the application.
> 3. Android will completely block updating the app if the signing certificate does not match the previously installed version (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`).
>
> Store encrypted offline backups (e.g. in hardware security modules or split air-gapped passphrase-protected archives) in at least two separate secure physical locations.

---

## 2. Generating Cryptographic Keys

### 2.1 Tauri Updater Key (Windows Agent)
Run the following using the Tauri CLI:
```bash
pnpm tauri signer generate -w apps/agent/src-tauri/keys/agent.key
```
- This outputs:
  - Private key: saved to file (or printed as environment variable string).
  - Public key: string to paste into `apps/agent/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.
- In GitHub Repository Settings > Secrets:
  - Add `TAURI_SIGNING_PRIVATE_KEY` (contents of private key).
  - Add `TAURI_SIGNING_KEY_PASSWORD` (password used during generation).

### 2.2 Android Release Keystore (Android Display)
Generate a release keystore using Java `keytool`:
```bash
keytool -genkeypair -v \
  -keystore release.keystore \
  -alias phonedeck \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=Phone Deck, O=Phone Deck Project, C=US"
```
To obtain the signing certificate SHA-256 (required for `android-latest.json` and verification):
```bash
keytool -list -v -keystore release.keystore -alias phonedeck | grep SHA256
```
Encode keystore for GitHub Actions secret:
```bash
base64 -w 0 release.keystore > release.keystore.base64
```
- In GitHub Secrets:
  - `ANDROID_KEYSTORE_BASE64` (base64 string)
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS` (e.g. `phonedeck`)

### 2.3 Manifest Ed25519 Keypair (Android Manifest Verification)
Generate a 32-byte Ed25519 keypair using the `protocol` test utility or OpenSSL:
```bash
# Using OpenSSL:
openssl genpkey -algorithm ed25519 -out manifest_ed25519.pem
# View raw hex seed:
openssl pkey -in manifest_ed25519.pem -text
```
The public key is embedded in `crates/protocol/src/updater.rs` as `MANIFEST_PUBLIC_KEY`.
- In GitHub Secrets:
  - `MANIFEST_ED25519_PRIVATE_KEY` (hex-encoded PKCS#8 or raw seed).

---

## 3. Release Manifest Specifications

### 3.1 Windows Manifest (`latest.json`)
Generated automatically by `tauri-action`:
```json
{
  "version": "v0.2.0",
  "notes": "Changelog text...",
  "pub_date": "2026-11-18T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/ersinkoc/phonedeck/releases/latest/download/phone-deck-agent-x64-setup.nsis.zip"
    }
  }
}
```

### 3.2 Android Manifest (`android-latest.json`)
Signed with Ed25519. Fetched from asset URL `releases/latest/download/android-latest.json`:
```json
{
  "version_name": "0.2.0",
  "version_code": 200,
  "min_protocol": 1,
  "protocol": 1,
  "released_at": "2026-11-18T12:00:00Z",
  "changelog": "- Support for ambient night clock\n- In-app auto updater",
  "signing_cert_sha256": "4a72e819b16893630f9d0c64952d73347c64a3e218c575cf2a33f381c6e1db02",
  "apks": [
    {
      "abi": "arm64-v8a",
      "url": "https://github.com/ersinkoc/phonedeck/releases/latest/download/phone-deck-display-arm64-v8a.apk",
      "size": 15420100,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "abi": "armeabi-v7a",
      "url": "https://github.com/ersinkoc/phonedeck/releases/latest/download/phone-deck-display-armeabi-v7a.apk",
      "size": 14210000,
      "sha256": "..."
    },
    {
      "abi": "universal",
      "url": "https://github.com/ersinkoc/phonedeck/releases/latest/download/phone-deck-display-universal.apk",
      "size": 28500000,
      "sha256": "..."
    }
  ],
  "signature": "hex-encoded-ed25519-signature-over-json-payload-without-signature-field"
}
```

---

## 4. Release Process

1. **Update Version**:
   ```bash
   node scripts/sync-versions.mjs 0.2.0
   ```
2. **Update `CHANGELOG.md`**:
   Add release notes under `## [0.2.0] - YYYY-MM-DD`.
3. **Commit and Tag**:
   ```bash
   git commit -am "chore(release): v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```
4. **CI Automated Build & Publish**:
   - GitHub Actions triggers on `v*` tags.
   - Runs `cargo test --workspace` and `deck-sim --duration 2`.
   - Builds Windows release artifacts using `tauri-action` (NSIS passive installer + updater zip).
   - Builds Android APKs for `arm64-v8a`, `armeabi-v7a`, and `universal` with R8 minification and signing.
   - Computes SHA-256 for all artifacts.
   - Generates `android-latest.json`, signs it with `MANIFEST_ED25519_PRIVATE_KEY`, and attaches it to the GitHub Release.
