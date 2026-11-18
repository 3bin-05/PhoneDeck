import {
  QualityTier,
  GovernorInputs,
  GovernorState,
  TIER_CONFIGS,
} from './types';

export class WallpaperGovernor {
  private currentTier: QualityTier = 'balanced';
  private frameTimes: number[] = [];
  private readonly maxSamples = 60;
  private consecutiveOverBudget = 0;
  private consecutiveUnderBudget = 0;
  private lastTierChangeTime = performance.now() - 10000; // Allow immediate first transition
  private readonly minTierChangeIntervalMs = 5000; // 5s hysteresis minimum between tier changes
  private lastFrameTimestamp = performance.now();
  private measuredFps = 30;
  private measuredFrameTimeMs = 4.0;
  private reason = 'Initial tier';

  // Burn-in composition drift tracking
  private driftStartTime = Date.now();
  private readonly driftCyclePeriodMsX = 4 * 60 * 60 * 1000; // 4 hours cycle
  private readonly driftCyclePeriodMsY = 6.5 * 60 * 60 * 1000; // 6.5 hours cycle
  private readonly maxDriftPx = 6.0;

  constructor(initialTier: QualityTier = 'balanced') {
    this.currentTier = initialTier;
  }

  public recordFrame(frameDurationMs: number): void {
    const now = performance.now();
    const delta = now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;

    if (delta > 0 && delta < 500) {
      const instantaneousFps = 1000 / delta;
      // Exponential moving average for FPS
      this.measuredFps = this.measuredFps * 0.9 + instantaneousFps * 0.1;
    }

    this.frameTimes.push(frameDurationMs);
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift();
    }

    // Moving average of frame execution duration
    const sum = this.frameTimes.reduce((acc, v) => acc + v, 0);
    this.measuredFrameTimeMs = sum / this.frameTimes.length;

    // Track frame budget conformance
    const currentConfig = TIER_CONFIGS[this.currentTier];
    if (this.measuredFrameTimeMs > currentConfig.budgetMs) {
      this.consecutiveOverBudget++;
      this.consecutiveUnderBudget = 0;
    } else if (this.measuredFrameTimeMs < currentConfig.budgetMs * 0.6) {
      this.consecutiveUnderBudget++;
      this.consecutiveOverBudget = 0;
    } else {
      this.consecutiveOverBudget = Math.max(0, this.consecutiveOverBudget - 1);
      this.consecutiveUnderBudget = Math.max(0, this.consecutiveUnderBudget - 1);
    }
  }

  public update(inputs: GovernorInputs): GovernorState {
    const now = performance.now();

    // 1. Page Visibility: if hidden, render loop should be stopped / static
    if (!inputs.pageVisibility) {
      this.currentTier = 'static';
      this.reason = 'Tab hidden (Page Visibility stopped)';
      return this.getState();
    }

    // 2. Dimmed / Ambient Mode: pure static black / dormant
    if (inputs.isDimmed) {
      this.currentTier = 'static';
      this.reason = 'Night mode / Dimmed ambient (< 0.2 KB/s telemetry budget)';
      return this.getState();
    }

    // 3. Android Thermal Status (0: None, 1: Light, 2: Moderate, 3: Severe, 4: Critical)
    if (inputs.thermalStatus >= 3) {
      this.currentTier = 'static';
      this.reason = 'Critical thermal throttling protection';
      return this.getState();
    }

    // 4. Low battery protection (< 20% on battery)
    const isBatteryConstrained = !inputs.isCharging && inputs.batteryLevel < 20;
    const maxAllowedTier: QualityTier = inputs.thermalStatus === 2
      ? 'eco'
      : isBatteryConstrained
        ? 'eco'
        : inputs.pageWeight > 8
          ? 'balanced'
          : 'high';

    // Tier transitions only after cooldown period
    if (now - this.lastTierChangeTime > this.minTierChangeIntervalMs) {
      // Demote tier if struggling for >= 25 frames
      if (this.consecutiveOverBudget >= 25) {
        if (this.currentTier === 'high') {
          this.setTier('balanced', now, 'Frame time budget exceeded (> 8ms)');
        } else if (this.currentTier === 'balanced') {
          this.setTier('eco', now, 'Frame time budget exceeded (> 12ms)');
        } else if (this.currentTier === 'eco') {
          this.setTier('static', now, 'Frame time budget exceeded (> 16ms)');
        }
      }
      // Promote tier if stable for >= 180 consecutive frames (~6s)
      else if (this.consecutiveUnderBudget >= 180) {
        if (this.currentTier === 'static') {
          this.setTier('eco', now, 'Performance recovered and stable');
        } else if (this.currentTier === 'eco' && (maxAllowedTier === 'balanced' || maxAllowedTier === 'high')) {
          this.setTier('balanced', now, 'Performance recovered and stable (< 7ms)');
        } else if (this.currentTier === 'balanced' && maxAllowedTier === 'high') {
          this.setTier('high', now, 'Performance optimal (< 5ms)');
        }
      }
    }

    // Force clamp to max allowed tier by external constraints
    if (this.tierRank(this.currentTier) > this.tierRank(maxAllowedTier)) {
      this.setTier(
        maxAllowedTier,
        now,
        inputs.thermalStatus === 2
          ? 'Thermal status moderate'
          : isBatteryConstrained
            ? 'Battery below 20%'
            : 'Page widget density'
      );
    }

    return this.getState();
  }

  private setTier(newTier: QualityTier, timestamp: number, reason: string): void {
    if (this.currentTier !== newTier) {
      this.currentTier = newTier;
      this.lastTierChangeTime = timestamp;
      this.consecutiveOverBudget = 0;
      this.consecutiveUnderBudget = 0;
      this.reason = reason;
    }
  }

  private tierRank(tier: QualityTier): number {
    switch (tier) {
      case 'static': return 0;
      case 'eco': return 1;
      case 'balanced': return 2;
      case 'high': return 3;
    }
  }

  public getState(): GovernorState {
    const config = TIER_CONFIGS[this.currentTier];

    // Compute slow OLED drift offset (subpixel to ±6px)
    const elapsed = Date.now() - this.driftStartTime;
    const angleX = (elapsed / this.driftCyclePeriodMsX) * Math.PI * 2;
    const angleY = (elapsed / this.driftCyclePeriodMsY) * Math.PI * 2;
    const driftX = Math.sin(angleX) * this.maxDriftPx;
    const driftY = Math.cos(angleY) * this.maxDriftPx;

    return {
      tier: this.currentTier,
      effectiveFps: config.fps,
      scale: config.scale,
      measuredFps: Math.round(this.measuredFps * 10) / 10,
      measuredFrameTimeMs: Math.round(this.measuredFrameTimeMs * 100) / 100,
      reason: this.reason,
      driftX: Math.round(driftX * 10) / 10,
      driftY: Math.round(driftY * 10) / 10,
    };
  }

  public reset(): void {
    this.frameTimes = [];
    this.consecutiveOverBudget = 0;
    this.consecutiveUnderBudget = 0;
    this.lastTierChangeTime = performance.now() - 10000;
  }

  public fastForwardCooldown(): void {
    this.lastTierChangeTime = performance.now() - this.minTierChangeIntervalMs - 100;
  }
}
