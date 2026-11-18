use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Statistics collected on task completion (e.g. from git shortstat).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GitStats {
    pub duration_s: u64,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

/// Agent event types per plan.md section 6.2.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum AgentEventKind {
    Done,
    NeedsInput,
    Approval,
    Error,
    Working,
    Idle,
    AgentUpdating,
    UpdateAvailable,
    UpdateRequired,
}

/// AgentEvent payload sent over the reliable, ordered events channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentEvent {
    pub id: String,
    pub ts: u64,
    pub agent: String,
    pub project: String,
    pub cwd: String,
    pub kind: AgentEventKind,
    pub title: String,
    pub summary: String,
    pub stats: Option<GitStats>,
    pub actions: Vec<String>,
    pub expires_at: Option<u64>,
}

/// Acknowledgment message sent from client to server to ack events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ClientAck {
    pub last_seq: u64,
}

/// Reconnect/resume request containing client's last seen sequence number and config content hash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ResumeRequest {
    pub last_seq: u64,
    pub config_hash: String,
}

/// Initial time sync message sent upon connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TimeSync {
    pub server_ts: u64,
}
