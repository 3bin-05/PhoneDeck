use protocol::fields::FieldId;
use protocol::{compute_delta, DeadbandConfig, TelemetryState};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, System};
use tokio::sync::{broadcast, Mutex, Notify};

pub struct AdaptiveSensorState {
    pub min_interval: Duration,
    pub max_interval: Duration,
    pub current_interval: Duration,
    pub quiet_ticks: u32,
    pub last_poll: Instant,
}

impl AdaptiveSensorState {
    pub fn new(min_ms: u64, max_ms: u64) -> Self {
        Self {
            min_interval: Duration::from_millis(min_ms),
            max_interval: Duration::from_millis(max_ms),
            current_interval: Duration::from_millis(min_ms),
            quiet_ticks: 0,
            last_poll: Instant::now() - Duration::from_secs(10),
        }
    }

    pub fn should_poll(&self, now: Instant) -> bool {
        now.duration_since(self.last_poll) >= self.current_interval
    }

    pub fn on_poll_result(&mut self, changed: bool, now: Instant) {
        self.last_poll = now;
        if changed {
            // Snap back to min on change
            self.current_interval = self.min_interval;
            self.quiet_ticks = 0;
        } else {
            self.quiet_ticks += 1;
            if self.quiet_ticks >= 2 {
                // Back off x1.5 up to max_interval
                let next_millis = (self.current_interval.as_millis() as f64 * 1.5) as u64;
                self.current_interval = Duration::from_millis(next_millis).min(self.max_interval);
            }
        }
    }
}

pub struct TelemetryHub {
    pub active_subscribers: Arc<Mutex<HashSet<u16>>>,
    pub client_count: Arc<AtomicU64>,
    pub park_notifier: Arc<Notify>,
    pub telemetry_tx: broadcast::Sender<Vec<u8>>,
    pub is_running: Arc<AtomicBool>,
    pub current_state: Arc<tokio::sync::RwLock<TelemetryState>>,
}

impl TelemetryHub {
    pub fn new() -> (Self, broadcast::Receiver<Vec<u8>>) {
        let (tx, rx) = broadcast::channel(100);
        let hub = Self {
            active_subscribers: Arc::new(Mutex::new(HashSet::new())),
            client_count: Arc::new(AtomicU64::new(0)),
            park_notifier: Arc::new(Notify::new()),
            telemetry_tx: tx,
            is_running: Arc::new(AtomicBool::new(true)),
            current_state: Arc::new(tokio::sync::RwLock::new(TelemetryState::new())),
        };
        (hub, rx)
    }

    pub async fn get_current_state(&self) -> TelemetryState {
        self.current_state.read().await.clone()
    }

    pub async fn set_current_state(&self, state: TelemetryState) {
        let mut guard = self.current_state.write().await;
        *guard = state;
    }

    pub async fn update_client_subscriptions(&self, subscribed_field_ids: Vec<u16>) {
        let mut guard = self.active_subscribers.lock().await;
        guard.clear();
        for id in subscribed_field_ids {
            guard.insert(id);
        }
        self.park_notifier.notify_waiters();
    }

    pub fn add_client(&self) {
        self.client_count.fetch_add(1, Ordering::SeqCst);
        self.park_notifier.notify_waiters();
    }

    pub fn remove_client(&self) {
        self.client_count.fetch_sub(1, Ordering::SeqCst);
        self.park_notifier.notify_waiters();
    }

    pub fn push_custom_metric(&self, field_id: u16, val: protocol::MetricValue) {
        let mut updates = std::collections::BTreeMap::new();
        updates.insert(field_id, val.clone());
        let delta = protocol::TelemetryDelta { updates };
        let envelope = protocol::Envelope::telemetry(0, delta);
        if let Ok(bytes) = protocol::to_msgpack(&envelope) {
            let _ = self.telemetry_tx.send(bytes);
        }
        let state_clone = self.current_state.clone();
        tauri::async_runtime::spawn(async move {
            let mut guard = state_clone.write().await;
            guard.metrics.insert(field_id, val);
        });
    }
}

