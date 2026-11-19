import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AgentEvent } from '@phone-deck/ui-kit';
import {
  type ThemeConfig,
  GLASS_THEME,
  DEFAULT_DECK_CONFIG,
  type DeckConfiguration,
} from '@phone-deck/theme-engine';

export interface PerformanceStats {
  throughputBps: number;
  telemetryBps: number;
  eventsBps: number;
  tickRateHz: number;
  frameTimeMs: number;
}

export interface DeckState {
  metrics: Record<number, number | string | boolean | null>;
  events: AgentEvent[];
  activePage: number;
  totalPages: number;
  isDimmed: boolean;
  isAmbient: boolean;
  volumeKeyPaging: boolean;
  connected: boolean;
  stats: PerformanceStats;
  theme: ThemeConfig;
  deckConfig: DeckConfiguration;
  artBaseUrl: string;

  // Actions
  setTheme: (theme: ThemeConfig) => void;
  setDeckConfig: (config: DeckConfiguration) => void;
  setArtBaseUrl: (url: string) => void;
  applyMetricBatch: (updates: Record<number, any>) => void;
  addEvent: (event: AgentEvent) => void;
  removeEvent: (eventId: string) => void;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  toggleDimmed: () => void;
  setDimmed: (dimmed: boolean) => void;
  setAmbient: (ambient: boolean) => void;
  setConnected: (connected: boolean) => void;
  updateStats: (stats: Partial<PerformanceStats>) => void;
}

const DEFAULT_METRICS: Record<number, number | string | boolean | null> = {
  1: 380, // CPU total 38.0%
  2: 4200, // CPU Freq 4200 MHz
  3: 480, // CPU Temp 48.0°C
  4: 17_000_000_000, // RAM Used ~16 GB
  5: 34_359_738_368, // RAM Total 32 GB
  6: 240, // GPU Usage 24.0%
  9: 550, // GPU Temp 55.0°C
  10: 245_760, // Net In ~240 KB/s
  11: 87_040, // Net Out ~85 KB/s
  12: 450_000_000_000, // Disk Used 450 GB
  13: 1_000_000_000_000, // Disk Total 1 TB
  14: 14200, // Uptime 14200 s
  15: 85, // Phone Battery 85%
  16: true, // Phone Charging true
  17: true, // Media Playing
  18: 'Selected Ambient Works', // Media Title
  19: 'Aphex Twin', // Media Artist
  20: 84, // Media Position Sec
  21: 278, // Media Duration Sec
  22: 'Selected Ambient Works 85-92', // Media Album
  23: 'Spotify', // Media Source App
  24: 'playing', // Media Status
  25: 1000, // Media Playback Rate (1000 = 1.0x)
  26: 127, // Media Controls flags
  27: 'mock-art-aphex-saw', // Media Art ID
  28: '#7C5CFF,#18181B,#00E599', // Media Palette
  29: 75, // Master Volume Pct
  30: false, // Master Mute
  31: '["Spotify", "Opera GX", "Google Chrome", "VLC Media Player"]', // Session List
  32: JSON.stringify({
    vscode: {
      id: 'vscode',
      name: 'Visual Studio Code',
      running: true,
      instances: 1,
      focused: true,
      cpu_pct: 1.4,
      ram_bytes: 420_000_000,
      project: 'PhoneDeck',
      file: 'App.tsx',
      unsaved: false,
      icon: 'Code',
      quick_launches: [
        { id: 'proj', label: 'PhoneDeck', value: '.' },
        { id: 'new', label: '+ Win', value: '-n' },
      ],
    },
    opera: {
      id: 'opera',
      name: 'Opera GX',
      running: true,
      instances: 1,
      focused: false,
      cpu_pct: 2.1,
      ram_bytes: 650_000_000,
      tab_title: 'YouTube Music',
      audio_active: true,
      icon: 'Flame',
      quick_launches: [
        { id: 'search', label: 'Google', value: 'https://google.com' },
        { id: 'ytm', label: 'YTM', value: 'https://music.youtube.com' },
      ],
    },
    antigravity: {
      id: 'antigravity',
      name: 'Antigravity',
      running: true,
      instances: 1,
      focused: false,
      cpu_pct: 0.8,
      ram_bytes: 180_000_000,
      project: 'PhoneDeck',
      icon: 'Sparkles',
    },
  }),
};

