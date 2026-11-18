use serde::de::{SeqAccess, Visitor};
use serde::ser::SerializeTuple;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use ts_rs::TS;

/// Channel types for the unified WebSocket connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, TS)]
#[ts(export)]
#[repr(u8)]
pub enum Channel {
    /// Lossy, latest-wins, delta-encoded telemetry.
    Telemetry = 1,
    /// Reliable, ordered, acked events (alerts, approvals, notifications).
    Events = 2,
    /// Client acknowledgment of sequence numbers.
    Ack = 3,
    /// Initial time synchronization on connect.
    TimeSync = 4,
}

impl Serialize for Channel {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for Channel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let byte = u8::deserialize(deserializer)?;
        match byte {
            1 => Ok(Channel::Telemetry),
            2 => Ok(Channel::Events),
            3 => Ok(Channel::Ack),
            4 => Ok(Channel::TimeSync),
            other => Err(serde::de::Error::custom(format!(
                "unknown channel id: {other}"
            ))),
        }
    }
}

/// Message envelope formatted as a 3-element tuple: [type, seq, payload].
#[derive(Debug, Clone, PartialEq)]
pub struct Envelope<T> {
    pub channel: Channel,
    pub seq: u64,
    pub payload: T,
}

impl<T> Envelope<T> {
    pub fn new(channel: Channel, seq: u64, payload: T) -> Self {
        Self {
            channel,
            seq,
            payload,
        }
    }

    pub fn telemetry(seq: u64, payload: T) -> Self {
        Self::new(Channel::Telemetry, seq, payload)
    }

    pub fn event(seq: u64, payload: T) -> Self {
        Self::new(Channel::Events, seq, payload)
    }

    pub fn ack(seq: u64, payload: T) -> Self {
        Self::new(Channel::Ack, seq, payload)
    }

    pub fn time_sync(seq: u64, payload: T) -> Self {
        Self::new(Channel::TimeSync, seq, payload)
    }
}

impl<T: Serialize> Serialize for Envelope<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut tuple = serializer.serialize_tuple(3)?;
        tuple.serialize_element(&self.channel)?;
        tuple.serialize_element(&self.seq)?;
        tuple.serialize_element(&self.payload)?;
        tuple.end()
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Envelope<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct EnvelopeVisitor<T>(std::marker::PhantomData<T>);

        impl<'de, T: Deserialize<'de>> Visitor<'de> for EnvelopeVisitor<T> {
            type Value = Envelope<T>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a 3-element tuple [channel, seq, payload]")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let channel = seq
                    .next_element()?
                    .ok_or_else(|| serde::de::Error::invalid_length(0, &self))?;
                let seq_num = seq
                    .next_element()?
                    .ok_or_else(|| serde::de::Error::invalid_length(1, &self))?;
                let payload = seq
                    .next_element()?
                    .ok_or_else(|| serde::de::Error::invalid_length(2, &self))?;
                Ok(Envelope {
                    channel,
                    seq: seq_num,
                    payload,
                })
            }
        }

        deserializer.deserialize_tuple(3, EnvelopeVisitor(std::marker::PhantomData))
    }
}
