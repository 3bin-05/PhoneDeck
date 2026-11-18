export interface ThemePalette {
  accent: string;
  surface: string;
  surfaceSubtle: string;
  text: string;
  textMuted: string;
  border: string;
}

export interface ThemeConfig {
  name: string;
  background: {
    type: 'wallpaper' | 'solid' | 'gradient';
    ref: string;
    dim: number;
  };
  palette: ThemePalette;
  shape: {
    radius: number;
    blur: number;
    glow: number;
  };
  schedule?: {
    night: string;
    day: string;
  };
}

export const VOID_THEME: ThemeConfig = {
  name: 'void',
  background: { type: 'wallpaper', ref: 'aurora-lite', dim: 0.35 },
  palette: {
    accent: '#7C5CFF',
    surface: '#000000',
    surfaceSubtle: '#09090D',
    text: '#EDEDF2',
    textMuted: '#71717A',
    border: 'rgba(255, 255, 255, 0.08)',
  },
  shape: { radius: 14, blur: 0, glow: 0.5 },
  schedule: { night: '22:00', day: '07:00' },
};

export const PAPER_THEME: ThemeConfig = {
  name: 'paper',
  background: { type: 'solid', ref: 'parchment', dim: 0 },
  palette: {
    accent: '#2B2B2B',
    surface: '#F5F5F0',
    surfaceSubtle: '#EAEAE2',
    text: '#1C1C1C',
    textMuted: '#686868',
    border: '#D0D0C8',
  },
  shape: { radius: 6, blur: 0, glow: 0 },
};

export const NEON_GRID_THEME: ThemeConfig = {
  name: 'neon-grid',
  background: { type: 'wallpaper', ref: 'cyber-grid', dim: 0.5 },
  palette: {
    accent: '#00F0FF',
    surface: '#05050A',
    surfaceSubtle: '#0B0B14',
    text: '#FFFFFF',
    textMuted: '#7A889B',
    border: '#00F0FF33',
  },
  shape: { radius: 12, blur: 8, glow: 0.8 },
};
