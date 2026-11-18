//! Phone Deck Protocol Core
//!
//! Provides the MessagePack envelope, integer field-ID dictionary,
//! delta encoder with dead-band filtering, and shared event contracts.

pub mod delta;
pub mod envelope;
pub mod events;
pub mod fields;

pub use delta::{
    apply_delta, compute_delta, compute_raw_delta, DeadbandConfig, TelemetryDelta, TelemetryState,
};
pub use envelope::{Channel, Envelope};
pub use events::{AgentEvent, AgentEventKind, ClientAck, GitStats, ResumeRequest, TimeSync};
pub use fields::{FieldId, MetricValue};

/// Protocol version number for handshake and version negotiation.
pub const PROTOCOL_VERSION: u32 = 1;

/// Helper to serialize any payload into MessagePack bytes.
pub fn to_msgpack<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, rmp_serde::encode::Error> {
    rmp_serde::to_vec(value)
}

/// Helper to deserialize any payload from MessagePack bytes.
pub fn from_msgpack<'a, T: serde::Deserialize<'a>>(
    bytes: &'a [u8],
) -> Result<T, rmp_serde::decode::Error> {
    rmp_serde::from_slice(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn test_protocol_version() {
        assert_eq!(PROTOCOL_VERSION, 1);
    }

    #[test]
    fn test_envelope_roundtrip_telemetry() {
        let mut delta = TelemetryDelta::default();
        delta.updates.insert(FieldId::CpuTotal.id(), MetricValue::U64(450));
        delta.updates.insert(FieldId::CpuTempC.id(), MetricValue::I64(480));

        let env = Envelope::telemetry(101, delta);
        let bytes = to_msgpack(&env).expect("serialization failed");
        let decoded: Envelope<TelemetryDelta> =
            from_msgpack(&bytes).expect("deserialization failed");

        assert_eq!(decoded.channel, Channel::Telemetry);
        assert_eq!(decoded.seq, 101);
        assert_eq!(decoded.payload.updates.len(), 2);
        assert_eq!(
            decoded
                .payload
                .updates
                .get(&FieldId::CpuTotal.id())
                .unwrap(),
            &MetricValue::U64(450)
        );
    }

    #[test]
    fn test_envelope_roundtrip_event() {
        let event = AgentEvent {
            id: "evt-001".to_string(),
            ts: 1731900000,
            agent: "claude-code".to_string(),
            project: "phone-deck".to_string(),
            cwd: "/home/user/phone-deck".to_string(),
            kind: AgentEventKind::Done,
            title: "Task complete".to_string(),
            summary: "Finished scaffolding".to_string(),
            stats: Some(GitStats {
                duration_s: 180,
                files_changed: 5,
                insertions: 120,
                deletions: 15,
            }),
            actions: vec!["open_editor".to_string(), "open_folder".to_string()],
            expires_at: None,
        };

        let env = Envelope::event(42, event);
        let bytes = to_msgpack(&env).expect("serialization failed");
        let decoded: Envelope<AgentEvent> = from_msgpack(&bytes).expect("deserialization failed");

        assert_eq!(decoded.channel, Channel::Events);
        assert_eq!(decoded.seq, 42);
        assert_eq!(decoded.payload.agent, "claude-code");
        assert_eq!(decoded.payload.stats.unwrap().files_changed, 5);
    }

    #[test]
    fn test_deadband_suppression() {
        let mut prev = TelemetryState::new();
        prev.set(FieldId::CpuTotal, 400u64); // 40.0%
        prev.set(FieldId::CpuTempC, 500i64); // 50.0°C
        prev.set(FieldId::RamUsedBytes, 10_000_000_000u64);

        let mut curr = TelemetryState::new();
        curr.set(FieldId::CpuTotal, 405u64); // 40.5% (delta = 5 < threshold 10 -> suppressed)
        curr.set(FieldId::CpuTempC, 520i64); // 52.0°C (delta = 20 >= threshold 10 -> sent)
        curr.set(FieldId::RamUsedBytes, 10_000_000_100u64); // delta = 100 bytes < 32MB -> suppressed

        let deadbands = DeadbandConfig::default();
        let delta = compute_delta(&prev, &curr, &deadbands);

        assert_eq!(delta.len(), 1);
        assert!(delta.updates.contains_key(&FieldId::CpuTempC.id()));
        assert!(!delta.updates.contains_key(&FieldId::CpuTotal.id()));
        assert!(!delta.updates.contains_key(&FieldId::RamUsedBytes.id()));
    }

    #[test]
    fn test_golden_bytes_stability() {
        // Deterministic golden test to verify binary wire stability across releases
        let mut delta = TelemetryDelta::default();
        delta.updates.insert(1, MetricValue::U64(100)); // CpuTotal = 10.0%

        let env = Envelope::telemetry(1, delta);
        let bytes = to_msgpack(&env).expect("serialize golden");

        // Format: fixarray(3) [fixint(1), fixint(1), fixmap(1) { fixint(1): fixint(100) }]
        let expected_golden = vec![0x93, 0x01, 0x01, 0x81, 0x01, 0x64];
        assert_eq!(
            bytes, expected_golden,
            "Binary protocol encoding deviated from golden standard!"
        );
    }

    // Property-based testing strategy for MetricValue
    fn arb_metric_value() -> impl Strategy<Value = MetricValue> {
        prop_oneof![
            any::<u64>().prop_map(MetricValue::U64),
            any::<i64>().prop_map(MetricValue::I64),
            any::<bool>().prop_map(MetricValue::Bool),
            "[a-zA-Z0-9_-]{0,16}".prop_map(MetricValue::String),
        ]
    }

    // Property-based testing strategy for TelemetryState
    fn arb_telemetry_state() -> impl Strategy<Value = TelemetryState> {
        prop::collection::btree_map(1u16..30u16, arb_metric_value(), 0..15)
            .prop_map(|metrics| TelemetryState { metrics })
    }

    proptest! {
        #[test]
        fn prop_apply_delta_roundtrip(a in arb_telemetry_state(), b in arb_telemetry_state()) {
            // For any two states A and B, applying the raw delta from A to B onto A yields B
            let delta = compute_raw_delta(&a, &b);
            let mut reconstructed = a.clone();
            apply_delta(&mut reconstructed, &delta);
            prop_assert_eq!(reconstructed, b);
        }
    }
}
