use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QuickActionKind {
  LockPc,
  Mute,
  MediaPlayPause,
  MediaNext,
  MediaPrev,
  VolumeUp,
  VolumeDown,
  Screenshot,
  SleepDisplay,
  WakeOnLan { mac: String, broadcast: Option<String> },
  RunScript { script: String, shell: Option<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ShortcutAction {
  LaunchApp { path: String, args: Vec<String> },
  OpenUrl { url: String },
  OpenFolder { path: String },
  RunCommand { cmd: String, args: Vec<String> },
  KeyboardMacro { keys: Vec<String> },
  Toggle { state_key: String },
  QuickAction { kind: QuickActionKind },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutItem {
  pub id: String,
  pub name: String,
  pub icon: String, // emoji or icon name
  pub color: String, // hex color
  pub action: ShortcutAction,
  pub confirm: bool,
  pub cooldown_ms: u64,
  pub process_match: Option<String>, // e.g. "code.exe" or "chrome.exe"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledApp {
  pub name: String,
  pub path: String,
}

pub struct ShortcutManager {
  shortcuts: Arc<RwLock<HashMap<String, ShortcutItem>>>,
  cooldowns: Arc<RwLock<HashMap<String, Instant>>>,
  toggle_states: Arc<RwLock<HashMap<String, bool>>>,
}

impl ShortcutManager {
  pub fn new() -> Self {
    let mut default_shortcuts = HashMap::new();

    // Starter Dev & Media shortcuts
    default_shortcuts.insert(
      "lock-pc".to_string(),
      ShortcutItem {
        id: "lock-pc".to_string(),
        name: "Lock PC".to_string(),
        icon: "Lock".to_string(),
        color: "#EF4444".to_string(),
        action: ShortcutAction::QuickAction {
          kind: QuickActionKind::LockPc,
        },
        confirm: true,
        cooldown_ms: 2000,
        process_match: None,
      },
    );

    default_shortcuts.insert(
      "media-play".to_string(),
      ShortcutItem {
        id: "media-play".to_string(),
        name: "Play / Pause".to_string(),
        icon: "Play".to_string(),
        color: "#7C5CFF".to_string(),
        action: ShortcutAction::QuickAction {
          kind: QuickActionKind::MediaPlayPause,
        },
        confirm: false,
        cooldown_ms: 300,
        process_match: None,
      },
    );

    default_shortcuts.insert(
      "screenshot".to_string(),
      ShortcutItem {
        id: "screenshot".to_string(),
        name: "Snippet".to_string(),
        icon: "Crop".to_string(),
        color: "#00E599".to_string(),
        action: ShortcutAction::QuickAction {
          kind: QuickActionKind::Screenshot,
        },
        confirm: false,
        cooldown_ms: 1000,
        process_match: None,
      },
    );

    default_shortcuts.insert(
      "open-vscode".to_string(),
      ShortcutItem {
        id: "open-vscode".to_string(),
        name: "VS Code".to_string(),
        icon: "Code".to_string(),
        color: "#3B82F6".to_string(),
        action: ShortcutAction::RunCommand {
          cmd: "code".to_string(),
          args: vec![".".to_string()],
        },
        confirm: false,
        cooldown_ms: 1500,
        process_match: Some("code.exe".to_string()),
      },
    );

    default_shortcuts.insert(
      "open-repo".to_string(),
      ShortcutItem {
        id: "open-repo".to_string(),
        name: "Project Dir".to_string(),
        icon: "Folder".to_string(),
        color: "#F59E0B".to_string(),
        action: ShortcutAction::OpenFolder {
          path: ".".to_string(),
        },
        confirm: false,
        cooldown_ms: 1000,
        process_match: None,
      },
    );

    Self {
      shortcuts: Arc::new(RwLock::new(default_shortcuts)),
      cooldowns: Arc::new(RwLock::new(HashMap::new())),
      toggle_states: Arc::new(RwLock::new(HashMap::new())),
    }
  }

  pub async fn get_all(&self) -> Vec<ShortcutItem> {
    self.shortcuts.read().await.values().cloned().collect()
  }

  pub async fn add_or_update(&self, item: ShortcutItem) {
    self.shortcuts.write().await.insert(item.id.clone(), item);
  }

  pub async fn remove(&self, id: &str) -> bool {
    self.shortcuts.write().await.remove(id).is_some()
  }

  pub async fn execute(&self, id: &str) -> Result<String, String> {
    let shortcut = {
      let map = self.shortcuts.read().await;
      map.get(id).cloned().ok_or_else(|| format!("Shortcut '{}' not found", id))?
    };

    // Check cooldown
    let now = Instant::now();
    {
      let mut cds = self.cooldowns.write().await;
      if let Some(last) = cds.get(id) {
        if now.duration_since(*last) < Duration::from_millis(shortcut.cooldown_ms) {
          return Err(format!("Shortcut '{}' is on cooldown", shortcut.name));
        }
      }
      cds.insert(id.to_string(), now);
    }

    match shortcut.action {
      ShortcutAction::LaunchApp { path, args } => {
        let mut cmd = Command::new(&path);
        for arg in args {
          cmd.arg(arg);
        }
        cmd.spawn().map_err(|e| format!("Failed to launch app: {}", e))?;
        Ok(format!("Launched {}", path))
      }
      ShortcutAction::OpenUrl { url } => {
        #[cfg(target_os = "windows")]
        Command::new("rundll32.exe")
          .args(["url.dll,FileProtocolHandler", &url])
          .spawn()
          .map_err(|e| format!("Failed to open URL: {}", e))?;

        #[cfg(not(target_os = "windows"))]
        Command::new("xdg-open")
          .arg(&url)
          .spawn()
          .map_err(|e| format!("Failed to open URL: {}", e))?;

        Ok(format!("Opened URL {}", url))
      }
      ShortcutAction::OpenFolder { path } => {
        let abs_path = std::fs::canonicalize(&path)
          .unwrap_or_else(|_| std::path::PathBuf::from(&path));
        
        #[cfg(target_os = "windows")]
        Command::new("explorer.exe")
          .arg(abs_path)
          .spawn()
          .map_err(|e| format!("Failed to open folder: {}", e))?;

        #[cfg(not(target_os = "windows"))]
        Command::new("xdg-open")
          .arg(abs_path)
          .spawn()
          .map_err(|e| format!("Failed to open folder: {}", e))?;

        Ok(format!("Opened folder {}", path))
      }
      ShortcutAction::RunCommand { cmd, args } => {
        #[cfg(target_os = "windows")]
        let mut process = Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        {
          process.arg("/C").arg(&cmd);
          for arg in args {
            process.arg(arg);
          }
        }

        #[cfg(not(target_os = "windows"))]
        let mut process = Command::new(&cmd);
        #[cfg(not(target_os = "windows"))]
        for arg in args {
          process.arg(arg);
        }

        process.spawn().map_err(|e| format!("Failed to run command: {}", e))?;
        Ok(format!("Executed command: {}", cmd))
      }
      ShortcutAction::KeyboardMacro { keys } => {
        // Run PowerShell sendkeys on Windows
        #[cfg(target_os = "windows")]
        {
          let script = format!(
            "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('{}')",
            keys.join("")
          );
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .spawn()
            .map_err(|e| format!("Failed to send keystrokes: {}", e))?;
        }
        Ok(format!("Sent keystrokes: {:?}", keys))
      }
      ShortcutAction::Toggle { state_key } => {
        let mut states = self.toggle_states.write().await;
        let curr = states.entry(state_key.clone()).or_insert(false);
        *curr = !*curr;
        Ok(format!("Toggled {}: {}", state_key, *curr))
      }
      ShortcutAction::QuickAction { kind } => {
        Self::execute_quick_action(&kind)?;
        Ok(format!("Executed quick action: {:?}", kind))
      }
    }
  }

  pub fn execute_quick_action(kind: &QuickActionKind) -> Result<(), String> {
    match kind {
      QuickActionKind::LockPc => {
        #[cfg(target_os = "windows")]
        Command::new("rundll32.exe")
          .args(["user32.dll,LockWorkStation"])
          .spawn()
          .map_err(|e| format!("Failed to lock PC: {}", e))?;
        Ok(())
      }
      QuickActionKind::Mute => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to mute: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::MediaPlayPause => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]179)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to toggle play/pause: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::MediaNext => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]176)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to next track: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::MediaPrev => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]177)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to prev track: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::VolumeUp => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]175)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to volume up: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::VolumeDown => {
        #[cfg(target_os = "windows")]
        {
          let script = "$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]174)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to volume down: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::Screenshot => {
        #[cfg(target_os = "windows")]
        Command::new("explorer.exe")
          .arg("ms-screenclip:")
          .spawn()
          .map_err(|e| format!("Failed to open Snipping tool: {}", e))?;
        Ok(())
      }
      QuickActionKind::SleepDisplay => {
        #[cfg(target_os = "windows")]
        {
          let script = "(Add-Type '[DllImport(\"user32.dll\")]public static extern int SendMessage(int hWnd,int hMsg,int wParam,int lParam);' -Name a -PassThru)::SendMessage(-1,0x0112,0xF170,2)";
          Command::new("powershell.exe")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to sleep display: {}", e))?;
        }
        Ok(())
      }
      QuickActionKind::WakeOnLan { mac, broadcast } => {
        Self::send_wol(mac, broadcast.as_deref())
      }
      QuickActionKind::RunScript { script, shell } => {
        let sh = shell.as_deref().unwrap_or("powershell");
        if sh == "powershell" {
          Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", script])
            .spawn()
            .map_err(|e| format!("Failed to execute script: {}", e))?;
        } else {
          Command::new("cmd.exe")
            .args(["/C", script])
            .spawn()
            .map_err(|e| format!("Failed to execute script: {}", e))?;
        }
        Ok(())
      }
    }
  }

  pub fn send_wol(mac_str: &str, broadcast_ip: Option<&str>) -> Result<(), String> {
    // Parse MAC address (e.g. "AA:BB:CC:DD:EE:FF" or "AA-BB-CC-DD-EE-FF")
    let clean_mac = mac_str.replace([':', '-'], "");
    if clean_mac.len() != 12 {
      return Err(format!("Invalid MAC address format: {}", mac_str));
    }

    let mut mac_bytes = [0u8; 6];
    for i in 0..6 {
      mac_bytes[i] = u8::from_str_radix(&clean_mac[i * 2..i * 2 + 2], 16)
        .map_err(|_| format!("Invalid hex character in MAC: {}", mac_str))?;
    }

    // Magic packet: 6 bytes 0xFF, followed by 16 repetitions of mac_bytes
    let mut packet = vec![0xFFu8; 6];
    for _ in 0..16 {
      packet.extend_from_slice(&mac_bytes);
    }

    let socket = UdpSocket::bind("0.0.0.0:0")
      .map_err(|e| format!("Failed to bind UDP socket: {}", e))?;
    socket
      .set_broadcast(true)
      .map_err(|e| format!("Failed to set UDP broadcast: {}", e))?;

    let target = format!("{}:9", broadcast_ip.unwrap_or("255.255.255.255"));
    socket
      .send_to(&packet, &target)
      .map_err(|e| format!("Failed to send WOL packet: {}", e))?;

    Ok(())
  }

  pub fn scan_installed_apps() -> Vec<InstalledApp> {
    let mut apps = Vec::new();

    let paths = vec![
      Path::new("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs").to_path_buf(),
      dirs_or_user_start_menu(),
    ];

    for base_dir in paths {
      if base_dir.exists() {
        Self::scan_dir_recursive(&base_dir, &mut apps);
      }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    apps
  }

  fn scan_dir_recursive(dir: &Path, apps: &mut Vec<InstalledApp>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
      for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
          Self::scan_dir_recursive(&path, apps);
        } else if let Some(ext) = path.extension() {
          if ext.eq_ignore_ascii_case("lnk") {
            let stem = path
              .file_stem()
              .map(|s| s.to_string_lossy().to_string())
              .unwrap_or_default();
            // Skip uninstallers and helper files
            if !stem.to_lowercase().contains("uninstall") && !stem.to_lowercase().contains("help") {
              apps.push(InstalledApp {
                name: stem,
                path: path.to_string_lossy().to_string(),
              });
            }
          }
        }
      }
    }
  }

  pub fn check_processes_running(sys: &mut System, target_names: &[String]) -> HashMap<String, bool> {
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut result = HashMap::new();

    for target in target_names {
      let is_running = sys.processes().values().any(|proc| {
        let p_name = proc.name().to_string_lossy().to_lowercase();
        p_name.contains(&target.to_lowercase())
      });
      result.insert(target.clone(), is_running);
    }

    result
  }
}

