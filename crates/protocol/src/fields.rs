use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Integer field-ID dictionary per plan.md section 4 & 10.
/// Eliminates string keys on the wire for featherweight bandwidth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
#[repr(u16)]
pub enum FieldId {
    // CPU metrics (1..3)
    /// Fixed-point percentage: 1000 = 100.0%, 425 = 42.5%
    CpuTotal = 1,
    /// CPU core frequency in MHz
    CpuFreqMhz = 2,
    /// Fixed-point temperature: 450 = 45.0°C
    CpuTempC = 3,

    // Memory metrics (4..5)
    RamUsedBytes = 4,
    RamTotalBytes = 5,

    // GPU metrics (6..9)
    /// Fixed-point percentage: 1000 = 100.0%
    GpuUsage = 6,
    GpuVramUsedBytes = 7,
    GpuVramTotalBytes = 8,
    /// Fixed-point temperature: 0.1°C
    GpuTempC = 9,

    // Network throughput (10..11)
    NetInBytesSec = 10,
    NetOutBytesSec = 11,

    // Storage metrics (12..13)
    DiskUsedBytes = 12,
    DiskTotalBytes = 13,

    // System status (14..16)
    UptimeSeconds = 14,
    PcBatteryPct = 15,
    PcBatteryCharging = 16,

    // Media playback (17..21)
    MediaPlaying = 17,
    MediaTitle = 18,
    MediaArtist = 19,
    MediaPositionSec = 20,
    MediaDurationSec = 21,
}

impl FieldId {
    pub const fn id(self) -> u16 {
        self as u16
    }
}

/// Generic compact value representation supporting null, numbers, booleans, and strings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(untagged)]
pub enum MetricValue {
    Null,
    U64(u64),
    I64(i64),
    Bool(bool),
    String(String),
}

impl MetricValue {
    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Self::U64(v) => Some(*v),
            Self::I64(v) if *v >= 0 => Some(*v as u64),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::I64(v) => Some(*v),
            Self::U64(v) => Some(*v as i64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Bool(v) => Some(*v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::String(v) => Some(v.as_str()),
            _ => None,
        }
    }
}

impl From<u64> for MetricValue {
    fn from(v: u64) -> Self {
        Self::U64(v)
    }
}

impl From<u32> for MetricValue {
    fn from(v: u32) -> Self {
        Self::U64(v as u64)
    }
}

impl From<u16> for MetricValue {
    fn from(v: u16) -> Self {
        Self::U64(v as u64)
    }
}

impl From<u8> for MetricValue {
    fn from(v: u8) -> Self {
        Self::U64(v as u64)
    }
}

impl From<i64> for MetricValue {
    fn from(v: i64) -> Self {
        Self::I64(v)
    }
}

impl From<i32> for MetricValue {
    fn from(v: i32) -> Self {
        Self::I64(v as i64)
    }
}

impl From<i16> for MetricValue {
    fn from(v: i16) -> Self {
        Self::I64(v as i64)
    }
}

impl From<bool> for MetricValue {
    fn from(v: bool) -> Self {
        Self::Bool(v)
    }
}

impl From<String> for MetricValue {
    fn from(v: String) -> Self {
        Self::String(v)
    }
}

impl From<&str> for MetricValue {
    fn from(v: &str) -> Self {
        Self::String(v.to_string())
    }
}