/// Spawns the high-performance, budget-compliant sampler loop.
/// Parks completely (~0% CPU) when zero clients or subscribers exist.
pub fn spawn_sampler_thread(
    hub: Arc<TelemetryHub>,
) {
    tauri::async_runtime::spawn(async move {
        log::info!("[Sampler] Sampler thread initialized with adaptive backoff & parking");

        let mut sys = System::new();
        let mut disks = Disks::new_with_refreshed_list();
        let mut networks = Networks::new_with_refreshed_list();

        // Baseline refresh
        sys.refresh_cpu_all();
        sys.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
        disks.refresh(true);
        networks.refresh(true);

        // Pre-populate initial metrics into hub.current_state immediately
        {
            let mut init_state = TelemetryState::new();
            let cpu_total = sys.global_cpu_usage() as f64;
            init_state.set(FieldId::CpuTotal, (cpu_total * 10.0).round() as u64);
            if let Some(first_cpu) = sys.cpus().first() {
                init_state.set(FieldId::CpuFreqMhz, first_cpu.frequency() as u32);
            }
            init_state.set(FieldId::RamUsedBytes, sys.used_memory());
            init_state.set(FieldId::RamTotalBytes, sys.total_memory());
            let mut used_d = 0u64;
            let mut total_d = 0u64;
            for d in &disks {
                total_d += d.total_space();
                used_d += d.total_space().saturating_sub(d.available_space());
            }
            init_state.set(FieldId::DiskUsedBytes, used_d);
            init_state.set(FieldId::DiskTotalBytes, total_d);
            init_state.set(FieldId::UptimeSeconds, System::uptime());

            hub.set_current_state(init_state).await;
        }

        let deadbands = DeadbandConfig::default();
        let mut prev_state = TelemetryState::new();
        let mut seq = 1u64;

        // Adaptive polling timers: 500ms min, 1000ms max for real-time responsiveness
        let mut cpu_sensor = AdaptiveSensorState::new(500, 1000);
        let mut ram_sensor = AdaptiveSensorState::new(500, 1000);
        let mut net_sensor = AdaptiveSensorState::new(1000, 2000);
        let mut disk_sensor = AdaptiveSensorState::new(3000, 5000);
        let mut uptime_sensor = AdaptiveSensorState::new(1000, 1000);

        while hub.is_running.load(Ordering::SeqCst) {
            // 1. PARKING CHECK: If client_count == 0 or no active subscribers, park thread!
            let clients = hub.client_count.load(Ordering::SeqCst);
            let has_subscribers = {
                let guard = hub.active_subscribers.lock().await;
                !guard.is_empty()
            };

            if clients == 0 || !has_subscribers {
                log::debug!("[Sampler] Zero active subscribers. Sampler thread parked.");
                hub.park_notifier.notified().await;
                log::debug!("[Sampler] Sampler thread resumed.");
                continue;
            }

            let now = Instant::now();
            let mut curr_state = prev_state.clone();
            let mut any_polled = false;

            let subscribers = {
                let guard = hub.active_subscribers.lock().await;
                guard.clone()
            };

            // 2. CPU Poll (Narrow query: refresh_cpu_usage + refresh_cpu_frequency)
            let needs_cpu = subscribers.contains(&FieldId::CpuTotal.id())
                || subscribers.contains(&FieldId::CpuFreqMhz.id());

            if needs_cpu && cpu_sensor.should_poll(now) {
                sys.refresh_cpu_specifics(
                    CpuRefreshKind::nothing().with_cpu_usage().with_frequency(),
                );
                let cpu_total = sys.global_cpu_usage() as f64;
                let cpu_scaled = (cpu_total * 10.0).round() as u64;
                curr_state.set(FieldId::CpuTotal, cpu_scaled);

                if let Some(first_cpu) = sys.cpus().first() {
                    curr_state.set(FieldId::CpuFreqMhz, first_cpu.frequency() as u32);
                }

                any_polled = true;
            }

            // 3. RAM Poll (Narrow query: refresh_memory)
            let needs_ram = subscribers.contains(&FieldId::RamUsedBytes.id())
                || subscribers.contains(&FieldId::RamTotalBytes.id());

            if needs_ram && ram_sensor.should_poll(now) {
                sys.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());
                curr_state.set(FieldId::RamUsedBytes, sys.used_memory());
                curr_state.set(FieldId::RamTotalBytes, sys.total_memory());
                any_polled = true;
            }

            // 4. Network Poll (Narrow query: networks.refresh)
            let needs_net = subscribers.contains(&FieldId::NetInBytesSec.id())
                || subscribers.contains(&FieldId::NetOutBytesSec.id());

            if needs_net && net_sensor.should_poll(now) {
                networks.refresh(true);
                let mut total_in = 0u64;
                let mut total_out = 0u64;
                for (_name, net) in &networks {
                    total_in += net.received();
                    total_out += net.transmitted();
                }
                curr_state.set(FieldId::NetInBytesSec, total_in);
                curr_state.set(FieldId::NetOutBytesSec, total_out);
                any_polled = true;
            }

            // 5. Disk Poll (Narrow query: disks.refresh)
            let needs_disk = subscribers.contains(&FieldId::DiskUsedBytes.id())
                || subscribers.contains(&FieldId::DiskTotalBytes.id());

            if needs_disk && disk_sensor.should_poll(now) {
                disks.refresh(true);
                let mut used = 0u64;
                let mut total = 0u64;
                for disk in &disks {
                    total += disk.total_space();
                    used += disk.total_space().saturating_sub(disk.available_space());
                }
                curr_state.set(FieldId::DiskUsedBytes, used);
                curr_state.set(FieldId::DiskTotalBytes, total);
                any_polled = true;
            }

            // 6. Uptime Poll
            let needs_uptime = subscribers.contains(&FieldId::UptimeSeconds.id());
            if needs_uptime && uptime_sensor.should_poll(now) {
                curr_state.set(FieldId::UptimeSeconds, System::uptime());
                any_polled = true;
            }

            // 7. Compute deadband-filtered delta
            if any_polled {
                hub.set_current_state(curr_state.clone()).await;
                let delta = compute_delta(&prev_state, &curr_state, &deadbands);

                // Update adaptive sensor backoffs based on whether values exceeded deadbands
                let cpu_changed = delta.updates.contains_key(&FieldId::CpuTotal.id());
                cpu_sensor.on_poll_result(cpu_changed, now);

                let ram_changed = delta.updates.contains_key(&FieldId::RamUsedBytes.id());
                ram_sensor.on_poll_result(ram_changed, now);

                let net_changed = delta.updates.contains_key(&FieldId::NetInBytesSec.id());
                net_sensor.on_poll_result(net_changed, now);

                let disk_changed = delta.updates.contains_key(&FieldId::DiskUsedBytes.id());
                disk_sensor.on_poll_result(disk_changed, now);

                uptime_sensor.on_poll_result(true, now);

                // If delta has updates, emit 50ms coalesced MessagePack envelope
                if !delta.is_empty() {
                    let env = protocol::Envelope::telemetry(seq, delta);
                    seq += 1;
                    if let Ok(bytes) = protocol::to_msgpack(&env) {
                        let _ = hub.telemetry_tx.send(bytes);
                    }
                    prev_state = curr_state;
                }
            }

            // Sleep 50ms coalescing window before next evaluation
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });
}
