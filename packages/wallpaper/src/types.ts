export type WallpaperType =
  | 'shader'
  | 'video'
  | 'static-ken-burns'
  | 'particles'
  | 'lottie'
  | 'parallax'
  | 'time-of-day';

export type QualityTier = 'high' | 'balanced' | 'eco' | 'static';

export interface TierConfig {
  fps: number;
  scale: number;
  budgetMs: number;
}

export const TIER_CONFIGS: Record<QualityTier, TierConfig> = {
  high: { fps: 30, scale: 1.0, budgetMs: 8 },
  balanced: { fps: 24, scale: 0.75, budgetMs: 12 },
  eco: { fps: 12, scale: 0.5, budgetMs: 16 },
  static: { fps: 0, scale: 0.5, budgetMs: 0 },
};

export interface ReactiveBindings {
  cpu?: string; // e.g. 'speed' -> controls particle speed, flow rate, horizon scroll
  gpu?: string; // e.g. 'intensity' -> controls luminance, ribbon width, star brightness
  net?: string; // e.g. 'pulse' -> controls ripple waves, burst shocks
  temp?: string; // e.g. 'hue' -> shifts color spectrum
}

export interface WallpaperManifest {
  id: string;
  name: string;
  type: WallpaperType;
  version: string;
  targetFps: number; // Max 30 per Section 10
  dim: number; // 0.0 to 1.0
  blur: number; // In px
  safeArea?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  reactiveBindings?: ReactiveBindings;
  assets?: {
    image?: string;
    video?: string;
    fragmentShader?: string;
    lottieJson?: any;
    colors?: string[];
    options?: Record<string, any>;
  };
}

export interface GovernorInputs {
  batteryLevel: number; // 0 - 100
  isCharging: boolean;
  thermalStatus: number; // 0: None, 1: Light, 2: Moderate, 3: Severe, 4: Critical
  isDimmed: boolean; // Night mode ambient
  pageWeight: number; // Number of widgets on page
  pageVisibility: boolean; // document.visibilityState === 'visible'
}

export interface GovernorState {
  tier: QualityTier;
  effectiveFps: number;
  scale: number;
  measuredFps: number;
  measuredFrameTimeMs: number;
  reason: string;
  driftX: number; // In px for OLED burn-in mitigation
  driftY: number; // In px
}

export interface TelemetryUniforms {
  cpu: number; // Normalized 0.0 - 1.0
  gpu: number; // Normalized 0.0 - 1.0
  net: number; // Normalized 0.0 - 1.0
  temp: number; // Normalized 0.0 - 1.0 (e.g. 30C - 90C mapped)
}
