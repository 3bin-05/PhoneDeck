use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum AmbientStateKind {
  Bright,
  Dark,
  Peek,
  LockedDark,
  LockedBright,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DarkAlertMode {
  Off,
  Dot,
  Wake,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AmbientConfig {
  pub enabled: bool,
  pub dark_enter_lux: f32, // Default: 3.0 lux
  pub dark_exit_lux: f32,  // Default: 12.0 lux (enforced >= 3x dark_enter_lux)
  pub dark_enter_delay_secs: u64, // Default: 10s
  pub dark_exit_delay_secs: u64,  // Default: 3s
  pub peek_duration_secs: u64,    // Default: 10s
  pub min_brightness: f32,        // Default: 0.02 (2%)
  pub show_seconds: bool,         // Default: false
  pub is_24h: bool,               // Default: true
  pub alert_mode: DarkAlertMode,  // Default: Dot
  pub schedule_fallback: bool,    // Default: true
  pub schedule_start: String,     // Default: "23:00"
  pub schedule_end: String,       // Default: "07:00"
}

impl Default for AmbientConfig {
  fn default() -> Self {
    Self {
      enabled: true,
      dark_enter_lux: 3.0,
      dark_exit_lux: 12.0,
      dark_enter_delay_secs: 10,
      dark_exit_delay_secs: 3,
      peek_duration_secs: 10,
      min_brightness: 0.02,
      show_seconds: false,
      is_24h: true,
      alert_mode: DarkAlertMode::Dot,
      schedule_fallback: true,
      schedule_start: "23:00".to_string(),
      schedule_end: "07:00".to_string(),
    }
  }
}

pub struct LuxFilter {
  samples: Vec<f32>,
  filtered_lux: Option<f32>,
  alpha: f32, // EMA smoothing coefficient
}

impl LuxFilter {
  pub fn new(alpha: f32) -> Self {
    Self {
      samples: Vec::with_capacity(5),
      filtered_lux: None,
      alpha: alpha.clamp(0.01, 1.0),
    }
  }

  pub fn push_sample(&mut self, sample: f32) -> f32 {
    let clean_sample = sample.max(0.0);
    if self.samples.len() >= 5 {
      self.samples.remove(0);
    }
    self.samples.push(clean_sample);

    // 1. Median of up to 5 samples
    let median = self.calculate_median();

    // 2. Light EMA smoothing
    let next_filtered = match self.filtered_lux {
      Some(prev) => self.alpha * median + (1.0 - self.alpha) * prev,
      None => median,
    };

    self.filtered_lux = Some(next_filtered);
    next_filtered
  }

  pub fn get_filtered(&self) -> f32 {
    self.filtered_lux.unwrap_or(50.0)
  }

  fn calculate_median(&self) -> f32 {
    if self.samples.is_empty() {
      return 50.0;
    }
    let mut sorted = self.samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = sorted.len() / 2;
    sorted[mid]
  }

  pub fn reset(&mut self) {
    self.samples.clear();
    self.filtered_lux = None;
  }
}

pub struct AmbientStateMachine {
  config: AmbientConfig,
  filter: LuxFilter,
  state: AmbientStateKind,
  state_entered_time: Instant,
  condition_start_time: Option<Instant>,
  peek_expires_time: Option<Instant>,
  last_raw_lux: f32,
  consecutive_zero_lux_start: Option<Instant>,
}

impl AmbientStateMachine {
  pub fn new(config: AmbientConfig) -> Self {
    let mut clean_config = config;
    // Always keep dark_exit at least 3x dark_enter to prevent screen light flip-flopping
    if clean_config.dark_exit_lux < clean_config.dark_enter_lux * 3.0 {
      clean_config.dark_exit_lux = clean_config.dark_enter_lux * 3.0;
    }

    Self {
      config: clean_config,
      filter: LuxFilter::new(0.6),
      state: AmbientStateKind::Bright,
      state_entered_time: Instant::now(),
      condition_start_time: None,
      peek_expires_time: None,
      last_raw_lux: 100.0,
      consecutive_zero_lux_start: None,
    }
  }

  pub fn process_lux(&mut self, raw_lux: f32, now: Instant) -> AmbientStateKind {
    self.last_raw_lux = raw_lux;
    let filtered = self.filter.push_sample(raw_lux);

    // Track if sensor reads 0 continuously (covered or face down hint)
    if raw_lux <= 0.05 {
      if self.consecutive_zero_lux_start.is_none() {
        self.consecutive_zero_lux_start = Some(now);
      }
    } else {
      self.consecutive_zero_lux_start = None;
    }

    if !self.config.enabled {
      self.state = AmbientStateKind::Bright;
      return self.state;
    }

    match self.state {
      AmbientStateKind::LockedDark | AmbientStateKind::LockedBright => {
        // Manual lock overrides automatic transitions
        self.state
      }
      AmbientStateKind::Peek => {
        // In Peek mode, check if 10s timer has expired
        if let Some(exp) = self.peek_expires_time {
          if now >= exp {
            self.set_state(AmbientStateKind::Dark, now);
          }
        }
        self.state
      }
      AmbientStateKind::Bright => {
        // Enter DARK when filtered lux < dark_enter continuously for dark_enter_delay
        if filtered < self.config.dark_enter_lux {
          let start = self.condition_start_time.get_or_insert(now);
          if now.duration_since(*start) >= Duration::from_secs(self.config.dark_enter_delay_secs) {
            self.set_state(AmbientStateKind::Dark, now);
          }
        } else {
          self.condition_start_time = None;
        }
        self.state
      }
      AmbientStateKind::Dark => {
        // Exit DARK when filtered lux > dark_exit continuously for dark_exit_delay
        if filtered > self.config.dark_exit_lux {
          let start = self.condition_start_time.get_or_insert(now);
          if now.duration_since(*start) >= Duration::from_secs(self.config.dark_exit_delay_secs) {
            self.set_state(AmbientStateKind::Bright, now);
          }
        } else {
          self.condition_start_time = None;
        }
        self.state
      }
    }
  }

  /// Single tap: in DARK, peek normal UI at minimum brightness for 10s
  pub fn handle_single_tap(&mut self, now: Instant) -> AmbientStateKind {
    match self.state {
      AmbientStateKind::Dark => {
        let exp = now + Duration::from_secs(self.config.peek_duration_secs);
        self.peek_expires_time = Some(exp);
        self.set_state(AmbientStateKind::Peek, now);
      }
      AmbientStateKind::Peek => {
        // Return to dark immediately
        self.peek_expires_time = None;
        self.set_state(AmbientStateKind::Dark, now);
      }
      _ => {}
    }
    self.state
  }

  /// Double tap: toggle manual lock (force dark / force bright)
  pub fn handle_double_tap(&mut self, now: Instant) -> AmbientStateKind {
    match self.state {
      AmbientStateKind::Dark | AmbientStateKind::LockedDark => {
        self.set_state(AmbientStateKind::LockedBright, now);
      }
      AmbientStateKind::Bright | AmbientStateKind::LockedBright | AmbientStateKind::Peek => {
        self.set_state(AmbientStateKind::LockedDark, now);
      }
    }
    self.state
  }

  /// Unlock manual lock, returning to automatic evaluation
  pub fn unlock(&mut self, now: Instant) -> AmbientStateKind {
    let filtered = self.filter.get_filtered();
    let target = if filtered < self.config.dark_enter_lux {
      AmbientStateKind::Dark
    } else {
      AmbientStateKind::Bright
    };
    self.set_state(target, now);
    self.state
  }

  /// Fallback schedule evaluation when light sensor is absent
  pub fn evaluate_schedule(&mut self, current_hhmm: &str, now: Instant) -> AmbientStateKind {
    if !self.config.enabled || !self.config.schedule_fallback {
      return self.state;
    }

    if matches!(self.state, AmbientStateKind::LockedDark | AmbientStateKind::LockedBright) {
      return self.state;
    }

    let is_night = if self.config.schedule_start <= self.config.schedule_end {
      current_hhmm >= &self.config.schedule_start && current_hhmm <= &self.config.schedule_end
    } else {
      current_hhmm >= &self.config.schedule_start || current_hhmm <= &self.config.schedule_end
    };

    let target = if is_night {
      AmbientStateKind::Dark
    } else {
      AmbientStateKind::Bright
    };

    if self.state != target && self.state != AmbientStateKind::Peek {
      self.set_state(target, now);
    }
    self.state
  }

  pub fn update_config(&mut self, mut new_config: AmbientConfig) {
    if new_config.dark_exit_lux < new_config.dark_enter_lux * 3.0 {
      new_config.dark_exit_lux = new_config.dark_enter_lux * 3.0;
    }
    self.config = new_config;
  }

  pub fn get_config(&self) -> &AmbientConfig {
    &self.config
  }

  pub fn get_state(&self) -> AmbientStateKind {
    self.state
  }

  pub fn get_raw_lux(&self) -> f32 {
    self.last_raw_lux
  }

  pub fn get_filtered_lux(&self) -> f32 {
    self.filter.get_filtered()
  }

  pub fn get_time_in_state_secs(&self, now: Instant) -> u64 {
    now.duration_since(self.state_entered_time).as_secs()
  }

  pub fn is_sensor_covered_hint(&self, now: Instant) -> bool {
    if let Some(start) = self.consecutive_zero_lux_start {
      now.duration_since(start) >= Duration::from_secs(3600) // 1 hour at 0 lux
    } else {
      false
    }
  }

  fn set_state(&mut self, new_state: AmbientStateKind, now: Instant) {
    if self.state != new_state {
      self.state = new_state;
      self.state_entered_time = now;
      self.condition_start_time = None;
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_median_filter_rejects_single_spike() {
    let mut filter = LuxFilter::new(0.35);

    // Initial baseline: 50 lux
    for _ in 0..5 {
      filter.push_sample(50.0);
    }
    assert!((filter.get_filtered() - 50.0).abs() < 1.0);

    // Single-sample spike to 0.0 (passing shadow or hand wave)
    let after_spike = filter.push_sample(0.0);
    // Median of [50, 50, 50, 50, 0] is still 50.0!
    assert!((after_spike - 50.0).abs() < 1.0, "Spike must not alter median of 5");

    // Single-sample spike to 1000.0 (sudden flashlight flash)
    filter.push_sample(50.0);
    let after_high_spike = filter.push_sample(1000.0);
    assert!((after_high_spike - 50.0).abs() < 1.0, "High spike must not alter median of 5");
  }

  #[test]
  fn test_slow_dimming_and_hysteresis_transition() {
    let config = AmbientConfig {
      dark_enter_lux: 3.0,
      dark_exit_lux: 12.0,
      dark_enter_delay_secs: 10,
      dark_exit_delay_secs: 3,
      ..Default::default()
    };
    let mut sm = AmbientStateMachine::new(config);
    let mut now = Instant::now();

    // 1. Bright room (100 lux)
    assert_eq!(sm.process_lux(100.0, now), AmbientStateKind::Bright);

    // 2. Room lights turned off (0.5 lux)
    // First 5 seconds of 0.5 lux samples (delay = 10s, so remains Bright)
    for _ in 0..5 {
      now += Duration::from_secs(1);
      sm.process_lux(0.5, now);
    }
    assert_eq!(sm.get_state(), AmbientStateKind::Bright);

    // Advance 5 more seconds (total 10s of low lux samples; delay threshold just being reached)
    for _ in 0..5 {
      now += Duration::from_secs(1);
      sm.process_lux(0.5, now);
    }

    // Advance 7 more seconds (condition started at t=6s, so at t>=16s >= 10s delay) -> enters DARK
    for _ in 0..7 {
      now += Duration::from_secs(1);
      sm.process_lux(0.5, now);
    }
    assert_eq!(sm.get_state(), AmbientStateKind::Dark, "Must enter DARK after 10s delay of low lux");

    // 3. Screen light feedback test:
    // When phone displays clock, ambient sensor reads slight reflection (e.g. 4.0 lux).
    // Because dark_exit is 12.0 lux (> 3x 3.0 lux), 4.0 lux must NOT trigger exit!
    for _ in 0..5 {
      now += Duration::from_secs(1);
      sm.process_lux(4.0, now);
    }
    assert_eq!(sm.get_state(), AmbientStateKind::Dark, "Screen reflection (4 lux) must not exit dark mode");

    // 4. Lights turned back on (150 lux)
    // 2 seconds (< 3s delay)
    for _ in 0..2 {
      now += Duration::from_secs(1);
      sm.process_lux(150.0, now);
    }
    assert_eq!(sm.get_state(), AmbientStateKind::Dark, "Exit delay of 3s not yet met");

    // 4 more seconds (>= 3s delay)
    for _ in 0..4 {
      now += Duration::from_secs(1);
      sm.process_lux(150.0, now);
    }
    assert_eq!(sm.get_state(), AmbientStateKind::Bright, "Exits to BRIGHT after 3s of high lux");
  }

  #[test]
  fn test_flicker_around_threshold_does_not_loop() {
    let config = AmbientConfig {
      dark_enter_lux: 3.0,
      dark_exit_lux: 12.0,
      dark_enter_delay_secs: 10,
      dark_exit_delay_secs: 3,
      ..Default::default()
    };
    let mut sm = AmbientStateMachine::new(config);
    let mut now = Instant::now();

    // Start bright
    for _ in 0..5 {
      sm.process_lux(20.0, now);
    }

    // Flicker between 2 lux and 8 lux every 2 seconds
    for _ in 0..10 {
      now += Duration::from_secs(2);
      sm.process_lux(2.0, now);
      now += Duration::from_secs(2);
      sm.process_lux(8.0, now);
    }

    // Because it never stays below 3.0 lux for 10 continuous seconds, it remains Bright!
    assert_eq!(sm.get_state(), AmbientStateKind::Bright, "Flicker must not trigger dark transition");
  }

  #[test]
  fn test_single_tap_peek_and_timeout() {
    let mut sm = AmbientStateMachine::new(AmbientConfig::default());
    let mut now = Instant::now();

    // Enter dark
    for _ in 0..5 {
      sm.process_lux(0.1, now);
    }
    now += Duration::from_secs(12);
    sm.process_lux(0.1, now);
    assert_eq!(sm.get_state(), AmbientStateKind::Dark);

    // Single tap -> Peek
    let peek_state = sm.handle_single_tap(now);
    assert_eq!(peek_state, AmbientStateKind::Peek);

    // Advance 5 seconds (still in peek)
    now += Duration::from_secs(5);
    sm.process_lux(0.1, now);
    assert_eq!(sm.get_state(), AmbientStateKind::Peek);

    // Advance past 10s peek timeout -> returns to Dark
    now += Duration::from_secs(6);
    sm.process_lux(0.1, now);
    assert_eq!(sm.get_state(), AmbientStateKind::Dark, "Peek must expire after 10s and return to Dark");
  }

  #[test]
  fn test_double_tap_manual_lock() {
    let mut sm = AmbientStateMachine::new(AmbientConfig::default());
    let mut now = Instant::now();

    // Enter dark
    for _ in 0..5 {
      sm.process_lux(0.1, now);
    }
    now += Duration::from_secs(12);
    sm.process_lux(0.1, now);
    assert_eq!(sm.get_state(), AmbientStateKind::Dark);

    // Double tap -> LockedBright
    let locked = sm.handle_double_tap(now);
    assert_eq!(locked, AmbientStateKind::LockedBright);

    // Even with 0 lux for 30s, remains LockedBright
    now += Duration::from_secs(30);
    sm.process_lux(0.1, now);
    assert_eq!(sm.get_state(), AmbientStateKind::LockedBright);

    // Unlock
    let unlocked = sm.unlock(now);
    assert_eq!(unlocked, AmbientStateKind::Dark);
  }

  #[test]
  fn test_schedule_fallback() {
    let config = AmbientConfig {
      schedule_start: "23:00".to_string(),
      schedule_end: "07:00".to_string(),
      ..Default::default()
    };
    let mut sm = AmbientStateMachine::new(config);
    let now = Instant::now();

    // 14:00 (daytime) -> Bright
    assert_eq!(sm.evaluate_schedule("14:00", now), AmbientStateKind::Bright);

    // 23:30 (nighttime) -> Dark
    assert_eq!(sm.evaluate_schedule("23:30", now), AmbientStateKind::Dark);

    // 04:15 (early morning night) -> Dark
    assert_eq!(sm.evaluate_schedule("04:15", now), AmbientStateKind::Dark);

    // 08:00 (morning day) -> Bright
    assert_eq!(sm.evaluate_schedule("08:00", now), AmbientStateKind::Bright);
  }
}
