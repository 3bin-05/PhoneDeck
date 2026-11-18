use crate::git_stats::collect_git_stats;
use protocol::{AgentEvent, AgentEventKind};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, oneshot, Mutex, RwLock};

pub struct AgentHub {
    pub events: Arc<RwLock<Vec<AgentEvent>>>,
    pub pending_approvals: Arc<RwLock<HashMap<String, oneshot::Sender<bool>>>>,
    pub dedupe_cache: Arc<Mutex<HashMap<(String, String, String), u64>>>,
    pub event_tx: broadcast::Sender<AgentEvent>,
    pub goto_page_tx: broadcast::Sender<u32>,
}

impl AgentHub {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(128);
        let (goto_page_tx, _) = broadcast::channel(32);

        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            pending_approvals: Arc::new(RwLock::new(HashMap::new())),
            dedupe_cache: Arc::new(Mutex::new(HashMap::new())),
            event_tx,
            goto_page_tx,
        }
    }

    /// Dispatches an AgentEvent with deduplication and git diff enrichment.
    /// Per plan.md section 6.4:
    /// "Coalescing: dedupe by (agent, project, kind) within 2 s so flapping sessions don't spam.
    ///  When a done event arrives, the Agent runs, off the main thread with a 2 s timeout:
    ///  git diff --shortstat and git status --porcelain"
    pub async fn dispatch_event(&self, mut event: AgentEvent) {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let kind_str = format!("{:?}", event.kind);
        let key = (event.agent.clone(), event.project.clone(), kind_str);

        // 1. Deduplication check within 2000 ms
        {
            let mut cache = self.dedupe_cache.lock().await;
            if let Some(&prev_ts) = cache.get(&key) {
                if now_ms.saturating_sub(prev_ts) < 2000 {
                    log::info!("[AgentHub] Coalesced duplicate event for {:?}", key);
                    return;
                }
            }
            cache.insert(key, now_ms);
            // Prune stale cache entries older than 10s
            cache.retain(|_, &mut ts| now_ms.saturating_sub(ts) < 10000);
        }

        // 2. Enrich with git diff stats if this is a "done" event
        if event.kind == AgentEventKind::Done && !event.cwd.is_empty() {
            let cwd = event.cwd.clone();
            let duration_s = event.stats.as_ref().map(|s| s.duration_s).unwrap_or(0);

            if let Some(stats) = collect_git_stats(&cwd, duration_s).await {
                // Update summary with real git change badge
                let summary = format!(
                    "finished in {} · {} files · +{} −{} · {}s",
                    event.project,
                    stats.files_changed,
                    stats.insertions,
                    stats.deletions,
                    stats.duration_s
                );
                event.summary = summary;
                event.stats = Some(stats);
            }
        }

        log::info!(
            "[AgentHub] Dispatched event: [{}] {} - {}",
            event.agent,
            event.title,
            event.summary
        );

        // 3. Store event in history (bounded to last 50)
        {
            let mut list = self.events.write().await;
            list.insert(0, event.clone());
            if list.len() > 50 {
                list.truncate(50);
            }
        }

        // 4. Broadcast event to all connected phones via Channel 2
        let _ = self.event_tx.send(event);
    }

    /// Ask for approval from paired phone (blocks until phone answers or timeout).
    /// Per plan.md section 6.5:
    /// "Claude Code PreToolUse hook calls phonedeck ask, which blocks until phone answers or times out"
    pub async fn ask_approval(
        &self,
        prompt: String,
        command: Option<String>,
        cwd: Option<String>,
        timeout_secs: u64,
    ) -> Result<bool, String> {
        let approval_id = format!("ask-{}", Instant::now().elapsed().as_nanos());
        let (tx, rx) = oneshot::channel::<bool>();

        {
            let mut pending = self.pending_approvals.write().await;
            pending.insert(approval_id.clone(), tx);
        }

        let full_cwd = cwd.unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default()
        });

        // Create approval event for the phone
        let event = AgentEvent {
            id: approval_id.clone(),
            ts: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            agent: "phonedeck-ask".to_string(),
            project: "approval".to_string(),
            cwd: full_cwd,
            kind: AgentEventKind::Approval,
            title: "Approval Required".to_string(),
            summary: command
                .as_ref()
                .map(|cmd| format!("{} | Command: {}", prompt, cmd))
                .unwrap_or(prompt),
            stats: None,
            actions: vec!["approve".to_string(), "deny".to_string()],
            expires_at: Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
                    + timeout_secs,
            ),
        };

        self.dispatch_event(event).await;

        // Block with timeout
        match tokio::time::timeout(Duration::from_secs(timeout_secs), rx).await {
            Ok(Ok(decision)) => {
                log::info!("[AgentHub] Approval {} resolved: {}", approval_id, decision);
                Ok(decision)
            }
            Ok(Err(_)) => Err("Approval channel dropped unexpectedly".to_string()),
            Err(_) => {
                log::warn!("[AgentHub] Approval {} timed out after {}s", approval_id, timeout_secs);
                // Clean up pending map
                let mut pending = self.pending_approvals.write().await;
                pending.remove(&approval_id);
                Err("Approval timed out".to_string())
            }
        }
    }

    /// Resolves a pending approval with phone's decision
    pub async fn resolve_approval(&self, id: &str, approved: bool) -> bool {
        let mut pending = self.pending_approvals.write().await;
        if let Some(tx) = pending.remove(id) {
            let _ = tx.send(approved);
            true
        } else {
            false
        }
    }

    /// Executes PC action (Open in editor, Open folder, etc.)
    pub fn execute_action(&self, action: &str, cwd: &str) -> Result<(), String> {
        match action {
            "open_editor" => {
                log::info!("[AgentHub] Opening editor in {}", cwd);
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "code", cwd])
                        .spawn();
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = std::process::Command::new("code")
                        .arg(cwd)
                        .spawn();
                }
                Ok(())
            }
            "open_folder" => {
                log::info!("[AgentHub] Opening file explorer in {}", cwd);
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("explorer")
                        .arg(cwd)
                        .spawn();
                }
                #[cfg(target_os = "macos")]
                {
                    let _ = std::process::Command::new("open")
                        .arg(cwd)
                        .spawn();
                }
                #[cfg(target_os = "linux")]
                {
                    let _ = std::process::Command::new("xdg-open")
                        .arg(cwd)
                        .spawn();
                }
                Ok(())
            }
            _ => Err(format!("Unknown action: {}", action)),
        }
    }
}
