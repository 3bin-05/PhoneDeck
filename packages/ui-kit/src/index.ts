import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export * from './protocol';
export * from './msgpack';
export * from './spring';
export * from './ringBuffer';

export const VOID_TOKENS = {
  colors: {
    surface: '#000000',
    surfaceSubtle: '#09090D',
    surfaceCard: '#0E0E14',
    border: '#181824',
    borderHairline: 'rgba(255, 255, 255, 0.08)',
    accent: '#7C5CFF',
    accentGlow: 'rgba(124, 92, 255, 0.35)',
    text: '#EDEDF2',
    textMuted: '#71717A',
    textDim: '#4B4B55',
    success: '#00E599',
    warning: '#FFB800',
    danger: '#FF3B5C',
  },
  typography: {
    mono: 'ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, monospace',
    display: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: {
    radius: '14px',
    glow: '0 0 24px rgba(124, 92, 255, 0.25)',
  },
} as const;
