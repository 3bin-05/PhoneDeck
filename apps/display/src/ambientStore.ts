import { create } from 'zustand';
import { setScreenBrightness, isLightSensorAvailable, startLightSensor, onAmbientLux } from '@phone-deck/android-plugin';

export type AmbientStateKind = 'bright' | 'dark' | 'peek' | 'locked_dark' | 'locked_bright';
export type DarkAlertMode = 'off' | 'dot' | 'wake';

export interface AmbientConfig {
  enabled: boolean;
  darkEnterLux: number; // default: 3.0
  darkExitLux: number;  // default: 12.0 (>= 3x darkEnterLux)
  darkEnterDelaySecs: number; // default: 10
  darkExitDelaySecs: number;  // default: 3
  peekDurationSecs: number;    // default: 10
  minBrightness: number;        // default: 0.02
  showSeconds: boolean;         // default: false
  is24h: boolean;               // default: true
  alertMode: DarkAlertMode;     // default: 'dot'
  scheduleFallback: boolean;    // default: true
  scheduleStart: string;        // default: '23:00'
  scheduleEnd: string;          // default: '07:00'
}

export const DEFAULT_AMBIENT_CONFIG: AmbientConfig = {
  enabled: true,
  darkEnterLux: 3.0,
  darkExitLux: 12.0,
  darkEnterDelaySecs: 10,
  darkExitDelaySecs: 3,
  peekDurationSecs: 10,
  minBrightness: 0.02,
  showSeconds: false,
  is24h: false, // 12-hour AM/PM flip clock matching reference image
  alertMode: 'dot',
  scheduleFallback: true,
  scheduleStart: '23:00',
  scheduleEnd: '07:00',
};

export function applyScreenBrightness(value: number) {
  if (typeof window !== 'undefined' && (window as any).PhoneDeckNative?.setBrightness) {
    try {
      (window as any).PhoneDeckNative.setBrightness(value);
      return;
    } catch {}
  }
  setScreenBrightness(value).catch(() => {});
}

// Pure Lux Filter: median of last 5 samples + EMA smoothing
class LuxFilter {
  private samples: number[] = [];
  private filtered: number | null = null;
  private readonly alpha: number;

  constructor(alpha = 0.6) {
    this.alpha = alpha;
  }

  push(sample: number): number {
    const clean = Math.max(0, sample);
    if (this.samples.length >= 5) {
      this.samples.shift();
    }
    this.samples.push(clean);

    // Median of 5 samples rejects single-sample spikes completely
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (this.filtered === null) {
      this.filtered = median;
    } else {
      this.filtered = this.alpha * median + (1 - this.alpha) * this.filtered;
    }
    return this.filtered;
  }

  getFiltered(): number {
    return this.filtered ?? 50.0;
  }

  reset() {
    this.samples = [];
    this.filtered = null;
  }
}

export interface AmbientStoreState {
  config: AmbientConfig;
  state: AmbientStateKind;
  rawLux: number;
  filteredLux: number;
  stateEnteredTime: number;
  timeInStateSecs: number;
  isSensorCovered: boolean;
  isLightSensorAvailable: boolean;
  wakeAlertUntil: number | null;
  hasActiveEventDot: boolean;

  // Actions
  pushLux: (rawLux: number) => void;
  handleSingleTap: () => void;
  handleDoubleTap: () => void;
  unlock: () => void;
  evaluateSchedule: () => void;
  updateConfig: (patch: Partial<AmbientConfig>) => void;
  setLightSensorAvailable: (avail: boolean) => void;
  triggerEventAlert: (kind: string) => void;
  clearEventDot: () => void;
  initHardwareSensor: () => () => void;
}

const filterInstance = new LuxFilter(0.6);
let conditionStartTime: number | null = null;
let peekExpiresTime: number | null = null;
let zeroLuxStartTime: number | null = null;
let socketSender: ((msg: string) => void) | null = null;

export function registerAmbientSocketSender(sender: (msg: string) => void) {
  socketSender = sender;
}

function broadcastDisplayState(state: AmbientStateKind) {
  if (socketSender) {
    const isDark = state === 'dark' || state === 'locked_dark';
    try {
      socketSender(JSON.stringify({
        type: 'display_state',
        state: isDark ? 'dark' : 'bright',
        ambient_state: state,
        timestamp: Date.now(),
      }));
    } catch {
      // Ignore websocket broadcast errors
    }
  }
}

