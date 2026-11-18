use crate::hub::AgentHub;
use protocol::{AgentEvent, AgentEventKind};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentUpdaterConfig {
    pub auto_update_enabled: bool,
    pub install_mode: String, // "when_idle" | "at_next_quit" | "ask_me"
    pub channel: String,      // "stable" | "beta"
    pub last_checked: Option<u64>,
    pub staged_version: Option<String>,
    pub staged_release_notes: Option<String>,
    pub cached_previous_version: Option<String>,
    pub crash_count: u32,
    pub safe_mode: bool,
    pub changelog_viewed: Option<String>,
}

impl Default for AgentUpdaterConfig {
    fn default() -> Self {
        Self {
            auto_update_enabled: true,
            install_mode: "when_idle".to_string(),
            channel: "stable".to_string(),
            last_checked: None,
            staged_version: None,
            staged_release_notes: None,
            cached_previous_version: None,
            crash_count: 0,
            safe_mode: false,
            changelog_viewed: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdaterStatusResponse {
    pub current_version: String,
    pub channel: String,
    pub auto_update_enabled: bool,
    pub install_mode: String,
    pub last_checked: Option<u64>,
    pub update_available: bool,
    pub staged_version: Option<String>,
    pub staged_release_notes: Option<String>,
    pub safe_mode: bool,
    pub crash_count: u32,
    pub cached_previous_version: Option<String>,
}

pub struct AgentUpdaterManager {
    config_path: PathBuf,
    updates_dir: PathBuf,
    config: Arc<RwLock<AgentUpdaterConfig>>,
    current_version: String,
}

impl AgentUpdaterManager {
    pub fn new(storage_dir: &Path, current_version: &str) -> Self {
        let config_path = storage_dir.join("updater_config.json");
        let updates_dir = storage_dir.join("updates");
        let _ = fs::create_dir_all(&updates_dir);
        let _ = fs::create_dir_all(updates_dir.join("apk"));

        let config = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|data| serde_json::from_str::<AgentUpdaterConfig>(&data).ok())
                .unwrap_or_default()
        } else {
            AgentUpdaterConfig::default()
        };

        Self {
            config_path,
            updates_dir,
            config: Arc::new(RwLock::new(config)),
            current_version: current_version.to_string(),
        }
    }

    pub async fn get_config(&self) -> AgentUpdaterConfig {
        self.config.read().await.clone()
    }

    pub async fn save_config(&self, new_config: AgentUpdaterConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&new_config).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, json).map_err(|e| e.to_string())?;
        let mut w = self.config.write().await;
        *w = new_config;
        Ok(())
    }

    pub async fn get_status(&self) -> UpdaterStatusResponse {
        let cfg = self.config.read().await;
        UpdaterStatusResponse {
            current_version: self.current_version.clone(),
            channel: cfg.channel.clone(),
            auto_update_enabled: cfg.auto_update_enabled,
            install_mode: cfg.install_mode.clone(),
            last_checked: cfg.last_checked,
            update_available: cfg.staged_version.is_some(),
            staged_version: cfg.staged_version.clone(),
            staged_release_notes: cfg.staged_release_notes.clone(),
            safe_mode: cfg.safe_mode,
            crash_count: cfg.crash_count,
            cached_previous_version: cfg.cached_previous_version.clone(),
        }
    }

    /// Startup health tracking per plan.md section 2:
    /// Tracks consecutive crash counts. If >= 3, trips safe mode and halts auto-update.
    pub async fn record_startup(&self) {
        let mut cfg = self.config.read().await.clone();
        cfg.crash_count += 1;
        if cfg.crash_count >= 3 {
            cfg.safe_mode = true;
            cfg.auto_update_enabled = false;
            log::error!(
                "[Updater/Health] Unhealthy startup detected ({} crashes). Safe mode engaged; auto-updates halted.",
                cfg.crash_count
            );
        }
        let _ = self.save_config(cfg).await;

        // Spawn a 60-second health timer. If we survive 60 seconds without exiting or crashing, reset count.
        let cfg_clone = self.config.clone();
        let config_path_clone = self.config_path.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let mut w = cfg_clone.write().await;
            if w.crash_count > 0 {
                w.crash_count = 0;
                w.safe_mode = false;
                if let Ok(json) = serde_json::to_string_pretty(&*w) {
                    let _ = fs::write(&config_path_clone, json);
                }
                log::info!("[Updater/Health] 60-second healthy startup window reached. Health status cleared.");
            }
        });
    }

    /// Check for updates. Uses the Tauri updater plugin if configured.
    pub async fn check_for_updates(&self, _app: &AppHandle) -> Result<Option<String>, String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        {
            let mut cfg = self.config.read().await.clone();
            cfg.last_checked = Some(now);
            let _ = self.save_config(cfg).await;
        }

        use tauri_plugin_updater::UpdaterExt;
        match _app.updater() {
            Ok(updater) => match updater.check().await {
                Ok(Some(update)) => {
                    let new_ver = update.version.clone();
                    let notes = update.body.clone().unwrap_or_default();
                    log::info!("[Updater] Found new version: {}", new_ver);
                    let mut cfg = self.config.read().await.clone();
                    cfg.staged_version = Some(new_ver.clone());
                    cfg.staged_release_notes = Some(notes);
                    let _ = self.save_config(cfg).await;
                    return Ok(Some(new_ver));
                }
                Ok(None) => {
                    log::info!("[Updater] Up to date (v{})", self.current_version);
                    let mut cfg = self.config.read().await.clone();
                    cfg.staged_version = None;
                    let _ = self.save_config(cfg).await;
                    return Ok(None);
                }
                Err(e) => {
                    log::warn!("[Updater] Check failed gracefully: {}", e);
                    return Err(e.to_string());
                }
            },
            Err(e) => {
                log::warn!("[Updater] Updater plugin not loaded: {}", e);
            }
        }

        Ok(None)
    }

    /// Notify phone client before restarting and apply staged update
    pub async fn apply_update_with_notification(
        &self,
        app: &AppHandle,
        hub: &AgentHub,
    ) -> Result<(), String> {
        let staged = self.config.read().await.staged_version.clone();
        let target_ver = staged.unwrap_or_else(|| "new-version".to_string());

        log::info!(
            "[Updater] Preparing to apply update to {}. Notifying phone clients first...",
            target_ver
        );

        // 1. Broadcast `agent.updating` event with 30s ETA so Display shows calm "PC app updating..."
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let event = AgentEvent {
            id: format!("upd-{}", now),
            ts: now,
            agent: "Phone Deck Agent".to_string(),
            project: "System".to_string(),
            cwd: "".to_string(),
            kind: AgentEventKind::AgentUpdating,
            title: "PC App Updating".to_string(),
            summary: format!(
                "Phone Deck Agent is updating to v{}. Reconnecting automatically...",
                target_ver
            ),
            stats: None,
            actions: vec!["eta:30".to_string()],
            expires_at: Some(now + 60),
        };

        let _ = hub.event_tx.send(event);

        // 2. Wait 1.5 seconds so MessagePack packet flushes through TLS socket to all devices
        tokio::time::sleep(Duration::from_millis(1500)).await;

        // 3. Trigger restart to apply update
        log::info!("[Updater] Relaunching application to finalize installation...");
        app.restart();
    }

    /// Serve local Android manifest if bundled or cached in updates_dir
    pub fn get_android_manifest(&self) -> Option<String> {
        let manifest_path = self.updates_dir.join("apk").join("android-latest.json");
        if manifest_path.exists() {
            fs::read_to_string(manifest_path).ok()
        } else {
            None
        }
    }

    /// Serve APK file over LAN with HTTP Range support for resumable chunked downloads
    pub fn get_apk_bytes_range(
        &self,
        filename: &str,
        range_header: Option<&str>,
    ) -> Option<(Vec<u8>, usize, usize, usize, String)> {
        // Prevent directory traversal
        let safe_name = Path::new(filename).file_name()?.to_str()?;
        let apk_path = self.updates_dir.join("apk").join(safe_name);

        if !apk_path.exists() {
            return None;
        }

        let mut file = fs::File::open(&apk_path).ok()?;
        let total_size = file.metadata().ok()?.len() as usize;

        // Compute SHA-256
        let sha256 = {
            use ring::digest::{digest, SHA256};
            let mut buf = Vec::new();
            let _ = file.read_to_end(&mut buf);
            let d = digest(&SHA256, &buf);
            hex::encode(d.as_ref())
        };

        // Parse optional Range header: "bytes=start-end"
        let (start, end) = if let Some(range_str) = range_header {
            if let Some(spec) = range_str.strip_prefix("bytes=") {
                let parts: Vec<&str> = spec.split('-').collect();
                let s = parts[0].parse::<usize>().unwrap_or(0);
                let e = if parts.len() > 1 && !parts[1].is_empty() {
                    parts[1].parse::<usize>().unwrap_or(total_size - 1)
                } else {
                    total_size - 1
                };
                (s.min(total_size - 1), e.min(total_size - 1))
            } else {
                (0, total_size - 1)
            }
        } else {
            (0, total_size - 1)
        };

        let length = end - start + 1;
        let mut buffer = vec![0u8; length];
        file.seek(SeekFrom::Start(start as u64)).ok()?;
        file.read_exact(&mut buffer).ok()?;

        Some((buffer, start, end, total_size, sha256))
    }
}
