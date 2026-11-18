export type WallpaperTier = 'high' | 'balanced' | 'eco' | 'static';

export interface WallpaperManifest {
  id: string;
  name: string;
  type: 'shader' | 'canvas' | 'video' | 'static';
  targetFps: number;
  reactiveBindings?: {
    cpu?: string;
    gpu?: string;
    net?: string;
  };
}

export const WALLPAPER_PRESETS: WallpaperManifest[] = [
  {
    id: 'aurora-lite',
    name: 'Aurora Lite (Void Default)',
    type: 'shader',
    targetFps: 30,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
    },
  },
  {
    id: 'deep-space',
    name: 'Deep Space Starfield',
    type: 'canvas',
    targetFps: 24,
  },
];
