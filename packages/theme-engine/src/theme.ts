export interface ThemePalette {
  accent: string;
  surface: string;
  surfaceSubtle: string;
  surfaceCard: string;
  text: string;
  textMuted: string;
  border: string;
  success?: string;
  warning?: string;
  danger?: string;
}

export interface ThemeType {
  display: string;
  mono: string;
}

export interface ThemeShape {
  radius: number; // in pixels, e.g. 14
  blur: number; // backdrop blur in px, e.g. 0
  glow: number; // glow intensity 0.0 to 1.0
}

export interface ThemeBackground {
  type: 'wallpaper' | 'solid' | 'gradient' | 'image';
  ref: string;
  dim: number; // 0.0 to 1.0
}

export interface ThemeSchedule {
  night: string; // "22:00"
  day: string; // "07:00"
}

export interface SkinSlot {
  image: string | null; // Data URL or asset path
  frames: Record<string, string>; // Per-widget frame styles / SVG frames
  font: string | null; // Custom typography family
  accent: string | null; // Accent color override
}

export interface ThemeConfig {
  name: string;
  version: string;
  background: ThemeBackground;
  palette: ThemePalette;
  type: ThemeType;
  shape: ThemeShape;
  widgets: {
    defaultStyle: 'ring' | 'card' | 'minimal' | 'glass';
  };
  schedule?: ThemeSchedule;
  skin?: SkinSlot;
}

/**
 * 1. Default Built-in Theme: "Void" (True Black OLED, Electric Violet, Hairline borders)
 */
export const VOID_THEME: ThemeConfig = {
  name: 'void',
  version: '1.0',
  background: {
    type: 'wallpaper',
    ref: 'aurora-lite',
    dim: 0.35,
  },
  palette: {
    accent: '#7C5CFF',
    surface: '#000000',
    surfaceSubtle: '#09090D',
    surfaceCard: '#0E0E14',
    text: '#EDEDF2',
    textMuted: '#71717A',
    border: 'rgba(255, 255, 255, 0.08)',
    success: '#00E599',
    warning: '#FFB800',
    danger: '#FF3B5C',
  },
  type: {
    display: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, monospace',
  },
  shape: {
    radius: 14,
    blur: 0,
    glow: 0.5,
  },
  widgets: {
    defaultStyle: 'ring',
  },
  schedule: {
    night: '22:00',
    day: '07:00',
  },
  skin: {
    image: null,
    frames: {},
    font: null,
    accent: null,
  },
};

/**
 * 2. Built-in Theme: "Paper" (Light, E-Ink feel, tactile ink on parchment)
 */
export const PAPER_THEME: ThemeConfig = {
  name: 'paper',
  version: '1.0',
  background: {
    type: 'solid',
    ref: 'parchment',
    dim: 0.0,
  },
  palette: {
    accent: '#2B2B2B',
    surface: '#F5F5F0',
    surfaceSubtle: '#EAEAE2',
    surfaceCard: '#FFFFFF',
    text: '#1C1C1C',
    textMuted: '#686868',
    border: '#D0D0C8',
    success: '#1B8A5A',
    warning: '#B87800',
    danger: '#C82828',
  },
  type: {
    display: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, "Courier New", monospace',
  },
  shape: {
    radius: 6,
    blur: 0,
    glow: 0.0,
  },
  widgets: {
    defaultStyle: 'minimal',
  },
  schedule: {
    night: '21:00',
    day: '06:30',
  },
  skin: {
    image: null,
    frames: {},
    font: null,
    accent: null,
  },
};

/**
 * 3. Built-in Theme: "Neon Grid" (Cyberpunk deep blues, vibrant cyan glow)
 */