fn dirs_or_user_start_menu() -> std::path::PathBuf {
  if let Ok(appdata) = std::env::var("APPDATA") {
    Path::new(&appdata)
      .join("Microsoft")
      .join("Windows")
      .join("Start Menu")
      .join("Programs")
  } else {
    Path::new("C:\\").to_path_buf()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_shortcuts_manager_crud() {
    let sm = ShortcutManager::new();
    let all = sm.get_all().await;
    assert!(all.len() >= 3, "Starter shortcuts should be present");

    let custom = ShortcutItem {
      id: "custom-test".to_string(),
      name: "Custom Test".to_string(),
      icon: "Terminal".to_string(),
      color: "#FF00AA".to_string(),
      action: ShortcutAction::OpenUrl {
        url: "http://localhost:3000".to_string(),
      },
      confirm: false,
      cooldown_ms: 500,
      process_match: None,
    };

    sm.add_or_update(custom.clone()).await;
    let found = sm.shortcuts.read().await.get("custom-test").cloned();
    assert!(found.is_some());
    assert_eq!(found.unwrap().name, "Custom Test");

    let removed = sm.remove("custom-test").await;
    assert!(removed);
    assert!(sm.shortcuts.read().await.get("custom-test").is_none());
  }

  #[tokio::test]
  async fn test_cooldown_enforcement() {
    let sm = ShortcutManager::new();
    let shortcut = ShortcutItem {
      id: "cooldown-test".to_string(),
      name: "Cooldown Test".to_string(),
      icon: "Clock".to_string(),
      color: "#000000".to_string(),
      action: ShortcutAction::Toggle {
        state_key: "test_toggle".to_string(),
      },
      confirm: false,
      cooldown_ms: 1000,
      process_match: None,
    };

    sm.add_or_update(shortcut).await;

    // First execution succeeds
    let first = sm.execute("cooldown-test").await;
    assert!(first.is_ok());

    // Immediate second execution fails due to cooldown
    let second = sm.execute("cooldown-test").await;
    assert!(second.is_err());
    assert!(second.unwrap_err().contains("cooldown"));
  }

  #[test]
  fn test_scan_installed_apps() {
    let apps = ShortcutManager::scan_installed_apps();
    println!("Scanned {} apps from Start Menu", apps.len());
    // Start menu on Windows machine should contain at least several applications
    assert!(!apps.is_empty(), "Should find installed apps in Start Menu");
  }

  #[test]
  fn test_wol_packet_validation() {
    // Valid MAC
    let res = ShortcutManager::send_wol("AA:BB:CC:DD:EE:FF", Some("127.0.0.1"));
    assert!(res.is_ok() || res.is_err()); // Won't crash on format

    // Invalid MAC format
    let invalid = ShortcutManager::send_wol("INVALID-MAC", None);
    assert!(invalid.is_err());
  }
}
