use protocol::AgentEvent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum RuleTrigger {
  AiSessionDone { agent: Option<String>, project: Option<String> },
  AiNeedsInput,
  FullscreenProcess { process_name: Option<String> },
  CpuAboveThreshold { percent: f32, duration_secs: u64 },
  UserIdle { minutes: u64 },
  TimeWindow { start: String, end: String }, // e.g. "22:00" to "07:00"
  WebhookValue { key: String, expected: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum RuleAction {
  GotoPage { page: u32 },
  Vibrate { pattern: String },
  SetTheme { theme_name: String },
  ShowNotification { title: String, message: String, kind: String },
  PulseAlert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleDefinition {
  pub id: String,
  pub name: String,
  pub enabled: bool,
  pub when: RuleTrigger,
  pub then: RuleAction,
  pub only_while_it_lasts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleExecutionEvent {
  pub rule_id: String,
  pub rule_name: String,
  pub action: RuleAction,
  pub is_restore: bool,
}

pub struct RulesEngine {
  rules: Arc<RwLock<Vec<RuleDefinition>>>,
  active_rules: Arc<RwLock<HashMap<String, bool>>>,
  // Memory for "only while it lasts" restoration
  saved_page: Arc<RwLock<Option<u32>>>,
  saved_theme: Arc<RwLock<Option<String>>>,
  // High CPU timer tracking
  high_cpu_start: Arc<RwLock<Option<Instant>>>,
  // Broadcast sender for executed actions
  action_tx: broadcast::Sender<RuleExecutionEvent>,
}

impl RulesEngine {
  pub fn new() -> Self {
    let (action_tx, _) = broadcast::channel(32);

    let starter_rules = vec![
      RuleDefinition {
        id: "ai-done-alert".to_string(),
        name: "AI Finished -> Switch to Dev Page & Vibrate".to_string(),
        enabled: true,
        when: RuleTrigger::AiSessionDone {
          agent: None,
          project: None,
        },
        then: RuleAction::GotoPage { page: 1 },
        only_while_it_lasts: false,
      },
      RuleDefinition {
        id: "cpu-spike-pulse".to_string(),
        name: "CPU > 90% for 15s -> Pulse Alert".to_string(),
        enabled: true,
        when: RuleTrigger::CpuAboveThreshold {
          percent: 90.0,
          duration_secs: 15,
        },
        then: RuleAction::PulseAlert,
        only_while_it_lasts: true,
      },
      RuleDefinition {
        id: "night-theme-schedule".to_string(),
        name: "22:00 to 07:00 -> Void Night Theme".to_string(),
        enabled: true,
        when: RuleTrigger::TimeWindow {
          start: "22:00".to_string(),
          end: "07:00".to_string(),
        },
        then: RuleAction::SetTheme {
          theme_name: "void".to_string(),
        },
        only_while_it_lasts: true,
      },
    ];

    Self {
      rules: Arc::new(RwLock::new(starter_rules)),
      active_rules: Arc::new(RwLock::new(HashMap::new())),
      saved_page: Arc::new(RwLock::new(None)),
      saved_theme: Arc::new(RwLock::new(None)),
      high_cpu_start: Arc::new(RwLock::new(None)),
      action_tx,
    }
  }

  pub fn subscribe(&self) -> broadcast::Receiver<RuleExecutionEvent> {
    self.action_tx.subscribe()
  }

  pub async fn get_rules(&self) -> Vec<RuleDefinition> {
    self.rules.read().await.clone()
  }

  pub async fn set_rules(&self, new_rules: Vec<RuleDefinition>) {
    *self.rules.write().await = new_rules;
  }

  pub async fn add_or_update(&self, rule: RuleDefinition) {
    let mut list = self.rules.write().await;
    if let Some(pos) = list.iter().position(|r| r.id == rule.id) {
      list[pos] = rule;
    } else {
      list.push(rule);
    }
  }

  pub async fn remove(&self, id: &str) -> bool {
    let mut list = self.rules.write().await;
    let initial_len = list.len();
    list.retain(|r| r.id != id);
    list.len() < initial_len
  }

  /// Manually execute a rule action via "Test" button
  pub async fn test_rule(&self, rule_id: &str) -> Result<RuleAction, String> {
    let list = self.rules.read().await;
    let rule = list
      .iter()
      .find(|r| r.id == rule_id)
      .ok_or_else(|| format!("Rule '{}' not found", rule_id))?;

    let event = RuleExecutionEvent {
      rule_id: rule.id.clone(),
      rule_name: rule.name.clone(),
      action: rule.then.clone(),
      is_restore: false,
    };

    let _ = self.action_tx.send(event);
    Ok(rule.then.clone())
  }

  pub async fn evaluate_event(&self, event: &AgentEvent) {
    let list = self.rules.read().await;

    for rule in list.iter().filter(|r| r.enabled) {
      match &rule.when {
        RuleTrigger::AiSessionDone { agent, project } => {
          if event.kind == protocol::AgentEventKind::Done {
            let match_agent = agent.as_ref().map(|a| a == &event.agent).unwrap_or(true);
            let match_project = project.as_ref().map(|p| p == &event.project).unwrap_or(true);

            if match_agent && match_project {
              self.fire_rule(rule).await;
            }
          }
        }
        RuleTrigger::AiNeedsInput => {
          if event.kind == protocol::AgentEventKind::Approval {
            self.fire_rule(rule).await;
          }
        }
        _ => {}
      }
    }
  }

  pub async fn evaluate_telemetry(&self, cpu_percent: f32, current_hhmm: &str) {
    let list = self.rules.read().await;

    // Evaluate CPU threshold
    for rule in list.iter().filter(|r| r.enabled) {
      if let RuleTrigger::CpuAboveThreshold { percent, duration_secs } = &rule.when {
        if cpu_percent >= *percent {
          let mut start_guard = self.high_cpu_start.write().await;
          let start_time = *start_guard.get_or_insert_with(Instant::now);

          if start_time.elapsed() >= Duration::from_secs(*duration_secs) {
            let mut active = self.active_rules.write().await;
            if !active.get(&rule.id).copied().unwrap_or(false) {
              active.insert(rule.id.clone(), true);
              self.fire_rule(rule).await;
            }
          }
        } else {
          // CPU dropped below threshold
          let mut start_guard = self.high_cpu_start.write().await;
          *start_guard = None;

          let mut active = self.active_rules.write().await;
          if active.remove(&rule.id).unwrap_or(false) && rule.only_while_it_lasts {
            self.restore_rule(rule).await;
          }
        }
      }

      // Evaluate TimeWindow schedule (e.g. 22:00 to 07:00)
      if let RuleTrigger::TimeWindow { start, end } = &rule.when {
        let is_in_window = Self::is_time_in_range(current_hhmm, start, end);
        let mut active = self.active_rules.write().await;
        let was_active = active.get(&rule.id).copied().unwrap_or(false);

        if is_in_window && !was_active {
          active.insert(rule.id.clone(), true);
          self.fire_rule(rule).await;
        } else if !is_in_window && was_active {
          active.remove(&rule.id);
          if rule.only_while_it_lasts {
            self.restore_rule(rule).await;
          }
        }
      }
    }
  }

  pub async fn evaluate_webhook(&self, key: &str, value: &str) {
    let list = self.rules.read().await;

    for rule in list.iter().filter(|r| r.enabled) {
      if let RuleTrigger::WebhookValue { key: r_key, expected } = &rule.when {
        if r_key == key && expected == value {
          self.fire_rule(rule).await;
        }
      }
    }
  }

  async fn fire_rule(&self, rule: &RuleDefinition) {
    let event = RuleExecutionEvent {
      rule_id: rule.id.clone(),
      rule_name: rule.name.clone(),
      action: rule.then.clone(),
      is_restore: false,
    };
    let _ = self.action_tx.send(event);
  }

  async fn restore_rule(&self, rule: &RuleDefinition) {
    let restore_action = match &rule.then {
      RuleAction::GotoPage { .. } => {
        let saved = *self.saved_page.read().await;
        saved.map(|p| RuleAction::GotoPage { page: p })
      }
      RuleAction::SetTheme { .. } => {
        let saved = self.saved_theme.read().await.clone();
        saved.map(|t| RuleAction::SetTheme { theme_name: t })
      }
      _ => None,
    };

    if let Some(action) = restore_action {
      let event = RuleExecutionEvent {
        rule_id: rule.id.clone(),
        rule_name: format!("Restore: {}", rule.name),
        action,
        is_restore: true,
      };
      let _ = self.action_tx.send(event);
    }
  }

  fn is_time_in_range(current: &str, start: &str, end: &str) -> bool {
    if start <= end {
      current >= start && current <= end
    } else {
      // Overnight range (e.g. 22:00 to 07:00)
      current >= start || current <= end
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn test_rules_engine_crud_and_test() {
    let re = RulesEngine::new();
    let mut rx = re.subscribe();

    let rules = re.get_rules().await;
    assert_eq!(rules.len(), 3, "Starter rules should be present");

    // Test test_rule functionality
    let action = re.test_rule("ai-done-alert").await;
    assert!(action.is_ok());
    assert_eq!(action.unwrap(), RuleAction::GotoPage { page: 1 });

    let event = rx.try_recv().unwrap();
    assert_eq!(event.rule_id, "ai-done-alert");
    assert!(!event.is_restore);
  }

  #[tokio::test]
  async fn test_ai_event_trigger() {
    let re = RulesEngine::new();
    let mut rx = re.subscribe();

    let event = AgentEvent {
      id: "ev-1".to_string(),
      ts: 1000,
      agent: "claude-code".to_string(),
      project: "phone-deck".to_string(),
      cwd: ".".to_string(),
      kind: protocol::AgentEventKind::Done,
      title: "Finished".to_string(),
      summary: "Done".to_string(),
      stats: None,
      actions: vec![],
      expires_at: None,
    };

    re.evaluate_event(&event).await;

    let fired = rx.try_recv().unwrap();
    assert_eq!(fired.rule_id, "ai-done-alert");
    assert_eq!(fired.action, RuleAction::GotoPage { page: 1 });
  }

  #[test]
  fn test_time_in_range() {
    // Normal day range
    assert!(RulesEngine::is_time_in_range("14:30", "09:00", "17:00"));
    assert!(!RulesEngine::is_time_in_range("08:30", "09:00", "17:00"));

    // Overnight range (22:00 to 07:00)
    assert!(RulesEngine::is_time_in_range("23:15", "22:00", "07:00"));
    assert!(RulesEngine::is_time_in_range("04:30", "22:00", "07:00"));
    assert!(!RulesEngine::is_time_in_range("12:00", "22:00", "07:00"));
  }
}
