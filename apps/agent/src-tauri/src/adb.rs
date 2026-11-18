use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

#[derive(Debug, Clone, serde::Serialize)]
pub struct AdbStatus {
    pub available: bool,
    pub adb_path: Option<String>,
    pub devices: Vec<String>,
    pub reverse_active: bool,
}

pub struct AdbManager {
    adb_path: Option<PathBuf>,
    devices: Arc<RwLock<Vec<String>>>,
    reverse_active: AtomicBool,
}

impl AdbManager {
    pub fn new() -> Self {
        let adb_path = find_adb();
        Self {
            adb_path,
            devices: Arc::new(RwLock::new(Vec::new())),
            reverse_active: AtomicBool::new(false),
        }
    }

    pub fn is_available(&self) -> bool {
        self.adb_path.is_some()
    }

    pub async fn get_status(&self) -> AdbStatus {
        let devices = self.devices.read().await.clone();
        AdbStatus {
            available: self.adb_path.is_some(),
            adb_path: self.adb_path.as_ref().map(|p| p.to_string_lossy().to_string()),
            devices,
            reverse_active: self.reverse_active.load(Ordering::Relaxed),
        }
    }

    pub fn execute_adb(&self, args: &[&str]) -> Result<String, String> {
        let adb = self.adb_path.as_ref().ok_or_else(|| "ADB binary not found".to_string())?;
        
        let output = Command::new(adb)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to execute adb: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ADB command failed (exit code {:?}): {}", output.status.code(), stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub async fn query_devices(&self) -> Vec<String> {
        let adb = match &self.adb_path {
            Some(p) => p,
            None => return Vec::new(),
        };

        let output = match Command::new(adb).arg("devices").output() {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return Vec::new(),
        };

        let mut devices = Vec::new();
        for line in output.lines().skip(1) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == "device" {
                devices.push(parts[0].to_string());
            }
        }
        devices
    }

    pub fn reverse_ports(&self, device: &str, port: u16) -> Result<(), String> {
        let rule = format!("tcp:{}", port);
        self.execute_adb(&["-s", device, "reverse", &rule, &rule])?;
        Ok(())
    }

    pub fn install_apk(&self, device: &str, apk_path: &Path) -> Result<(), String> {
        let path_str = apk_path.to_string_lossy();
        self.execute_adb(&["-s", device, "install", "-r", &path_str])?;
        Ok(())
    }

    pub fn launch_app(&self, device: &str) -> Result<(), String> {
        let _ = self.execute_adb(&["-s", device, "shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
        self.execute_adb(&[
            "-s",
            device,
            "shell",
            "am",
            "start",
            "-n",
            "com.phonedeck.display/.MainActivity",
        ])?;
        Ok(())
    }
}

pub fn spawn_adb_supervisor(adb_mgr: Arc<AdbManager>, ports: Vec<u16>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(4)).await;

            if !adb_mgr.is_available() {
                continue;
            }

            let devices = adb_mgr.query_devices().await;
            {
                let mut guard = adb_mgr.devices.write().await;
                *guard = devices.clone();
            }

            if devices.is_empty() {
                adb_mgr.reverse_active.store(false, Ordering::Relaxed);
                continue;
            }

            let mut all_reversed = true;
            for dev in &devices {
                for &port in &ports {
                    if let Err(e) = adb_mgr.reverse_ports(dev, port) {
                        log::debug!("[ADB] Failed to reverse port {} on {}: {}", port, dev, e);
                        all_reversed = false;
                    }
                }
            }

            adb_mgr.reverse_active.store(all_reversed, Ordering::Relaxed);
        }
    });
}

fn find_adb() -> Option<PathBuf> {
    // 1. Check PATH
    if let Ok(output) = Command::new("where.exe").arg("adb").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                let p = PathBuf::from(first_line.trim());
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 2. Check Android SDK in %LOCALAPPDATA%
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let candidate = PathBuf::from(local_app_data)
            .join("Android")
            .join("Sdk")
            .join("platform-tools")
            .join("adb.exe");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // 3. Check C:\Program Files / Program Files (x86)
    let common_paths = [
        r"C:\Program Files\Android\platform-tools\adb.exe",
        r"C:\Program Files (x86)\Android\platform-tools\adb.exe",
        r"C:\platform-tools\adb.exe",
    ];

    for path_str in common_paths {
        let p = PathBuf::from(path_str);
        if p.exists() {
            return Some(p);
        }
    }

    None
}