export const useAmbientStore = create<AmbientStoreState>((set, get) => ({
  config: DEFAULT_AMBIENT_CONFIG,
  state: 'bright',
  rawLux: 100.0,
  filteredLux: 100.0,
  stateEnteredTime: Date.now(),
  timeInStateSecs: 0,
  isSensorCovered: false,
  isLightSensorAvailable: true,
  wakeAlertUntil: null,
  hasActiveEventDot: false,

  pushLux: (rawLux: number) => {
    const now = Date.now();
    const { config, state } = get();

    // Check sensor covered hint (reading 0 lux continuously for > 1 hour)
    if (rawLux <= 0.05) {
      if (zeroLuxStartTime === null) zeroLuxStartTime = now;
    } else {
      zeroLuxStartTime = null;
    }
    const isSensorCovered = zeroLuxStartTime !== null && (now - zeroLuxStartTime >= 3600_000);

    const filtered = filterInstance.push(rawLux);
    const timeInStateSecs = Math.floor((now - get().stateEnteredTime) / 1000);

    if (!config.enabled) {
      if (state !== 'bright') {
        set({ state: 'bright', rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered, stateEnteredTime: now });
        applyScreenBrightness(-1.0);
        broadcastDisplayState('bright');
      } else {
        set({ rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered });
      }
      return;
    }

    // Manual lock overrides automatic transitions
    if (state === 'locked_dark' || state === 'locked_bright') {
      set({ rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered });
      return;
    }

    // Peek mode: check if 10s timer expired
    if (state === 'peek') {
      if (peekExpiresTime && now >= peekExpiresTime) {
        peekExpiresTime = null;
        applyScreenBrightness(config.minBrightness);
        broadcastDisplayState('dark');
        set({
          state: 'dark',
          rawLux,
          filteredLux: filtered,
          stateEnteredTime: now,
          timeInStateSecs: 0,
          isSensorCovered,
        });
      } else {
        set({ rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered });
      }
      return;
    }

    // Bright -> Dark transition with hysteresis
    if (state === 'bright') {
      if (filtered < config.darkEnterLux) {
        if (conditionStartTime === null) conditionStartTime = now;
        if (now - conditionStartTime >= config.darkEnterDelaySecs * 1000) {
          conditionStartTime = null;
          applyScreenBrightness(config.minBrightness);
          broadcastDisplayState('dark');
          set({
            state: 'dark',
            rawLux,
            filteredLux: filtered,
            stateEnteredTime: now,
            timeInStateSecs: 0,
            isSensorCovered,
          });
          return;
        }
      } else {
        conditionStartTime = null;
      }
      set({ rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered });
      return;
    }

    // Dark -> Bright transition with hysteresis
    if (state === 'dark') {
      if (filtered > config.darkExitLux) {
        if (conditionStartTime === null) conditionStartTime = now;
        if (now - conditionStartTime >= config.darkExitDelaySecs * 1000) {
          conditionStartTime = null;
          applyScreenBrightness(-1.0);
          broadcastDisplayState('bright');
          set({
            state: 'bright',
            rawLux,
            filteredLux: filtered,
            stateEnteredTime: now,
            timeInStateSecs: 0,
            isSensorCovered,
          });
          return;
        }
      } else {
        conditionStartTime = null;
      }
      set({ rawLux, filteredLux: filtered, timeInStateSecs, isSensorCovered });
      return;
    }
  },

  handleSingleTap: () => {
    const { state, config } = get();
    const now = Date.now();

    if (state === 'dark') {
      // Enter Peek mode: normal UI at minimum brightness for 10 s
      peekExpiresTime = now + config.peekDurationSecs * 1000;
      applyScreenBrightness(config.minBrightness);
      set({ state: 'peek', stateEnteredTime: now, timeInStateSecs: 0 });
    } else if (state === 'peek') {
      // Return to dark immediately
      peekExpiresTime = null;
      applyScreenBrightness(config.minBrightness);
      set({ state: 'dark', stateEnteredTime: now, timeInStateSecs: 0 });
    }
  },

  handleDoubleTap: () => {
    const { state, config } = get();
    const now = Date.now();

    if (state === 'dark' || state === 'locked_dark') {
      // Force bright
      applyScreenBrightness(-1.0);
      broadcastDisplayState('locked_bright');
      set({ state: 'locked_bright', stateEnteredTime: now, timeInStateSecs: 0 });
    } else {
      // Force dark
      applyScreenBrightness(config.minBrightness);
      broadcastDisplayState('locked_dark');
      set({ state: 'locked_dark', stateEnteredTime: now, timeInStateSecs: 0 });
    }
  },

  unlock: () => {
    const { config } = get();
    const now = Date.now();
    const filtered = filterInstance.getFiltered();
    const target: AmbientStateKind = filtered < config.darkEnterLux ? 'dark' : 'bright';

    if (target === 'dark') {
      applyScreenBrightness(config.minBrightness);
    } else {
      applyScreenBrightness(-1.0);
    }
    broadcastDisplayState(target);
    set({ state: target, stateEnteredTime: now, timeInStateSecs: 0 });
  },

  evaluateSchedule: () => {
    const { config, state } = get();
    if (!config.enabled || !config.scheduleFallback) return;
    if (state === 'locked_dark' || state === 'locked_bright' || state === 'peek') return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentHhmm = `${hh}:${mm}`;

    const isNight =
      config.scheduleStart <= config.scheduleEnd
        ? currentHhmm >= config.scheduleStart && currentHhmm <= config.scheduleEnd
        : currentHhmm >= config.scheduleStart || currentHhmm <= config.scheduleEnd;

    const target: AmbientStateKind = isNight ? 'dark' : 'bright';
    if (state !== target) {
      if (target === 'dark') {
        applyScreenBrightness(config.minBrightness);
      } else {
        applyScreenBrightness(-1.0);
      }
      broadcastDisplayState(target);
      set({ state: target, stateEnteredTime: Date.now(), timeInStateSecs: 0 });
    }
  },

  updateConfig: (patch: Partial<AmbientConfig>) => {
    const current = get().config;
    const merged = { ...current, ...patch };
    // Always enforce darkExitLux >= 3x darkEnterLux
    if (merged.darkExitLux < merged.darkEnterLux * 3.0) {
      merged.darkExitLux = merged.darkEnterLux * 3.0;
    }
    set({ config: merged });
  },

  setLightSensorAvailable: (avail: boolean) => {
    set({ isLightSensorAvailable: avail });
  },

  triggerEventAlert: (_kind: string) => {
    const { config, state } = get();
    const now = Date.now();

    if (state === 'dark' || state === 'locked_dark') {
      if (config.alertMode === 'dot') {
        set({ hasActiveEventDot: true });
      } else if (config.alertMode === 'wake') {
        // Wake notification at minimum brightness for 20 s
        set({ wakeAlertUntil: now + 20_000, hasActiveEventDot: true });
        applyScreenBrightness(config.minBrightness);
        setTimeout(() => {
          const currentUntil = get().wakeAlertUntil;
          if (currentUntil && Date.now() >= currentUntil) {
            set({ wakeAlertUntil: null });
            if (get().state === 'dark' || get().state === 'locked_dark') {
              applyScreenBrightness(config.minBrightness);
            }
          }
        }, 20_000);
      }
    }
  },

  clearEventDot: () => set({ hasActiveEventDot: false }),

  initHardwareSensor: () => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    // Connect to native Android SensorManager bridge (Samsung Galaxy J8)
    if (typeof window !== 'undefined') {
      (window as any).__onNativeLux = (lux: number) => {
        if (!cancelled && typeof lux === 'number') {
          get().pushLux(lux);
        }
      };

      if ((window as any).PhoneDeckNative?.isLightSensorAvailable) {
        try {
          const avail = (window as any).PhoneDeckNative.isLightSensorAvailable();
          get().setLightSensorAvailable(avail);
        } catch {}
      }
    }

    isLightSensorAvailable()
      .then((avail: boolean) => {
        if (cancelled) return;
        get().setLightSensorAvailable(avail);
        if (avail) {
          startLightSensor().catch(() => {});
          onAmbientLux((lux: number) => {
            get().pushLux(lux);
          }).then((cleanup: () => void) => {
            if (cancelled) cleanup();
            else unlisten = cleanup;
          });
        }
      })
      .catch(() => {
        if (!cancelled && !(window as any).PhoneDeckNative) {
          get().setLightSensorAvailable(false);
        }
      });

    // Also check standard Web API AmbientLightSensor if present in WebView
    if (typeof window !== 'undefined' && 'AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor({ frequency: 1 });
        sensor.addEventListener('reading', () => {
          if (!cancelled && typeof sensor.illuminance === 'number') {
            get().pushLux(sensor.illuminance);
          }
        });
        sensor.start();
      } catch {}
    }

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      if (typeof window !== 'undefined') {
        delete (window as any).__onNativeLux;
      }
    };
  },
}));
