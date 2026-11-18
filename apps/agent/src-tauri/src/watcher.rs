use crate::hub::AgentHub;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use protocol::{AgentEvent, AgentEventKind};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

pub fn spawn_session_watcher(hub: Arc<AgentHub>) {
    tokio::spawn(async move {
        let home_dir = match std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
            Ok(h) => PathBuf::from(h),
            Err(_) => return,
        };

        let watch_dirs = vec![
            home_dir.join(".claude").join("projects"),
            home_dir.join(".claude").join("sessions"),
            home_dir.join(".codex").join("sessions"),
        ];

        let debounce_map: Arc<Mutex<HashMap<PathBuf, Instant>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (tx, mut rx) = tokio::sync::mpsc::channel::<PathBuf>(64);

        let tx_clone = tx.clone();
        let watcher_res = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            for path in event.paths {
                                if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                                    let _ = tx_clone.blocking_send(path);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        );

        let mut watcher = match watcher_res {
            Ok(w) => w,
            Err(e) => {
                log::warn!("[Watcher] Failed to initialize file watcher: {}", e);
                return;
            }
        };

        for dir in &watch_dirs {
            if dir.exists() {
                if let Err(e) = watcher.watch(dir, RecursiveMode::Recursive) {
                    log::warn!("[Watcher] Could not watch {}: {}", dir.display(), e);
                } else {
                    log::info!("[Watcher] Watching AI session dir: {}", dir.display());
                }
            }
        }

        // Process debounced events
        while let Some(path) = rx.recv().await {
            let mut map = debounce_map.lock().await;
            let now = Instant::now();
            if let Some(&prev) = map.get(&path) {
                if now.duration_since(prev) < Duration::from_millis(800) {
                    continue;
                }
            }
            map.insert(path.clone(), now);

            // Read last line of session file
            if let Some(event) = inspect_session_file(&path).await {
                hub.dispatch_event(event).await;
            }
        }
    });
}

async fn inspect_session_file(path: &Path) -> Option<AgentEvent> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);

    let last_line = reader.lines().filter_map(|l| l.ok()).last()?;
    let v: serde_json::Value = serde_json::from_str(&last_line).ok()?;

    let event_type = v.get("type").and_then(|t| t.as_str())?;

    // Determine agent from path
    let path_str = path.to_string_lossy();
    let (agent, project) = if path_str.contains(".claude") {
        let proj = path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().replace("D--", "").replace("C--", ""))
            .unwrap_or_else(|| "claude-project".to_string());
        ("claude-code".to_string(), proj)
    } else {
        ("codex".to_string(), "codex-project".to_string())
    };

    let session_id = v
        .get("sessionId")
        .and_then(|s| s.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        });

    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    if event_type == "cost-state" || event_type == "done" || event_type == "turn_complete" {
        Some(AgentEvent {
            id: format!("watch-{}", session_id),
            ts: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            agent,
            project,
            cwd,
            kind: AgentEventKind::Done,
            title: "Task Finished".to_string(),
            summary: "Session updated - awaiting review".to_string(),
            stats: None,
            actions: vec![
                "open_editor".to_string(),
                "open_folder".to_string(),
                "mark_reviewed".to_string(),
                "dismiss".to_string(),
            ],
            expires_at: None,
        })
    } else {
        None
    }
}
