import { WallpaperManifest } from './types';
import {
  AURORA_FRAGMENT,
  FLOW_FIELD_FRAGMENT,
  STARFIELD_FRAGMENT,
  NEBULA_FRAGMENT,
  GRID_FRAGMENT,
} from './shaders';

export const BUILTIN_WALLPAPERS: Record<string, WallpaperManifest> = {
  'aurora-lite': {
    id: 'aurora-lite',
    name: 'Aurora Lite (Void Companion)',
    type: 'shader',
    version: '1.0.0',
    targetFps: 30,
    dim: 0.35,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
      temp: 'hue',
    },
    assets: {
      fragmentShader: AURORA_FRAGMENT,
    },
  },

  'flow-field': {
    id: 'flow-field',
    name: 'Vector Stream Flow',
    type: 'shader',
    version: '1.0.0',
    targetFps: 30,
    dim: 0.35,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
      temp: 'hue',
    },
    assets: {
      fragmentShader: FLOW_FIELD_FRAGMENT,
    },
  },

  'starfield': {
    id: 'starfield',
    name: 'Deep Space Starfield',
    type: 'shader',
    version: '1.0.0',
    targetFps: 30,
    dim: 0.40,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
      temp: 'hue',
    },
    assets: {
      fragmentShader: STARFIELD_FRAGMENT,
    },
  },

  'nebula': {
    id: 'nebula',
    name: 'Cosmic Nebula Gas',
    type: 'shader',
    version: '1.0.0',
    targetFps: 24,
    dim: 0.35,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
      temp: 'hue',
    },
    assets: {
      fragmentShader: NEBULA_FRAGMENT,
    },
  },

  'cyber-grid': {
    id: 'cyber-grid',
    name: 'Cyber Horizon Grid',
    type: 'shader',
    version: '1.0.0',
    targetFps: 30,
    dim: 0.30,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
      temp: 'hue',
    },
    assets: {
      fragmentShader: GRID_FRAGMENT,
    },
  },

  'ambient-particles': {
    id: 'ambient-particles',
    name: 'Minimal Dust Particles',
    type: 'particles',
    version: '1.0.0',
    targetFps: 24,
    dim: 0.45,
    blur: 0,
    reactiveBindings: {
      cpu: 'speed',
      gpu: 'intensity',
      net: 'pulse',
    },
  },

  'glass-bokeh': {
    id: 'glass-bokeh',
    name: 'Warm Studio Bokeh (Glass Companion)',
    type: 'static-ken-burns',
    version: '1.0.0',
    targetFps: 12,
    dim: 0.88,
    blur: 0,
    assets: {
      image: '/glass-bokeh-bg.jpg',
    },
  },

  'static-void': {
    id: 'static-void',
    name: 'Void Minimal Star Drift',
    type: 'static-ken-burns',
    version: '1.0.0',
    targetFps: 12,
    dim: 0.40,
    blur: 0,
  },
};

export const DEFAULT_WALLPAPER = BUILTIN_WALLPAPERS['aurora-lite'];