export const useDeckStore = create<DeckState>((set) => ({
  metrics: DEFAULT_METRICS,
  artBaseUrl: 'http://127.0.0.1:8765/api/media/art',
  events: [
    {
      id: 'task-initial',
      ts: Date.now(),
      agent: 'claude-code',
      project: 'phone-deck',
      cwd: 'D:\\PhoneDeck',
      kind: 'done',
      title: 'Task Complete',
      summary: 'Finished in phone-deck · 6 files · +142 −38 · 4m 12s',
      stats: {
        duration_s: 252,
        files_changed: 6,
        insertions: 142,
        deletions: 38,
      },
      actions: ['open_editor', 'mark_reviewed', 'dismiss'],
    },
  ],
  activePage: 0,
  totalPages: 4,
  isDimmed: false,
  isAmbient: false,
  volumeKeyPaging: true,
  connected: false,
  stats: {
    throughputBps: 72,
    telemetryBps: 72,
    eventsBps: 0,
    tickRateHz: 2.0,
    frameTimeMs: 3.2,
  },
  theme: GLASS_THEME,
  deckConfig: DEFAULT_DECK_CONFIG,

  setTheme: (theme) => set({ theme }),
  setArtBaseUrl: (artBaseUrl) => set({ artBaseUrl }),
  setDeckConfig: (deckConfig) =>
    set({
      deckConfig,
      theme: deckConfig.theme,
      totalPages: deckConfig.pages.length,
    }),

  applyMetricBatch: (updates) =>
    set((state) => {
      let hasChanges = false;
      const nextMetrics = { ...state.metrics };

      for (const [k, v] of Object.entries(updates)) {
        const fieldId = Number(k);
        if (v === null) {
          if (fieldId in nextMetrics) {
            delete nextMetrics[fieldId];
            hasChanges = true;
          }
        } else if (nextMetrics[fieldId] !== v) {
          nextMetrics[fieldId] = v;
          hasChanges = true;
        }
      }

      return hasChanges ? { metrics: nextMetrics } : state;
    }),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events.slice(0, 19)], // Keep up to 20 recent events
    })),

  removeEvent: (eventId) =>
    set((state) => ({
      events: state.events.filter((e) => e.id !== eventId),
    })),

  setPage: (page) =>
    set((state) => ({
      activePage: Math.max(0, Math.min(state.totalPages - 1, page)),
    })),

  nextPage: () =>
    set((state) => ({
      activePage: (state.activePage + 1) % state.totalPages,
    })),

  prevPage: () =>
    set((state) => ({
      activePage:
        (state.activePage - 1 + state.totalPages) % state.totalPages,
    })),

  toggleDimmed: () => set((state) => ({ isDimmed: !state.isDimmed })),
  setDimmed: (isDimmed) => set({ isDimmed }),
  setAmbient: (isAmbient) => set({ isAmbient }),
  setConnected: (connected) => set({ connected }),

  updateStats: (newStats) =>
    set((state) => ({
      stats: { ...state.stats, ...newStats },
    })),
}));

/**
 * Granular selector for a single metric.
 * Unchanged widgets will NOT re-render when other keys change.
 */
export function useMetric(fieldId: number): number | string | boolean | null {
  return useDeckStore((state) => state.metrics[fieldId] ?? null);
}

/**
 * Granular selector for multiple metrics with shallow equality check.
 */
export function useMetrics(fieldIds: number[]): (number | string | boolean | null)[] {
  return useDeckStore(
    useShallow((state) => fieldIds.map((id) => state.metrics[id] ?? null))
  );
}

export function useActivePage() {
  return useDeckStore((state) => state.activePage);
}

export function useIsDimmed() {
  return useDeckStore((state) => state.isDimmed);
}

export function useIsAmbient() {
  return useDeckStore((state) => state.isAmbient);
}

export function useStats() {
  return useDeckStore((state) => state.stats);
}

export function useEvents() {
  return useDeckStore((state) => state.events);
}

export function useTheme() {
  return useDeckStore((state) => state.theme);
}

export function useDeckConfig() {
  return useDeckStore((state) => state.deckConfig);
}
