use protocol::updater::{
    is_protocol_compatible, is_version_code_upgrade, select_apk_for_abi,
    verify_manifest_signature, AndroidReleaseManifest, ApkArtifact, Sha256Hasher,
    SignedAndroidManifest, EMBEDDED_ED25519_PUBLIC_KEY, MIN_COMPATIBLE_VERSION, PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayUpdaterConfig {
    pub auto_update: bool,
    pub wifi_only: bool,
    pub check_interval_secs: u64,
    pub channel: String,
    pub last_checked: Option<u64>,
    pub last_etag: Option<String>,
    pub installed_version_code: u64,
    pub installed_version_name: String,
}

impl Default for DisplayUpdaterConfig {
    fn default() -> Self {
        Self {
            auto_update: true,
            wifi_only: true,
            check_interval_secs: 21600, // 6 hours
            channel: "stable".to_string(),
            last_checked: None,
            last_etag: None,
            installed_version_code: 100, // 0.1.0
            installed_version_name: "0.1.0".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayUpdateStatus {
    pub state: String, // "idle" | "checking" | "available" | "downloading" | "ready_to_install" | "installing" | "error"
    pub manifest: Option<AndroidReleaseManifest>,
    pub selected_apk: Option<ApkArtifact>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub progress_pct: f32,
    pub error: Option<String>,
    pub cached_apk_path: Option<String>,
    pub pending_user_action: bool,
    pub protocol_incompatible: bool,
}

impl Default for DisplayUpdateStatus {
    fn default() -> Self {
        Self {
            state: "idle".to_string(),
            manifest: None,
            selected_apk: None,
            downloaded_bytes: 0,
            total_bytes: 0,
            progress_pct: 0.0,
            error: None,
            cached_apk_path: None,
            pending_user_action: false,
            protocol_incompatible: false,
        }
    }
}

pub struct DisplayUpdater {
    pub storage_dir: PathBuf,
    pub config: Mutex<DisplayUpdaterConfig>,
    pub status: Mutex<DisplayUpdateStatus>,
}

impl DisplayUpdater {
    pub fn new(storage_dir: &Path) -> Self {
        let config_path = storage_dir.join("updater_config.json");
        let config = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            DisplayUpdaterConfig::default()
        };

        Self {
            storage_dir: storage_dir.to_path_buf(),
            config: Mutex::new(config),
            status: Mutex::new(DisplayUpdateStatus::default()),
        }
    }

    pub fn save_config(&self) {
        let cfg = self.config.lock().unwrap().clone();
        let path = self.storage_dir.join("updater_config.json");
        if let Ok(json) = serde_json::to_string_pretty(&cfg) {
            let _ = fs::write(path, json);
        }
    }

    pub fn get_status(&self) -> DisplayUpdateStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn get_config(&self) -> DisplayUpdaterConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn update_config(&self, new_cfg: DisplayUpdaterConfig) {
        {
            let mut cfg = self.config.lock().unwrap();
            *cfg = new_cfg;
        }
        self.save_config();
    }

    /// Check for updates from:
    /// 1. Paired PC over LAN (if host provided)
    /// 2. Internet / fallback URL
    pub async fn check_for_updates(
        &self,
        lan_host: Option<&str>,
        lan_port: Option<u16>,
        current_abi: &str,
    ) -> Result<Option<AndroidReleaseManifest>, String> {
        {
            let mut st = self.status.lock().unwrap();
            st.state = "checking".to_string();
            st.error = None;
        }

        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let installed_code = self.config.lock().unwrap().installed_version_code;
        let last_etag = self.config.lock().unwrap().last_etag.clone();

        // 1. Try PC LAN source first
        let mut manifest_result: Option<(AndroidReleaseManifest, Option<String>)> = None;

        if let (Some(host), Some(port)) = (lan_host, lan_port) {
            let lan_url = format!("http://{}:{}/api/update/android-latest.json", host, port);
            log::info!("[DisplayUpdater] Checking LAN update from {}", lan_url);
            match Self::fetch_http_manifest(&lan_url, last_etag.as_deref()).await {
                Ok(Some((m, etag))) => {
                    log::info!("[DisplayUpdater] Received update manifest from LAN Agent: v{} (code {})", m.version_name, m.version_code);
                    manifest_result = Some((m, etag));
                }
                Ok(None) => {
                    log::info!("[DisplayUpdater] LAN update manifest 304 Not Modified");
                    let mut st = self.status.lock().unwrap();
                    st.state = "idle".to_string();
                    return Ok(None);
                }
                Err(e) => {
                    log::warn!("[DisplayUpdater] LAN check failed ({}), checking internet fallback...", e);
                }
            }
        }

        // 2. Fallback to internet GitHub releases if LAN didn't yield an update
        if manifest_result.is_none() {
            let channel = self.config.lock().unwrap().channel.clone();
            let github_url = if channel == "beta" {
                "https://raw.githubusercontent.com/phone-deck/phone-deck/main/releases/android-beta.json"
            } else {
                "https://github.com/ersinkoc/phonedeck/releases/latest/download/android-latest.json"
            };

            log::info!("[DisplayUpdater] Checking internet fallback from {}", github_url);
            match Self::fetch_http_manifest(github_url, last_etag.as_deref()).await {
                Ok(Some((m, etag))) => {
                    manifest_result = Some((m, etag));
                }
                Ok(None) => {
                    log::info!("[DisplayUpdater] Internet manifest 304 Not Modified");
                    let mut st = self.status.lock().unwrap();
                    st.state = "idle".to_string();
                    return Ok(None);
                }
                Err(e) => {
                    log::warn!("[DisplayUpdater] Internet fallback manifest fetch failed: {}", e);
                }
            }
        }

        let (manifest, new_etag) = match manifest_result {
            Some(res) => res,
            None => {
                let mut st = self.status.lock().unwrap();
                st.state = "idle".to_string();
                return Ok(None);
            }
        };

        // Update config timestamp & etag
        {
            let mut cfg = self.config.lock().unwrap();
            cfg.last_checked = Some(now_unix);
            if let Some(etag) = new_etag {
                cfg.last_etag = Some(etag);
            }
        }
        self.save_config();

        // 3. Check protocol compatibility
        let proto_compat = is_protocol_compatible(
            PROTOCOL_VERSION,
            MIN_COMPATIBLE_VERSION,
            manifest.protocol,
            manifest.min_protocol,
        );

        if !proto_compat {
            log::warn!(
                "[DisplayUpdater] Protocol incompatible! Local proto {}, remote min {}",
                PROTOCOL_VERSION,
                manifest.min_protocol
            );
            let mut st = self.status.lock().unwrap();
            st.state = "available".to_string();
            st.protocol_incompatible = true;
            st.manifest = Some(manifest.clone());
            return Ok(Some(manifest));
        }

        // 4. Downgrade protection: candidate must be > installed
        if !is_version_code_upgrade(installed_code, manifest.version_code) {
            log::info!(
                "[DisplayUpdater] Candidate versionCode {} <= installed {}; no upgrade needed",
                manifest.version_code,
                installed_code
            );
            let mut st = self.status.lock().unwrap();
            st.state = "idle".to_string();
            st.manifest = None;
            return Ok(None);
        }

        // 5. Select best ABI artifact
        let supported_abis = vec![current_abi.to_string(), "universal".to_string()];
        let selected_apk = select_apk_for_abi(&manifest.apks, &supported_abis).cloned();

        {
            let mut st = self.status.lock().unwrap();
            st.state = "available".to_string();
            st.manifest = Some(manifest.clone());
            st.selected_apk = selected_apk;
            st.total_bytes = st.selected_apk.as_ref().map(|a| a.size).unwrap_or(0);
        }

        Ok(Some(manifest))
    }

    /// Download APK chunk with HTTP Range resume support and streaming SHA-256 calculation.
    pub async fn download_selected_apk(&self) -> Result<PathBuf, String> {
        let (apk, version_code) = {
            let st = self.status.lock().unwrap();
            let apk = st
                .selected_apk
                .clone()
                .ok_or_else(|| "No APK artifact selected for download".to_string())?;
            let code = st
                .manifest
                .as_ref()
                .map(|m| m.version_code)
                .unwrap_or(100);
            (apk, code)
        };

        {
            let mut st = self.status.lock().unwrap();
            st.state = "downloading".to_string();
            st.downloaded_bytes = 0;
            st.progress_pct = 0.0;
            st.error = None;
        }

        let updates_dir = self.storage_dir.join("updates");
        let _ = fs::create_dir_all(&updates_dir);
        let dest_path = updates_dir.join(format!("display-v{}.apk", version_code));

        let existing_len = if dest_path.exists() {
            fs::metadata(&dest_path).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        log::info!(
            "[DisplayUpdater] Starting resumable download of {} (existing: {}/{} bytes)",
            apk.url,
            existing_len,
            apk.size
        );

        let download_result = Self::stream_range_download(
            &apk.url,
            &dest_path,
            existing_len,
            apk.size,
            &apk.sha256,
            &self.status,
        )
        .await;

        match download_result {
            Ok(verified_path) => {
                let mut st = self.status.lock().unwrap();
                st.state = "ready_to_install".to_string();
                st.cached_apk_path = Some(verified_path.to_string_lossy().to_string());
                st.progress_pct = 100.0;
                st.downloaded_bytes = apk.size;
                log::info!("[DisplayUpdater] APK download completed and SHA-256 verified: {:?}", verified_path);
                Ok(verified_path)
            }
            Err(e) => {
                let mut st = self.status.lock().unwrap();
                st.state = "error".to_string();
                st.error = Some(e.clone());
                log::error!("[DisplayUpdater] APK download error: {}", e);
                Err(e)
            }
        }
    }

    /// Low-level HTTP GET with ETag support and Ed25519 signature verification.
    async fn fetch_http_manifest(
        url_str: &str,
        if_none_match: Option<&str>,
    ) -> Result<Option<(AndroidReleaseManifest, Option<String>)>, String> {
        let (host, port, path, is_tls) = Self::parse_url(url_str)?;
        let addr = format!("{}:{}", host, port);

        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

        let etag_header = if_none_match
            .map(|etag| format!("If-None-Match: {}\r\n", etag))
            .unwrap_or_default();

        let request = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: PhoneDeck-Display\r\nConnection: close\r\n{}\r\n",
            path, host, etag_header
        );

        let mut raw_response = Vec::new();

        if is_tls {
            // Note: For GitHub HTTPS in mobile core, fallback to plain HTTP or proxy through LAN Agent
            return Err("Direct TLS without platform verifier not configured; prefer LAN Agent".to_string());
        } else {
            let mut s = stream;
            s.write_all(request.as_bytes())
                .await
                .map_err(|e| format!("Failed to send HTTP request: {}", e))?;
            s.read_to_end(&mut raw_response)
                .await
                .map_err(|e| format!("Failed to read HTTP response: {}", e))?;
        }

        let resp_str = String::from_utf8_lossy(&raw_response);
        let header_end = resp_str
            .find("\r\n\r\n")
            .ok_or_else(|| "Invalid HTTP response: header delimiter missing".to_string())?;

        let headers = &resp_str[..header_end];
        let body = &raw_response[header_end + 4..];

        let status_line = headers.lines().next().unwrap_or("");
        if status_line.contains(" 304 ") {
            return Ok(None);
        }

        if !status_line.contains(" 200 ") {
            return Err(format!("HTTP error response: {}", status_line));
        }

        let mut etag = None;
        for line in headers.lines() {
            if line.to_ascii_lowercase().starts_with("etag:") {
                etag = Some(line[5..].trim().to_string());
            }
        }

        // Parse SignedAndroidManifest envelope
        let signed_envelope: SignedAndroidManifest = serde_json::from_slice(body)
            .map_err(|e| format!("Failed to deserialize release manifest: {}", e))?;

        // Canonical manifest JSON bytes for Ed25519 verification
        let canonical_bytes = serde_json::to_vec(&signed_envelope.manifest)
            .map_err(|e| format!("Failed to canonicalize manifest for verification: {}", e))?;

        let is_valid = verify_manifest_signature(
            &canonical_bytes,
            &signed_envelope.signature,
            EMBEDDED_ED25519_PUBLIC_KEY,
        )?;

        if !is_valid {
            return Err("Manifest Ed25519 signature verification FAILED! Rejecting release.".to_string());
        }

        Ok(Some((signed_envelope.manifest, etag)))
    }

    /// Stream resumable Range download and compute streaming SHA-256.
    async fn stream_range_download(
        url_str: &str,
        dest_path: &Path,
        existing_bytes: u64,
        total_size: u64,
        expected_sha256: &str,
        status_lock: &Mutex<DisplayUpdateStatus>,
    ) -> Result<PathBuf, String> {
        let (host, port, path, is_tls) = Self::parse_url(url_str)?;
        let addr = format!("{}:{}", host, port);

        if is_tls {
            return Err("Direct TLS download without verifier not configured; use LAN Agent source".to_string());
        }

        let use_range = existing_bytes > 0 && existing_bytes < total_size;
        let start_byte = if use_range { existing_bytes } else { 0 };

        let mut file = if use_range {
            OpenOptions::new()
                .write(true)
                .append(true)
                .open(dest_path)
                .map_err(|e| format!("Failed to open existing partial file: {}", e))?
        } else {
            File::create(dest_path)
                .map_err(|e| format!("Failed to create destination file: {}", e))?
        };

        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;

        let range_header = if start_byte > 0 {
            format!("Range: bytes={}-\r\n", start_byte)
        } else {
            String::new()
        };

        let request = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: PhoneDeck-Display\r\nConnection: close\r\n{}\r\n",
            path, host, range_header
        );

        let mut s = stream;
        s.write_all(request.as_bytes())
            .await
            .map_err(|e| format!("Failed to send download request: {}", e))?;

        // Read headers first
        let mut buffer = [0u8; 8192];
        let mut header_buf = Vec::new();
        let body_start_idx;

        loop {
            let n = s
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Failed to read stream: {}", e))?;
            if n == 0 {
                return Err("Connection closed before headers received".to_string());
            }
            header_buf.extend_from_slice(&buffer[..n]);

            if let Some(pos) = header_buf.windows(4).position(|w| w == b"\r\n\r\n") {
                body_start_idx = pos + 4;
                break;
            }
        }

        let header_str = String::from_utf8_lossy(&header_buf[..body_start_idx]);
        let status_line = header_str.lines().next().unwrap_or("");

        let is_partial = status_line.contains(" 206 ");
        let is_ok = status_line.contains(" 200 ");

        if !is_partial && !is_ok {
            return Err(format!("Download failed with status: {}", status_line));
        }

        // If server sent 200 instead of 206, reset file to beginning
        if is_ok && start_byte > 0 {
            file = File::create(dest_path)
                .map_err(|e| format!("Failed to truncate destination file: {}", e))?;
        }

        // Write first chunk if any
        let mut current_downloaded = if is_partial { start_byte } else { 0 };
        let first_body_chunk = &header_buf[body_start_idx..];
        if !first_body_chunk.is_empty() {
            file.write_all(first_body_chunk)
                .map_err(|e| format!("Failed writing first chunk: {}", e))?;
            current_downloaded += first_body_chunk.len() as u64;
        }

        // Stream remaining chunks
        loop {
            let n = s
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Read stream error: {}", e))?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n])
                .map_err(|e| format!("Write chunk error: {}", e))?;
            current_downloaded += n as u64;

            // Update status
            let pct = if total_size > 0 {
                (current_downloaded as f32 / total_size as f32) * 100.0
            } else {
                0.0
            };

            {
                let mut st = status_lock.lock().unwrap();
                st.downloaded_bytes = current_downloaded;
                st.progress_pct = pct;
            }
        }

        file.flush()
            .map_err(|e| format!("Failed to flush APK file: {}", e))?;

        // Verify SHA-256 of entire file
        log::info!("[DisplayUpdater] Verifying SHA-256 for {:?}", dest_path);
        let mut check_file = File::open(dest_path)
            .map_err(|e| format!("Failed opening file for hash verification: {}", e))?;
        let mut sha_hasher = Sha256Hasher::new();
        let mut check_buf = [0u8; 16384];

        loop {
            let n = check_file
                .read(&mut check_buf)
                .map_err(|e| format!("Failed reading file for hash: {}", e))?;
            if n == 0 {
                break;
            }
            sha_hasher.update(&check_buf[..n]);
        }

        let computed_digest = sha_hasher.finish();
        if computed_digest.to_lowercase() != expected_sha256.to_lowercase() {
            let _ = fs::remove_file(dest_path);
            return Err(format!(
                "SHA-256 mismatch! Expected {}, got {}. Deleted corrupted APK.",
                expected_sha256, computed_digest
            ));
        }

        Ok(dest_path.to_path_buf())
    }

    fn parse_url(url_str: &str) -> Result<(String, u16, String, bool), String> {
        let (protocol, rest) = if let Some(stripped) = url_str.strip_prefix("https://") {
            ("https", stripped)
        } else if let Some(stripped) = url_str.strip_prefix("http://") {
            ("http", stripped)
        } else {
            return Err(format!("Unsupported URL protocol in '{}'", url_str));
        };

        let is_tls = protocol == "https";
        let (authority, path) = match rest.find('/') {
            Some(idx) => (&rest[..idx], &rest[idx..]),
            None => (rest, "/"),
        };

        let (host, port) = match authority.find(':') {
            Some(idx) => {
                let h = &authority[..idx];
                let p = authority[idx + 1..]
                    .parse::<u16>()
                    .map_err(|e| format!("Invalid port in '{}': {}", authority, e))?;
                (h.to_string(), p)
            }
            None => (authority.to_string(), if is_tls { 443 } else { 80 }),
        };

        Ok((host, port, path.to_string(), is_tls))
    }
}