export const NEON_GRID_THEME: ThemeConfig = {
  name: 'neon-grid',
  version: '1.0',
  background: {
    type: 'wallpaper',
    ref: 'cyber-grid',
    dim: 0.5,
  },
  palette: {
    accent: '#00F0FF',
    surface: '#05050A',
    surfaceSubtle: '#0B0B14',
    surfaceCard: '#101020',
    text: '#FFFFFF',
    textMuted: '#7A889B',
    border: 'rgba(0, 240, 255, 0.25)',
    success: '#00FF66',
    warning: '#FFE600',
    danger: '#FF0055',
  },
  type: {
    display: '"Orbitron", system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, monospace',
  },
  shape: {
    radius: 12,
    blur: 8,
    glow: 0.8,
  },
  widgets: {
    defaultStyle: 'glass',
  },
  schedule: {
    night: '23:00',
    day: '08:00',
  },
  skin: {
    image: null,
    frames: {},
    font: null,
    accent: null,
  },
};

export const BUILTIN_THEMES: Record<string, ThemeConfig> = {
  void: VOID_THEME,
  paper: PAPER_THEME,
  'neon-grid': NEON_GRID_THEME,
};

/**
 * Theme validator: ensures any imported JSON conforms to ThemeConfig schema.
 */
export function validateTheme(raw: unknown): {
  valid: boolean;
  errors: string[];
  theme?: ThemeConfig;
} {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Theme root must be a non-null object'] };
  }

  const obj = raw as Record<string, any>;

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    errors.push('Theme must have a valid non-empty "name" string');
  }

  if (!obj.palette || typeof obj.palette !== 'object') {
    errors.push('Theme must include a "palette" object');
  } else {
    const p = obj.palette;
    if (!p.accent) errors.push('Missing palette.accent');
    if (!p.surface) errors.push('Missing palette.surface');
    if (!p.text) errors.push('Missing palette.text');
  }

  if (!obj.shape || typeof obj.shape !== 'object') {
    errors.push('Theme must include a "shape" object');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validated: ThemeConfig = {
    name: obj.name,
    version: obj.version || '1.0',
    background: obj.background || {
      type: 'wallpaper',
      ref: 'aurora-lite',
      dim: 0.35,
    },
    palette: {
      accent: obj.palette.accent,
      surface: obj.palette.surface,
      surfaceSubtle: obj.palette.surfaceSubtle || obj.palette.surface,
      surfaceCard: obj.palette.surfaceCard || obj.palette.surfaceSubtle || obj.palette.surface,
      text: obj.palette.text,
      textMuted: obj.palette.textMuted || '#71717A',
      border: obj.palette.border || 'rgba(255, 255, 255, 0.08)',
      success: obj.palette.success || '#00E599',
      warning: obj.palette.warning || '#FFB800',
      danger: obj.palette.danger || '#FF3B5C',
    },
    type: obj.type || {
      display: 'system-ui, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    shape: {
      radius: typeof obj.shape.radius === 'number' ? obj.shape.radius : 14,
      blur: typeof obj.shape.blur === 'number' ? obj.shape.blur : 0,
      glow: typeof obj.shape.glow === 'number' ? obj.shape.glow : 0.5,
    },
    widgets: obj.widgets || { defaultStyle: 'ring' },
    schedule: obj.schedule,
    skin: obj.skin || {
      image: null,
      frames: {},
      font: null,
      accent: null,
    },
  };

  return { valid: true, errors: [], theme: validated };
}

/**
 * Export theme as serialized JSON string.
 */
export function exportThemeJson(theme: ThemeConfig): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * Import and validate theme from JSON string.
 */
export function importThemeJson(jsonStr: string): ThemeConfig {
  const parsed = JSON.parse(jsonStr);
  const result = validateTheme(parsed);
  if (!result.valid || !result.theme) {
    throw new Error(`Invalid theme format: ${result.errors.join(', ')}`);
  }
  return result.theme;
}

/**
 * Content hash calculation (FNV-1a 32-bit algorithm) for featherweight hash comparisons.
 * Used for syncing configuration to the phone: the phone sends its content hash,
 * and the Agent sends configuration ONLY on mismatch.
 */
export function computeConfigHash(config: unknown): string {
  const str = JSON.stringify(config);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
