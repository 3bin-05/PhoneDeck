use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use sysinfo::{ProcessesToUpdate, System};
use tokio::sync::RwLock;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MENU,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, PostMessageW, ShowWindow,
    SetForegroundWindow, SW_RESTORE, SW_SHOW, WM_CLOSE,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppMatchRules {
    pub exe_names: Vec<String>,
    pub window_class: Option<String>,
    pub title_regex: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppLaunchConfig {
    pub path: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuickLaunchItem {
    pub id: String,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TitleParserConfig {
    pub parser_type: String, // "vscode" | "browser" | "custom"
    pub template: Option<String>,
    pub strip_suffix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppDefinition {
    pub id: String,
    pub name: String,
    pub match_rules: AppMatchRules,
    pub launch: AppLaunchConfig,
    pub quick_launches: Vec<QuickLaunchItem>,
    pub actions: Vec<String>,
    pub title_parser: Option<TitleParserConfig>,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct AppRuntimeState {
    pub id: String,
    pub name: String,
    pub running: bool,
    pub instances: u32,
    pub focused: bool,
    pub cpu_pct: f32,
    pub ram_bytes: u64,
    pub window_titles: Vec<String>,
    pub project: Option<String>,
    pub file: Option<String>,
    pub unsaved: bool,
    pub tab_title: Option<String>,
    pub audio_active: bool,
    pub icon_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcessInfo {
    pub pid: u32,
    pub name: String,
    pub exe_path: Option<String>,
    pub window_title: Option<String>,
}

const PROTECTED_PROCESSES: &[&str] = &[
    "system",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "winlogon.exe",
    "explorer.exe",
    "dwm.exe",
    "svchost.exe",
    "spoolsv.exe",
    "taskhostw.exe",
    "runtimebroker.exe",
    "sihost.exe",
    "phonedeck.exe",
    "agent.exe",
];

pub struct AppRegistryManager {
    apps: Arc<RwLock<HashMap<String, AppDefinition>>>,
    runtime_states: Arc<RwLock<HashMap<String, AppRuntimeState>>>,
    active_subscriptions: Arc<RwLock<HashSet<String>>>,
    system: Arc<RwLock<System>>,
    #[allow(dead_code)]
    icon_cache: Arc<RwLock<HashMap<String, Vec<u8>>>>, // icon_id -> png/webp bytes
    telemetry_hub: Arc<crate::sensors::TelemetryHub>,
    media_manager: Arc<crate::media_session::MediaSessionManager>,
    is_paused: Arc<AtomicBool>,
}

impl AppRegistryManager {
    pub fn new(
        telemetry_hub: Arc<crate::sensors::TelemetryHub>,
        media_manager: Arc<crate::media_session::MediaSessionManager>,
    ) -> Arc<Self> {
        let mut default_apps = HashMap::new();

        // 1. Visual Studio Code preset
        default_apps.insert(
            "vscode".to_string(),
            AppDefinition {
                id: "vscode".to_string(),
                name: "Visual Studio Code".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["code.exe".to_string(), "code".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "code".to_string(),
                    args: vec![".".to_string()],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "project".to_string(),
                        label: "Open Project".to_string(),
                        value: ".".to_string(),
                    },
                    QuickLaunchItem {
                        id: "new-win".to_string(),
                        label: "New Window".to_string(),
                        value: "-n".to_string(),
                    },
                ],
                actions: vec![
                    "focus".to_string(),
                    "new_window".to_string(),
                    "close_window".to_string(),
                    "quit".to_string(),
                ],
                title_parser: Some(TitleParserConfig {
                    parser_type: "vscode".to_string(),
                    template: Some("{file} - {project} - Visual Studio Code".to_string()),
                    strip_suffix: Some(" - Visual Studio Code".to_string()),
                }),
                icon: "Code".to_string(),
            },
        );

        // 2. Opera preset
        default_apps.insert(
            "opera".to_string(),
            AppDefinition {
                id: "opera".to_string(),
                name: "Opera".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["opera.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "opera".to_string(),
                    args: vec![],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "google".to_string(),
                        label: "Search".to_string(),
                        value: "https://www.google.com".to_string(),
                    },
                    QuickLaunchItem {
                        id: "github".to_string(),
                        label: "GitHub".to_string(),
                        value: "https://github.com".to_string(),
                    },
                ],
                actions: vec![
                    "focus".to_string(),
                    "new_window".to_string(),
                    "private_window".to_string(),
                    "close_window".to_string(),
                    "quit".to_string(),
                ],
                title_parser: Some(TitleParserConfig {
                    parser_type: "browser".to_string(),
                    template: None,
                    strip_suffix: Some(" - Opera".to_string()),
                }),
                icon: "Compass".to_string(),
            },
        );

        // 3. Opera GX preset
        default_apps.insert(
            "operagx".to_string(),
            AppDefinition {
                id: "operagx".to_string(),
                name: "Opera GX".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["opera.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "opera".to_string(),
                    args: vec![],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "twitch".to_string(),
                        label: "Twitch".to_string(),
                        value: "https://twitch.tv".to_string(),
                    },
                    QuickLaunchItem {
                        id: "ytm".to_string(),
                        label: "YouTube Music".to_string(),
                        value: "https://music.youtube.com".to_string(),
                    },
                ],
                actions: vec![
                    "focus".to_string(),
                    "new_window".to_string(),
                    "private_window".to_string(),
                    "close_window".to_string(),
                    "quit".to_string(),
                ],
                title_parser: Some(TitleParserConfig {
                    parser_type: "browser".to_string(),
                    template: None,
                    strip_suffix: Some(" - Opera GX".to_string()),
                }),
                icon: "Flame".to_string(),
            },
        );

        // 4. Google Chrome preset
        default_apps.insert(
            "chrome".to_string(),
            AppDefinition {
                id: "chrome".to_string(),
                name: "Google Chrome".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["chrome.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "chrome".to_string(),
                    args: vec![],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "home".to_string(),
                        label: "New Tab".to_string(),
                        value: "chrome://newtab".to_string(),
                    },
                ],
                actions: vec![
                    "focus".to_string(),
                    "new_window".to_string(),
                    "private_window".to_string(),
                    "close_window".to_string(),
                    "quit".to_string(),
                ],
                title_parser: Some(TitleParserConfig {
                    parser_type: "browser".to_string(),
                    template: None,
                    strip_suffix: Some(" - Google Chrome".to_string()),
                }),
                icon: "Globe".to_string(),
            },
        );

        // 5. Spotify preset
        default_apps.insert(
            "spotify".to_string(),
            AppDefinition {
                id: "spotify".to_string(),
                name: "Spotify".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["spotify.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "spotify".to_string(),
                    args: vec![],
                },
                quick_launches: vec![],
                actions: vec!["focus".to_string(), "close_window".to_string(), "quit".to_string()],
                title_parser: None,
                icon: "Music".to_string(),
            },
        );

        // 6. Discord preset
        default_apps.insert(
            "discord".to_string(),
            AppDefinition {
                id: "discord".to_string(),
                name: "Discord".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["discord.exe".to_string(), "update.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "discord".to_string(),
                    args: vec![],
                },
                quick_launches: vec![],
                actions: vec!["focus".to_string(), "close_window".to_string(), "quit".to_string()],
                title_parser: None,
                icon: "MessageSquare".to_string(),
            },
        );

        // 7. Windows Terminal preset
        default_apps.insert(
            "terminal".to_string(),
            AppDefinition {
                id: "terminal".to_string(),
                name: "Windows Terminal".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["wt.exe".to_string(), "windowsterminal.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "wt".to_string(),
                    args: vec![],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "pwsh".to_string(),
                        label: "PowerShell".to_string(),
                        value: "pwsh".to_string(),
                    },
                ],
                actions: vec!["focus".to_string(), "new_window".to_string(), "close_window".to_string(), "quit".to_string()],
                title_parser: None,
                icon: "Terminal".to_string(),
            },
        );

        // 8. File Explorer preset
        default_apps.insert(
            "explorer".to_string(),
            AppDefinition {
                id: "explorer".to_string(),
                name: "File Explorer".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["explorer.exe".to_string()],
                    window_class: None,
                    title_regex: None,
                },
                launch: AppLaunchConfig {
                    path: "explorer".to_string(),
                    args: vec![".".to_string()],
                },
                quick_launches: vec![
                    QuickLaunchItem {
                        id: "downloads".to_string(),
                        label: "Downloads".to_string(),
                        value: "shell:Downloads".to_string(),
                    },
                ],
                actions: vec!["focus".to_string(), "new_window".to_string()],
                title_parser: None,
                icon: "Folder".to_string(),
            },
        );

        // 9. Antigravity preset (detected on machine)
        default_apps.insert(
            "antigravity".to_string(),
            AppDefinition {
                id: "antigravity".to_string(),
                name: "Antigravity".to_string(),
                match_rules: AppMatchRules {
                    exe_names: vec!["antigravity.exe".to_string(), "agent.exe".to_string()],
                    window_class: None,
                    title_regex: Some(".*Antigravity.*".to_string()),
                },
                launch: AppLaunchConfig {
                    path: "antigravity".to_string(),
                    args: vec![],
                },
                quick_launches: vec![],
                actions: vec!["focus".to_string()],
                title_parser: None,
                icon: "Sparkles".to_string(),
            },
        );

        let mgr = Arc::new(Self {
            apps: Arc::new(RwLock::new(default_apps)),
            runtime_states: Arc::new(RwLock::new(HashMap::new())),
            active_subscriptions: Arc::new(RwLock::new(HashSet::from([
                "vscode".to_string(),
                "opera".to_string(),
                "operagx".to_string(),
            ]))),
            system: Arc::new(RwLock::new(System::new_all())),
            icon_cache: Arc::new(RwLock::new(HashMap::new())),
            telemetry_hub,
            media_manager,
            is_paused: Arc::new(AtomicBool::new(false)),
        });

        // Start background polling loop for subscribed apps (adaptive 1..5 s)
        let loop_mgr = mgr.clone();
        tauri::async_runtime::spawn(async move {
            loop_mgr.run_polling_loop().await;
        });

        mgr
    }

    /// Background polling loop with adaptive backoff (1s active, 5s when stable).
    /// Fully parks when no clients connected or when dimmed/dark.
    async fn run_polling_loop(&self) {
        let mut stable_ticks = 0u32;

        loop {
            // Adaptive sleep interval
            let delay_ms = if stable_ticks > 5 { 5000 } else { 1500 };
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;

            // Check if paused or no active clients
            if self.is_paused.load(Ordering::SeqCst) || self.telemetry_hub.client_count.load(Ordering::SeqCst) == 0 {
                stable_ticks = 10;
                continue;
            }

            let subscribed = {
                let subs = self.active_subscriptions.read().await;
                subs.clone()
            };

            if subscribed.is_empty() {
                continue;
            }

            let changed = self.poll_subscribed_apps(&subscribed).await;
            if changed {
                stable_ticks = 0;
            } else {
                stable_ticks = stable_ticks.saturating_add(1);
            }
        }
    }

    /// Performs ONE single pass across windows and processes for all subscribed apps.
    pub async fn poll_subscribed_apps(&self, subscribed: &HashSet<String>) -> bool {
        // Refresh processes in sysinfo
        {
            let mut sys = self.system.write().await;
            sys.refresh_processes(ProcessesToUpdate::All, true);
        }

        let app_defs = {
            let map = self.apps.read().await;
            map.clone()
        };

        // Collect top-level window titles and foreground window info
        let (window_map, foreground_hwnd) = Self::collect_windows();

        // Get media state for audio active badge
        let (media_source, is_media_playing) = {
            let media_snap = self.media_manager.snapshot.read().unwrap();
            (media_snap.source_app.to_lowercase(), media_snap.playing)
        };

        let mut next_states = HashMap::new();
        let sys = self.system.read().await;

        for app_id in subscribed {
            if let Some(app) = app_defs.get(app_id) {
                let mut instances = 0u32;
                let mut cpu_pct = 0.0f32;
                let mut ram_bytes = 0u64;
                let mut app_pids = HashSet::new();

                for (pid, proc) in sys.processes() {
                    let proc_name = proc.name().to_string_lossy().to_lowercase();
                    let matches = app.match_rules.exe_names.iter().any(|target| {
                        proc_name == target.to_lowercase()
                            || proc_name.starts_with(&target.to_lowercase().replace(".exe", ""))
                    });

                    if matches {
                        instances += 1;
                        cpu_pct += proc.cpu_usage();
                        ram_bytes += proc.memory();
                        app_pids.insert(pid.as_u32());
                    }
                }

                let running = instances > 0;
                let mut window_titles = Vec::new();
                let mut focused = false;

                for win in &window_map {
                    if app_pids.contains(&win.pid) || app.match_rules.exe_names.iter().any(|n| win.exe_name.eq_ignore_ascii_case(n)) {
                        if !win.title.is_empty() && !window_titles.contains(&win.title) {
                            window_titles.push(win.title.clone());
                        }
                        if let Some(fg) = foreground_hwnd {
                            if win.hwnd == fg {
                                focused = true;
                            }
                        }
                    }
                }

                let primary_title = window_titles.first().cloned().unwrap_or_default();
                let is_audio = is_media_playing
                    && (media_source.contains(&app.name.to_lowercase())
                        || media_source.contains(&app.id.to_lowercase())
                        || app.match_rules.exe_names.iter().any(|n| media_source.contains(&n.replace(".exe", ""))));

                let (project, file, unsaved, tab_title, audio_active) =
                    Self::parse_title(&primary_title, &app.title_parser, is_audio);

                let state = AppRuntimeState {
                    id: app.id.clone(),
                    name: app.name.clone(),
                    running,
                    instances,
                    focused,
                    cpu_pct,
                    ram_bytes,
                    window_titles,
                    project,
                    file,
                    unsaved,
                    tab_title,
                    audio_active,
                    icon_url: format!("http://127.0.0.1:8765/api/app/icon/{}", app.id),
                };

                next_states.insert(app.id.clone(), state);
            }
        }

        // Compare with existing runtime states to detect changes
        let mut changed = false;
        {
            let mut cur_states = self.runtime_states.write().await;
            for (id, state) in &next_states {
                if cur_states.get(id) != Some(state) {
                    changed = true;
                    cur_states.insert(id.clone(), state.clone());
                }
            }
        }

        if changed {
            // Emit delta under FieldId::AppStates (32)
            if let Ok(json_str) = serde_json::to_string(&next_states) {
                let mut delta = protocol::TelemetryDelta::default();
                delta.updates.insert(
                    protocol::FieldId::AppStates.id(),
                    protocol::MetricValue::String(json_str),
                );
                let env = protocol::Envelope::telemetry(0, delta);
                if let Ok(bytes) = protocol::to_msgpack(&env) {
                    let _ = self.telemetry_hub.telemetry_tx.send(bytes);
                }
            }
        }

        changed
    }

    /// Title parser helper: parses VS Code, Browser tabs, or custom format
    pub fn parse_title(
        raw_title: &str,
        parser_cfg: &Option<TitleParserConfig>,
        is_audio: bool,
    ) -> (Option<String>, Option<String>, bool, Option<String>, bool) {
        if raw_title.is_empty() {
            return (None, None, false, None, is_audio);
        }

        let Some(cfg) = parser_cfg else {
            return (None, None, false, None, is_audio);
        };

        match cfg.parser_type.as_str() {
            "vscode" => {
                let unsaved = raw_title.starts_with('●') || raw_title.contains('●');
                let clean = raw_title
                    .replace('●', "")
                    .replace("[Extension Development Host]", "")
                    .trim()
                    .to_string();

                let without_suffix = clean
                    .strip_suffix(" - Visual Studio Code")
                    .unwrap_or(&clean)
                    .trim();

                let parts: Vec<&str> = without_suffix.split(" - ").collect();
                if parts.len() >= 2 {
                    let file = Some(parts[0].trim().to_string());
                    let project = Some(parts[1].trim().to_string());
                    (project, file, unsaved, None, false)
                } else if parts.len() == 1 && !parts[0].is_empty() {
                    let project = Some(parts[0].trim().to_string());
                    (project, None, unsaved, None, false)
                } else {
                    (Some(without_suffix.to_string()), None, unsaved, None, false)
                }
            }
            "browser" => {
                let mut title = raw_title.trim();
                if let Some(ref suffix) = cfg.strip_suffix {
                    title = title.strip_suffix(suffix).unwrap_or(title);
                }
                title = title
                    .strip_suffix(" - Opera GX")
                    .unwrap_or(title)
                    .strip_suffix(" - Opera")
                    .unwrap_or(title)
                    .strip_suffix(" - Google Chrome")
                    .unwrap_or(title)
                    .strip_suffix(" - Chromium")
                    .unwrap_or(title)
                    .trim();

                (None, None, false, Some(title.to_string()), is_audio)
            }
            _ => (None, None, false, Some(raw_title.to_string()), is_audio),
        }
    }

    /// Collects visible windows on Windows (or empty vector on other OS)
    fn collect_windows() -> (Vec<WindowEntry>, Option<usize>) {
        #[cfg(target_os = "windows")]
        {
            let mut entries = Vec::new();
            let entries_ptr = &mut entries as *mut Vec<WindowEntry>;

            unsafe {
                let _ = EnumWindows(Some(enum_windows_proc), LPARAM(entries_ptr as isize));
            }

            let fg = unsafe {
                let fg_hwnd = GetForegroundWindow();
                if !fg_hwnd.0.is_null() {
                    Some(fg_hwnd.0 as usize)
                } else {
                    None
                }
            };

            (entries, fg)
        }

        #[cfg(not(target_os = "windows"))]
        {
            (Vec::new(), None)
        }
    }

    pub async fn get_all_apps(&self) -> Vec<AppDefinition> {
        self.apps.read().await.values().cloned().collect()
    }

    pub async fn add_or_update_app(&self, app: AppDefinition) {
        self.apps.write().await.insert(app.id.clone(), app);
    }

    pub async fn remove_app(&self, id: &str) -> bool {
        self.apps.write().await.remove(id).is_some()
    }

    pub async fn update_subscriptions(&self, subscribed_ids: Vec<String>) {
        let mut subs = self.active_subscriptions.write().await;
        subs.clear();
        for id in subscribed_ids {
            subs.insert(id);
        }
    }

    pub async fn get_runtime_states(&self) -> HashMap<String, AppRuntimeState> {
        self.runtime_states.read().await.clone()
    }

    pub fn set_paused(&self, paused: bool) {
        self.is_paused.store(paused, Ordering::SeqCst);
    }

    /// Executes an app action (focus, launch, new_window, close_window, quit, quick_launch)
    pub async fn execute_action(
        &self,
        app_id: &str,
        action: &str,
        quick_launch_id: Option<&str>,
    ) -> Result<String, String> {
        let app = {
            let map = self.apps.read().await;
            map.get(app_id)
                .cloned()
                .ok_or_else(|| format!("App '{}' not found in registry", app_id))?
        };

        log::info!(
            "[AppRegistry] Executing action '{}' on app '{}' (quick_launch_id: {:?})",
            action,
            app_id,
            quick_launch_id
        );

        match action {
            "launch" => {
                let mut cmd = Command::new(&app.launch.path);
                for arg in &app.launch.args {
                    cmd.arg(arg);
                }
                cmd.spawn().map_err(|e| format!("Failed to launch {}: {}", app.name, e))?;
                Ok(format!("Launched {}", app.name))
            }
            "focus" => {
                #[cfg(target_os = "windows")]
                {
                    let (windows, _) = Self::collect_windows();
                    let sys = self.system.read().await;
                    let mut target_hwnd = None;

                    for win in windows {
                        for (_, proc) in sys.processes() {
                            if proc.pid().as_u32() == win.pid {
                                let proc_name = proc.name().to_string_lossy().to_lowercase();
                                if app.match_rules.exe_names.iter().any(|n| proc_name.contains(&n.to_lowercase().replace(".exe", ""))) {
                                    target_hwnd = Some(HWND(win.hwnd as *mut _));
                                    break;
                                }
                            }
                        }
                        if target_hwnd.is_some() {
                            break;
                        }
                    }

                    if let Some(hwnd) = target_hwnd {
                        let success = unsafe { Self::force_foreground_window(hwnd) };
                        if success {
                            Ok(format!("Focused {}", app.name))
                        } else {
                            Err(format!("Could not bring {} to foreground", app.name))
                        }
                    } else {
                        // Not running or has no visible window: launch it
                        let mut cmd = Command::new(&app.launch.path);
                        for arg in &app.launch.args {
                            cmd.arg(arg);
                        }
                        cmd.spawn().map_err(|e| format!("Failed to launch {}: {}", app.name, e))?;
                        Ok(format!("Launched {}", app.name))
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    Ok(format!("Focus triggered for {}", app.name))
                }
            }
            "new_window" => {
                let mut cmd = Command::new(&app.launch.path);
                match app_id {
                    "vscode" => {
                        cmd.arg("-n");
                    }
                    "opera" | "operagx" | "chrome" => {
                        cmd.arg("--new-window");
                    }
                    "terminal" => {
                        cmd.args(["-w", "0", "new-tab"]);
                    }
                    _ => {
                        for arg in &app.launch.args {
                            cmd.arg(arg);
                        }
                    }
                }
                cmd.spawn().map_err(|e| format!("Failed to open new window for {}: {}", app.name, e))?;
                Ok(format!("Opened new window for {}", app.name))
            }
            "private_window" => {
                let mut cmd = Command::new(&app.launch.path);
                match app_id {
                    "opera" | "operagx" => {
                        cmd.arg("--private");
                    }
                    "chrome" => {
                        cmd.arg("--incognito");
                    }
                    _ => {
                        cmd.arg("--private");
                    }
                }
                cmd.spawn().map_err(|e| format!("Failed to open private window for {}: {}", app.name, e))?;
                Ok(format!("Opened private window for {}", app.name))
            }
            "close_window" => {
                #[cfg(target_os = "windows")]
                {
                    let (windows, _) = Self::collect_windows();
                    let sys = self.system.read().await;
                    let mut closed = false;

                    for win in windows {
                        for (_, proc) in sys.processes() {
                            if proc.pid().as_u32() == win.pid {
                                let proc_name = proc.name().to_string_lossy().to_lowercase();
                                if app.match_rules.exe_names.iter().any(|n| proc_name.contains(&n.to_lowercase().replace(".exe", ""))) {
                                    unsafe {
                                        let _ = PostMessageW(HWND(win.hwnd as *mut _), WM_CLOSE, WPARAM(0), LPARAM(0));
                                    }
                                    closed = true;
                                    break;
                                }
                            }
                        }
                        if closed {
                            break;
                        }
                    }

                    if closed {
                        Ok(format!("Closed window of {}", app.name))
                    } else {
                        Err(format!("No open window found for {}", app.name))
                    }
                }

                #[cfg(not(target_os = "windows"))]
                {
                    Ok(format!("Closed window of {}", app.name))
                }
            }
            "quit" => {
                // Terminate processes, enforcing denylist safety
                let sys = self.system.read().await;
                let mut terminated_count = 0;

                for (_, proc) in sys.processes() {
                    let proc_name = proc.name().to_string_lossy().to_lowercase();
                    let is_protected = PROTECTED_PROCESSES.iter().any(|p| proc_name == *p);
                    if is_protected {
                        continue;
                    }

                    let matches = app.match_rules.exe_names.iter().any(|target| {
                        proc_name == target.to_lowercase()
                            || proc_name.starts_with(&target.to_lowercase().replace(".exe", ""))
                    });

                    if matches {
                        let _ = proc.kill();
                        terminated_count += 1;
                    }
                }

                log::warn!(
                    "[AppRegistry] Terminated {} instances of {}",
                    terminated_count,
                    app.name
                );
                Ok(format!("Quit {} ({} instances terminated)", app.name, terminated_count))
            }
            "quick_launch" => {
                let ql_id = quick_launch_id.ok_or_else(|| "Missing quick launch id".to_string())?;
                let item = app
                    .quick_launches
                    .iter()
                    .find(|q| q.id == ql_id)
                    .ok_or_else(|| format!("Quick launch '{}' not found", ql_id))?;

                let mut cmd = Command::new(&app.launch.path);
                if !item.value.is_empty() {
                    cmd.arg(&item.value);
                }
                cmd.spawn().map_err(|e| format!("Failed to launch quick action {}: {}", item.label, e))?;
                Ok(format!("Launched {} ({})", app.name, item.label))
            }
            _ => Err(format!("Unknown action: {}", action)),
        }
    }

    /// Detect running processes for the editor picker
    pub async fn detect_running_processes(&self) -> Vec<RunningProcessInfo> {
        let (windows, _) = Self::collect_windows();
        let mut sys = self.system.write().await;
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut result = Vec::new();
        let mut seen = HashSet::new();

        for (pid, proc) in sys.processes() {
            let pid_u32 = pid.as_u32();
            let name = proc.name().to_string_lossy().to_string();

            if seen.contains(&name.to_lowercase()) {
                continue;
            }
            seen.insert(name.to_lowercase());

            let exe_path = proc.exe().map(|p| p.to_string_lossy().to_string());
            let win_title = windows.iter().find(|w| w.pid == pid_u32).map(|w| w.title.clone());

            result.push(RunningProcessInfo {
                pid: pid_u32,
                name,
                exe_path,
                window_title: win_title,
            });
        }

        result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        result
    }

    #[cfg(target_os = "windows")]
    unsafe fn force_foreground_window(hwnd: HWND) -> bool {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        let foreground_hwnd = GetForegroundWindow();
        if foreground_hwnd == hwnd {
            return true;
        }

        let foreground_thread_id = GetWindowThreadProcessId(foreground_hwnd, None);
        let current_thread_id = GetCurrentThreadId();

        if foreground_thread_id != current_thread_id {
            let _ = AttachThreadInput(current_thread_id, foreground_thread_id, true);
            keybd_event(VK_MENU.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
            let res = SetForegroundWindow(hwnd);
            keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
            let _ = AttachThreadInput(current_thread_id, foreground_thread_id, false);
            res.as_bool()
        } else {
            SetForegroundWindow(hwnd).as_bool()
        }
    }
}

struct WindowEntry {
    hwnd: usize,
    pid: u32,
    title: String,
    exe_name: String,
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let len = GetWindowTextLengthW(hwnd);
    if len == 0 {
        return BOOL(1);
    }

    let mut buf = vec![0u16; (len + 1) as usize];
    let actual_len = GetWindowTextW(hwnd, &mut buf);
    if actual_len == 0 {
        return BOOL(1);
    }

    let title = String::from_utf16_lossy(&buf[..actual_len as usize]);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));

    let entries_ptr = lparam.0 as *mut Vec<WindowEntry>;
    if !entries_ptr.is_null() {
        (*entries_ptr).push(WindowEntry {
            hwnd: hwnd.0 as usize,
            pid,
            title,
            exe_name: String::new(),
        });
    }

    BOOL(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vscode_title_parser() {
        let parser_cfg = Some(TitleParserConfig {
            parser_type: "vscode".to_string(),
            template: Some("{file} - {project} - Visual Studio Code".to_string()),
            strip_suffix: Some(" - Visual Studio Code".to_string()),
        });

        // 1. Saved file in project
        let t1 = "App.tsx - PhoneDeck - Visual Studio Code";
        let (proj1, file1, unsaved1, tab1, _) = AppRegistryManager::parse_title(t1, &parser_cfg, false);
        assert_eq!(proj1.as_deref(), Some("PhoneDeck"));
        assert_eq!(file1.as_deref(), Some("App.tsx"));
        assert!(!unsaved1);
        assert_eq!(tab1, None);

        // 2. Unsaved dot bullet
        let t2 = "● shortcuts.rs - PhoneDeck - Visual Studio Code";
        let (proj2, file2, unsaved2, _, _) = AppRegistryManager::parse_title(t2, &parser_cfg, false);
        assert_eq!(proj2.as_deref(), Some("PhoneDeck"));
        assert_eq!(file2.as_deref(), Some("shortcuts.rs"));
        assert!(unsaved2);

        // 3. Project only
        let t3 = "PhoneDeck - Visual Studio Code";
        let (proj3, file3, unsaved3, _, _) = AppRegistryManager::parse_title(t3, &parser_cfg, false);
        assert_eq!(proj3.as_deref(), Some("PhoneDeck"));
        assert_eq!(file3, None);
        assert!(!unsaved3);
    }

    #[test]
    fn test_opera_title_parser() {
        let parser_cfg = Some(TitleParserConfig {
            parser_type: "browser".to_string(),
            template: None,
            strip_suffix: Some(" - Opera GX".to_string()),
        });

        let t1 = "Aphex Twin - Selected Ambient Works - YouTube Music - Opera GX";
        let (proj, file, unsaved, tab, audio) = AppRegistryManager::parse_title(t1, &parser_cfg, true);
        assert_eq!(proj, None);
        assert_eq!(file, None);
        assert!(!unsaved);
        assert_eq!(tab.as_deref(), Some("Aphex Twin - Selected Ambient Works - YouTube Music"));
        assert!(audio);
    }

    #[test]
    fn test_protected_process_denylist() {
        for proc in PROTECTED_PROCESSES {
            assert!(PROTECTED_PROCESSES.contains(proc));
        }
        assert!(PROTECTED_PROCESSES.contains(&"explorer.exe"));
        assert!(PROTECTED_PROCESSES.contains(&"csrss.exe"));
    }
}
