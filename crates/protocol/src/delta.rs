use crate::fields::{FieldId, MetricValue};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;
use ts_rs::TS;

/// Full state of all currently subscribed telemetry metrics.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TelemetryState {
    pub metrics: BTreeMap<u16, MetricValue>,
}

impl TelemetryState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, field: FieldId, value: impl Into<MetricValue>) {
        self.metrics.insert(field.id(), value.into());
    }

    pub fn get(&self, field: FieldId) -> Option<&MetricValue> {
        self.metrics.get(&field.id())
    }

    pub fn remove(&mut self, field: FieldId) -> Option<MetricValue> {
        self.metrics.remove(&field.id())
    }
}

/// A compact delta frame containing only fields that changed beyond their deadbands.
/// Serializes directly as an integer-keyed map { field_id: value } in MessagePack.
#[derive(Debug, Clone, PartialEq, Default, TS)]
#[ts(export)]
pub struct TelemetryDelta {
    pub updates: BTreeMap<u16, MetricValue>,
}

impl TelemetryDelta {
    pub fn is_empty(&self) -> bool {
        self.updates.is_empty()
    }

    pub fn len(&self) -> usize {
        self.updates.len()
    }
}

impl Serialize for TelemetryDelta {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.updates.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for TelemetryDelta {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let updates = BTreeMap::<u16, MetricValue>::deserialize(deserializer)?;
        Ok(TelemetryDelta { updates })
    }
}

/// Deadband thresholds per metric field ID to suppress network jitter.
#[derive(Debug, Clone, PartialEq)]
pub struct DeadbandConfig {
    pub thresholds: BTreeMap<u16, u64>,
}

impl Default for DeadbandConfig {
    fn default() -> Self {
        let mut thresholds = BTreeMap::new();
        // CPU usage: |Δ| ≥ 1.0% (10 in 0.1% fixed-point per plan.md section 10)
        thresholds.insert(FieldId::CpuTotal.id(), 10);
        // CPU temp: |Δ| ≥ 1.0°C (10 in 0.1°C fixed-point per plan.md section 10)
        thresholds.insert(FieldId::CpuTempC.id(), 10);
        // GPU usage: |Δ| ≥ 1.0%
        thresholds.insert(FieldId::GpuUsage.id(), 10);
        // GPU temp: |Δ| ≥ 1.0°C
        thresholds.insert(FieldId::GpuTempC.id(), 10);
        // RAM: |Δ| ≥ 8 MB for responsive real-time sync
        thresholds.insert(FieldId::RamUsedBytes.id(), 8_388_608);
        // Network throughput: |Δ| ≥ 2 KB/s
        thresholds.insert(FieldId::NetInBytesSec.id(), 2_048);
        thresholds.insert(FieldId::NetOutBytesSec.id(), 2_048);

        Self { thresholds }
    }
}

impl DeadbandConfig {
    pub fn none() -> Self {
        Self {
            thresholds: BTreeMap::new(),
        }
    }

    pub fn threshold_for(&self, field_id: u16) -> u64 {
        self.thresholds.get(&field_id).copied().unwrap_or(0)
    }
}

/// Computes a delta from `previous` to `current`, applying per-metric deadbands.
pub fn compute_delta(
    previous: &TelemetryState,
    current: &TelemetryState,
    deadbands: &DeadbandConfig,
) -> TelemetryDelta {
    let mut updates = BTreeMap::new();

    // Check newly added or updated fields in current
    for (&field_id, new_val) in &current.metrics {
        match previous.metrics.get(&field_id) {
            None => {
                // New field: always include
                updates.insert(field_id, new_val.clone());
            }
            Some(old_val) if old_val != new_val => {
                let threshold = deadbands.threshold_for(field_id);
                if threshold == 0 {
                    updates.insert(field_id, new_val.clone());
                } else {
                    let should_send = match (old_val, new_val) {
                        (MetricValue::U64(o), MetricValue::U64(n)) => o.abs_diff(*n) >= threshold,
                        (MetricValue::I64(o), MetricValue::I64(n)) => {
                            (o - n).unsigned_abs() >= threshold
                        }
                        _ => true,
                    };
                    if should_send {
                        updates.insert(field_id, new_val.clone());
                    }
                }
            }
            _ => {}
        }
    }

    // Check removed fields (tombstone with Null)
    for &field_id in previous.metrics.keys() {
        if !current.metrics.contains_key(&field_id) {
            updates.insert(field_id, MetricValue::Null);
        }
    }

    TelemetryDelta { updates }
}

/// Computes raw delta without deadbands (for exact state sync / property testing).
pub fn compute_raw_delta(previous: &TelemetryState, current: &TelemetryState) -> TelemetryDelta {
    compute_delta(previous, current, &DeadbandConfig::none())
}

/// Applies delta updates into target state in-place.
pub fn apply_delta(target: &mut TelemetryState, delta: &TelemetryDelta) {
    for (&field_id, val) in &delta.updates {
        if val.is_null() {
            target.metrics.remove(&field_id);
        } else {
            target.metrics.insert(field_id, val.clone());
        }
    }
}
