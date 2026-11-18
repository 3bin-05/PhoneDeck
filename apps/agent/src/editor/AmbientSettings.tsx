import { useState, useEffect } from 'react';
import {
  Moon,
  Sun,
  Check,
  Sparkles,
} from 'lucide-react';

export interface AmbientConfigData {
  enabled: boolean;
  darkEnterLux: number;
  darkExitLux: number;
  darkEnterDelaySecs: number;
  darkExitDelaySecs: number;
  peekDurationSecs: number;
  minBrightness: number;
  showSeconds: boolean;
  is24h: boolean;
  alertMode: 'off' | 'dot' | 'wake';
  scheduleFallback: boolean;
  scheduleStart: string;
  scheduleEnd: string;
}

const DEFAULT_CONFIG: AmbientConfigData = {
  enabled: true,
  darkEnterLux: 3.0,
  darkExitLux: 12.0,
  darkEnterDelaySecs: 10,
  darkExitDelaySecs: 3,
  peekDurationSecs: 10,
  minBrightness: 0.02,
  showSeconds: false,
  is24h: true,
  alertMode: 'dot',
  scheduleFallback: true,
  scheduleStart: '23:00',
  scheduleEnd: '07:00',
};

export function AmbientSettings() {
  const [config, setConfig] = useState<AmbientConfigData>(() => {
    try {
      const saved = localStorage.getItem('phonedeck_ambient_config');
      return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const [savedToast, setSavedToast] = useState(false);
  const [simulatedLux, setSimulatedLux] = useState<number>(45.0);
  const [calibratedDark, setCalibratedDark] = useState<number | null>(null);
  const [calibratedBright, setCalibratedBright] = useState<number | null>(null);

  // Load from local storage or Agent backend
  useEffect(() => {
    localStorage.setItem('phonedeck_ambient_config', JSON.stringify(config));
  }, [config]);

  const handleUpdate = <K extends keyof AmbientConfigData>(
    key: K,
    val: AmbientConfigData[K]
  ) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      // Enforce 3x gap constraint
      if (key === 'darkEnterLux') {
        const numVal = val as number;
        if (next.darkExitLux < numVal * 3.0) {
          next.darkExitLux = Math.round(numVal * 3.0 * 10) / 10;
        }
      } else if (key === 'darkExitLux') {
        const numVal = val as number;
        if (numVal < next.darkEnterLux * 3.0) {
          next.darkExitLux = Math.round(next.darkEnterLux * 3.0 * 10) / 10;
        }
      }
      return next;
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const runCalibrationCompute = (dark: number, bright: number) => {
    const computedEnter = Math.max(1.0, Math.round(dark * 1.5 * 10) / 10);
    const computedExit = Math.max(computedEnter * 3.0, Math.round(bright * 0.4 * 10) / 10);

    setConfig((prev) => ({
      ...prev,
      darkEnterLux: computedEnter,
      darkExitLux: computedExit,
    }));
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-base font-semibold text-[#EDEDF2] flex items-center gap-2">
            <Moon className="w-4 h-4 text-[#7C5CFF]" />
            <span>Night Clock &amp; Ambient Light Mode</span>
          </h2>
          <p className="text-xs text-[#71717A] mt-1">
            When the room goes dark, the phone fades to a pure black OLED screen showing only white time and date.
          </p>
        </div>

        {savedToast && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00E599]/10 text-[#00E599] text-xs font-mono border border-[#00E599]/20">
            <Check className="w-3.5 h-3.5" />
            <span>Config Synced</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Calibration Wizard & Live Sensor Readout */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-[#EDEDF2] font-semibold">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Sensor Calibration</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                SENSOR: ACTIVE
              </span>
            </div>

            {/* Live readout card */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase text-[#71717A]">Current Ambient Lux</div>
                <div className="text-3xl font-mono font-light text-white tabular-nums mt-0.5">
                  {simulatedLux.toFixed(1)} <span className="text-xs text-zinc-500 font-sans">lux</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] font-mono text-[#71717A]">CURRENT STATE</div>
                <div
                  className={`text-xs font-mono font-semibold uppercase mt-0.5 ${
                    simulatedLux < config.darkEnterLux ? 'text-amber-400' : 'text-[#00E599]'
                  }`}
                >
                  {simulatedLux < config.darkEnterLux ? '🌙 Dark Mode' : '☀️ Bright Mode'}
                </div>
              </div>
            </div>

            {/* Test Simulation Slider */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-[#71717A] mb-1">
                <span>Simulate Phone Sensor Reading</span>
                <span className="text-zinc-300">{simulatedLux.toFixed(1)} lx</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={simulatedLux}
                onChange={(e) => setSimulatedLux(parseFloat(e.target.value))}
                className="w-full accent-[#7C5CFF] h-1.5 bg-white/[0.08] rounded cursor-pointer"
              />
            </div>

            {/* Wizard Steps */}
            <div className="pt-3 border-t border-white/[0.06] space-y-3">
              <div className="text-xs font-semibold text-[#EDEDF2] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#7C5CFF]" />
                <span>Two-Point Calibration Wizard</span>
              </div>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                The screen&apos;s own light bounces into the front sensor. Calibrating in both dark and bright room states computes optimal hysteresis thresholds to prevent flip-flopping.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setCalibratedDark(simulatedLux);
                  }}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    calibratedDark !== null
                      ? 'bg-zinc-900/60 border-[#00E599]/40 text-[#00E599]'
                      : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.16] text-zinc-300'
                  }`}
                >
                  <div className="text-[10px] uppercase font-mono text-zinc-500">Step 1: Dark Room</div>
                  <div className="text-xs font-semibold mt-0.5">
                    {calibratedDark !== null ? `${calibratedDark.toFixed(1)} lx Captured` : 'Lights off, capture'}
                  </div>
                </button>

                <button
                  onClick={() => {
                    setCalibratedBright(simulatedLux);
                    if (calibratedDark !== null) {
                      runCalibrationCompute(calibratedDark, simulatedLux);
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                    calibratedBright !== null
                      ? 'bg-zinc-900/60 border-[#00E599]/40 text-[#00E599]'
                      : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.16] text-zinc-300'
                  }`}
                >
                  <div className="text-[10px] uppercase font-mono text-zinc-500">Step 2: Bright Room</div>
                  <div className="text-xs font-semibold mt-0.5">
                    {calibratedBright !== null ? `${calibratedBright.toFixed(1)} lx Captured` : 'Lights on, capture'}
                  </div>
                </button>
              </div>

              {calibratedDark !== null && calibratedBright !== null && (
                <div className="p-3 rounded-xl bg-[#00E599]/10 border border-[#00E599]/20 text-xs text-[#00E599] font-mono flex items-center justify-between">
                  <span>Computed: Enter {config.darkEnterLux} lx / Exit {config.darkExitLux} lx (gap ≥ 3×)</span>
                  <Check className="w-4 h-4 shrink-0" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Parameters & Preferences */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <span className="text-xs font-mono font-semibold text-[#EDEDF2]">Enable Night Clock Mode</span>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => handleUpdate('enabled', e.target.checked)}
                className="w-4 h-4 accent-[#7C5CFF] rounded cursor-pointer"
              />
            </div>

            {/* Thresholds */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-[#71717A]">Dark Enter Threshold</span>
                  <span className="text-[#EDEDF2] font-semibold">{config.darkEnterLux} lux</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={config.darkEnterLux}
                  onChange={(e) => handleUpdate('darkEnterLux', parseFloat(e.target.value))}
                  className="w-full accent-[#7C5CFF] h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-[#71717A]">Dark Exit Threshold (≥ 3× enter)</span>
                  <span className="text-[#EDEDF2] font-semibold">{config.darkExitLux} lux</span>
                </div>
                <input
                  type="range"
                  min={config.darkEnterLux * 3.0}
                  max="50"
                  step="1"
                  value={config.darkExitLux}
                  onChange={(e) => handleUpdate('darkExitLux', parseFloat(e.target.value))}
                  className="w-full accent-[#7C5CFF] h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-mono text-[#71717A] block mb-1">Enter Delay (sec)</span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={config.darkEnterDelaySecs}
                    onChange={(e) => handleUpdate('darkEnterDelaySecs', parseInt(e.target.value) || 10)}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#71717A] block mb-1">Exit Delay (sec)</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={config.darkExitDelaySecs}
                    onChange={(e) => handleUpdate('darkExitDelaySecs', parseInt(e.target.value) || 3)}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-[#71717A]">Minimum Screen Brightness</span>
                  <span className="text-[#EDEDF2] font-semibold">{Math.round(config.minBrightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.20"
                  step="0.01"
                  value={config.minBrightness}
                  onChange={(e) => handleUpdate('minBrightness', parseFloat(e.target.value))}
                  className="w-full accent-[#7C5CFF] h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Display & Alert Options */}
            <div className="pt-3 border-t border-white/[0.06] space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[#71717A]">24-Hour Time Format</span>
                <input
                  type="checkbox"
                  checked={config.is24h}
                  onChange={(e) => handleUpdate('is24h', e.target.checked)}
                  className="w-4 h-4 accent-[#7C5CFF] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#71717A]">Display Seconds (Minute aligned when off)</span>
                <input
                  type="checkbox"
                  checked={config.showSeconds}
                  onChange={(e) => handleUpdate('showSeconds', e.target.checked)}
                  className="w-4 h-4 accent-[#7C5CFF] rounded cursor-pointer"
                />
              </div>

              <div>
                <span className="text-[#71717A] block mb-1.5">Agent Hub Events in Dark Mode</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['off', 'dot', 'wake'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleUpdate('alertMode', mode)}
                      className={`py-1.5 rounded-lg text-xs font-mono capitalize transition-all cursor-pointer ${
                        config.alertMode === mode
                          ? 'bg-[#7C5CFF] text-white font-semibold'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode === 'dot' ? 'Discreet Dot' : mode === 'wake' ? 'Wake (20s)' : 'Off (Black)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Fallback */}
              <div className="pt-2 border-t border-white/[0.04]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#71717A]">Schedule Fallback (No Sensor)</span>
                  <input
                    type="checkbox"
                    checked={config.scheduleFallback}
                    onChange={(e) => handleUpdate('scheduleFallback', e.target.checked)}
                    className="w-4 h-4 accent-[#7C5CFF] rounded cursor-pointer"
                  />
                </div>

                {config.scheduleFallback && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-zinc-500 block mb-0.5">Start Time</span>
                      <input
                        type="time"
                        value={config.scheduleStart}
                        onChange={(e) => handleUpdate('scheduleStart', e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block mb-0.5">End Time</span>
                      <input
                        type="time"
                        value={config.scheduleEnd}
                        onChange={(e) => handleUpdate('scheduleEnd', e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
