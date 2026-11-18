// Generated from crates/protocol/bindings
export type Channel = "Telemetry" | "Events" | "Ack" | "TimeSync";

export type FieldId =
  | "CpuTotal"
  | "CpuFreqMhz"
  | "CpuTempC"
  | "RamUsedBytes"
  | "RamTotalBytes"
  | "GpuUsage"
  | "GpuVramUsedBytes"
  | "GpuVramTotalBytes"
  | "GpuTempC"
  | "NetInBytesSec"
  | "NetOutBytesSec"
  | "DiskUsedBytes"
  | "DiskTotalBytes"
  | "UptimeSeconds"
  | "PcBatteryPct"
  | "PcBatteryCharging"
  | "MediaPlaying"
  | "MediaTitle"
  | "MediaArtist"
  | "MediaPositionSec"
  | "MediaDurationSec";

export const FIELD_IDS = {
  CpuTotal: 1,
  CpuFreqMhz: 2,
  CpuTempC: 3,
  RamUsedBytes: 4,
  RamTotalBytes: 5,
  GpuUsage: 6,
  GpuVramUsedBytes: 7,
  GpuVramTotalBytes: 8,
  GpuTempC: 9,
  NetInBytesSec: 10,
  NetOutBytesSec: 11,
  DiskUsedBytes: 12,
  DiskTotalBytes: 13,
  UptimeSeconds: 14,
  PcBatteryPct: 15,
  PcBatteryCharging: 16,
  MediaPlaying: 17,
  MediaTitle: 18,
  MediaArtist: 19,
  MediaPositionSec: 20,
  MediaDurationSec: 21,
} as const;

export type MetricValue = null | number | boolean | string;

export interface TelemetryDelta {
  updates: Record<number, MetricValue>;
}

export type AgentEventKind = "done" | "needs_input" | "approval" | "error" | "working" | "idle";

export interface GitStats {
  duration_s: number;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface AgentEvent {
  id: string;
  ts: number;
  agent: string;
  project: string;
  cwd: string;
  kind: AgentEventKind;
  title: string;
  summary: string;
  stats?: GitStats;
  actions: string[];
  expires_at?: number;
}

export type ProtocolEnvelope<T> = [channel: number, seq: number, payload: T];
