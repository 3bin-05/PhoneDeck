import React from 'react';
import catalog from './widgets.json';

// Export all widget components
export * from './components/ClockWidgets';
export * from './components/MetricWidgets';
export * from './components/HistoryChartWidget';
export * from './components/SystemWidgets';
export * from './components/AgentInboxWidget';
export * from './components/ShortcutGridWidget';
export * from './components/MediaWidgets';
export * from './components/AppWidgets';

import {
  DigitalClockWidget,
  AnalogClockWidget,
  FlipClockWidget,
} from './components/ClockWidgets';
import {
  MetricTileWidget,
  RadialGaugeWidget,
} from './components/MetricWidgets';
import { HistoryChartWidget } from './components/HistoryChartWidget';
import {
  MemoryDisksWidget,
  NetworkIoWidget,
  TopProcessesWidget,
  SystemUptimeWidget,
  PhoneStatusWidget,
} from './components/SystemWidgets';
import { AgentInboxWidget } from './components/AgentInboxWidget';
import { ShortcutGridWidget } from './components/ShortcutGridWidget';
import {
  NowPlayingLargeWidget,
  MiniNowPlayingWidget,
  VinylPlayerWidget,
  VolumeDialWidget,
  MediaSourceSwitcherWidget,
} from './components/MediaWidgets';
import {
  AppTileWidget,
  AppCardWidget,
  AppDockWidget,
  type AppRuntimeData,
} from './components/AppWidgets';

export interface WidgetCatalogEntry {
  id: string;
  name: string;
  category: 'time' | 'computer' | 'ai' | 'personal' | 'data' | 'media' | 'apps';
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  needs: number[];
}

export interface WidgetBox {
  w: number;
  h: number;
  x?: number;
  y?: number;
}

export interface WidgetContext {
  theme: string;
  isDimmed: boolean;
  getMetric: (fieldId: number) => number | string | boolean | null;
  sendAction?: (action: string, payload?: unknown) => void;
}

/**
 * Widget Contract per plan.md section 2 & section 16 P4:
 * { needs, create(box, ctx) -> { update(kind) } }
 */
export interface WidgetInstanceContract {
  needs: number[];
  render: () => React.ReactElement;
  update?: (kind: 'metric' | 'resize' | 'dim') => void;
}

export interface WidgetDefinition {
  id: string;
  name: string;
  category: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  needs: number[];
  create: (box: WidgetBox, ctx: WidgetContext) => WidgetInstanceContract;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = catalog.widgets as WidgetCatalogEntry[];

/**
 * Registry implementing the widget contract for all widgets in the catalog.
 */
export const WIDGET_REGISTRY: Record<string, (box: WidgetBox, ctx: WidgetContext) => WidgetInstanceContract> = {
  'clock-digital': (_box, _ctx) => ({
    needs: [],
    render: () => React.createElement(DigitalClockWidget),
  }),

  'clock-analog': (_box, _ctx) => ({
    needs: [],
    render: () => React.createElement(AnalogClockWidget),
  }),

  'clock-flip': (_box, _ctx) => ({
    needs: [],
    render: () => React.createElement(FlipClockWidget),
  }),

  'metric-cpu': (_box, ctx) => ({
    needs: [1, 2, 3], // CpuTotal, CpuFreqMhz, CpuTempC
    render: () => {
      const rawCpu = ctx.getMetric(1);
      const cpuVal = typeof rawCpu === 'number' ? (rawCpu / 10).toFixed(1) : '0.0';
      const rawFreq = ctx.getMetric(2);
      const freqText = typeof rawFreq === 'number' ? `${rawFreq} MHz` : '3.8 GHz';
      const rawTemp = ctx.getMetric(3);
      const tempText = typeof rawTemp === 'number' ? `${(rawTemp / 10).toFixed(1)}°C` : '42.0°C';

      return React.createElement(MetricTileWidget, {
        title: 'CPU USAGE',
        value: cpuVal,
        unit: '%',
        subtext: `${freqText} · ${tempText}`,
        accentColor: '#7C5CFF',
      });
    },
  }),

  'metric-ram': (_box, ctx) => ({
    needs: [4, 5], // RamUsedBytes, RamTotalBytes
    render: () => {
      const ramUsed = (ctx.getMetric(4) as number) || 8 * 1024 * 1024 * 1024;
      const ramTotal = (ctx.getMetric(5) as number) || 32 * 1024 * 1024 * 1024;
      const pct = ((ramUsed / ramTotal) * 100).toFixed(1);
      const usedGb = (ramUsed / (1024 * 1024 * 1024)).toFixed(1);
      const totalGb = (ramTotal / (1024 * 1024 * 1024)).toFixed(0);

      return React.createElement(MetricTileWidget, {
        title: 'RAM ACTIVE',
        value: pct,
        unit: '%',
        subtext: `${usedGb} GB / ${totalGb} GB`,
        accentColor: '#00E599',
      });
    },
  }),

  'gauge-radial': (_box, ctx) => ({
    needs: [1], // CpuTotal
    render: () => {
      const raw = ctx.getMetric(1);
      const val = typeof raw === 'number' ? raw / 10 : 35;
      return React.createElement(RadialGaugeWidget, {
        title: 'CPU LOAD',
        value: val,
        subtext: 'SPRING INTERPOLATED',
        accentColor: '#7C5CFF',
      });
    },
  }),

  'chart-history': (_box, ctx) => ({
    needs: [1], // CpuTotal
    render: () => {
      const raw = ctx.getMetric(1);
      const val = typeof raw === 'number' ? raw / 10 : 25;
      return React.createElement(HistoryChartWidget, {
        title: 'CPU LOAD HISTORY',
        currentValue: val,
        unit: '%',
        accentColor: '#7C5CFF',
      });
    },
  }),

  'memory-disks': (_box, ctx) => ({
    needs: [4, 5, 12, 13],
    render: () => {
      const ramUsed = (ctx.getMetric(4) as number) || 12 * 1024 * 1024 * 1024;
      const ramTotal = (ctx.getMetric(5) as number) || 32 * 1024 * 1024 * 1024;
      const diskUsed = (ctx.getMetric(12) as number) || 450 * 1024 * 1024 * 1024;
      const diskTotal = (ctx.getMetric(13) as number) || 1024 * 1024 * 1024 * 1024;

      return React.createElement(MemoryDisksWidget, {
        ramUsedBytes: ramUsed,
        ramTotalBytes: ramTotal,
        diskUsedBytes: diskUsed,
        diskTotalBytes: diskTotal,
      });
    },
  }),

  'network-io': (_box, ctx) => ({
    needs: [10, 11],
    render: () => {
      const inBytes = (ctx.getMetric(10) as number) || 1024 * 420;
      const outBytes = (ctx.getMetric(11) as number) || 1024 * 85;

      return React.createElement(NetworkIoWidget, {
        inBytesSec: inBytes,
        outBytesSec: outBytes,
      });
    },
  }),

  'top-processes': (_box, _ctx) => ({
    needs: [1],
    render: () => React.createElement(TopProcessesWidget),
  }),

  'system-uptime': (_box, ctx) => ({
    needs: [14],
    render: () => {
      const uptime = (ctx.getMetric(14) as number) || 128450;
      return React.createElement(SystemUptimeWidget, {
        uptimeSeconds: uptime,
      });
    },
  }),

  'phone-status': (_box, ctx) => ({
    needs: [15, 16],
    render: () => {
      const bat = (ctx.getMetric(15) as number) || 88;
      const charging = (ctx.getMetric(16) as boolean) ?? true;
      return React.createElement(PhoneStatusWidget, {
        batteryPct: bat,
        isCharging: charging,
      });
    },
  }),

  'agent-inbox': (_box, _ctx) => ({
    needs: [],
    render: () => React.createElement(AgentInboxWidget),
  }),

  'shortcut-grid': (_box, ctx) => ({
    needs: [],
    render: () =>
      React.createElement(ShortcutGridWidget, {
        onExecuteShortcut: (id: string) => {
          if (ctx.sendAction) {
            ctx.sendAction(`shortcut:${id}`);
          }
        },
      }),
  }),

  'now-playing-large': (_box, ctx) => ({
    needs: [17, 18, 19, 20, 21, 22, 23, 27, 28, 29, 30],
    render: () =>
      React.createElement(NowPlayingLargeWidget, {
        isPlaying: (ctx.getMetric(17) as boolean) ?? false,
        title: (ctx.getMetric(18) as string) || 'No Media Playing',
        artist: (ctx.getMetric(19) as string) || 'Aphex Twin',
        positionSec: (ctx.getMetric(20) as number) || 0,
        durationSec: (ctx.getMetric(21) as number) || 240,
        album: (ctx.getMetric(22) as string) || '',
        sourceApp: (ctx.getMetric(23) as string) || 'Spotify',
        playbackRate: (ctx.getMetric(25) as number) || 1000,
        artId: (ctx.getMetric(27) as string) || '',
        palette: (ctx.getMetric(28) as string) || '#7C5CFF,#121217,#00E599',
        masterVolume: (ctx.getMetric(29) as number) ?? 75,
        isMuted: (ctx.getMetric(30) as boolean) ?? false,
        onTogglePlay: () => ctx.sendAction && ctx.sendAction('media_toggle'),
        onNext: () => ctx.sendAction && ctx.sendAction('media_next'),
        onPrev: () => ctx.sendAction && ctx.sendAction('media_prev'),
        onSeek: (pos) => ctx.sendAction && ctx.sendAction('media_seek', { pos }),
        onVolumeChange: (vol) => ctx.sendAction && ctx.sendAction('media_volume', { vol }),
        onToggleMute: () => ctx.sendAction && ctx.sendAction('media_mute'),
        onCycleSource: () => ctx.sendAction && ctx.sendAction('media_cycle_source'),
      }),
  }),

  'now-playing-mini': (_box, ctx) => ({
    needs: [17, 18, 19, 27],
    render: () =>
      React.createElement(MiniNowPlayingWidget, {
        isPlaying: (ctx.getMetric(17) as boolean) ?? false,
        title: (ctx.getMetric(18) as string) || 'Alberto Balsalm',
        artist: (ctx.getMetric(19) as string) || 'Aphex Twin',
        artId: (ctx.getMetric(27) as string) || '',
        onTogglePlay: () => ctx.sendAction && ctx.sendAction('media_toggle'),
      }),
  }),

  'vinyl-player': (_box, ctx) => ({
    needs: [17, 18, 19, 20, 21, 27],
    render: () =>
      React.createElement(VinylPlayerWidget, {
        isPlaying: (ctx.getMetric(17) as boolean) ?? false,
        title: (ctx.getMetric(18) as string) || 'Selected Ambient Works',
        artist: (ctx.getMetric(19) as string) || 'Aphex Twin',
        positionSec: (ctx.getMetric(20) as number) || 0,
        durationSec: (ctx.getMetric(21) as number) || 240,
        artId: (ctx.getMetric(27) as string) || '',
        onTogglePlay: () => ctx.sendAction && ctx.sendAction('media_toggle'),
      }),
  }),

  'volume-dial': (_box, ctx) => ({
    needs: [29, 30],
    render: () =>
      React.createElement(VolumeDialWidget, {
        masterVolume: (ctx.getMetric(29) as number) ?? 75,
        isMuted: (ctx.getMetric(30) as boolean) ?? false,
        onVolumeChange: (vol) => ctx.sendAction && ctx.sendAction('media_volume', { vol }),
        onToggleMute: () => ctx.sendAction && ctx.sendAction('media_mute'),
      }),
  }),

  'media-source-switcher': (_box, ctx) => ({
    needs: [23, 31],
    render: () => {
      let sessions = ['Spotify', 'Opera GX', 'Google Chrome', 'VLC Media Player'];
      const rawSessions = ctx.getMetric(31);
      if (typeof rawSessions === 'string') {
        try { sessions = JSON.parse(rawSessions); } catch {}
      }
      return React.createElement(MediaSourceSwitcherWidget, {
        sourceApp: (ctx.getMetric(23) as string) || 'Spotify',
        availableSessions: sessions,
        onSelectSource: (app) => ctx.sendAction && ctx.sendAction('media_source', { app }),
      });
    },
  }),

  'app-tile': (_box, ctx) => ({
    needs: [32],
    render: () => {
      let appState: AppRuntimeData = {
        id: 'vscode',
        name: 'Visual Studio Code',
        running: true,
        focused: true,
        icon: 'Code',
      };
      const raw = ctx.getMetric(32);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            appState = (parsed.vscode || Object.values(parsed)[0] || appState) as AppRuntimeData;
          }
        } catch {}
      }
      return React.createElement(AppTileWidget, {
        app: appState,
        onAction: (id, act, ql) => ctx.sendAction && ctx.sendAction('app_action', { app_id: id, action: act, quick_launch_id: ql }),
      });
    },
  }),

  'app-card': (_box, ctx) => ({
    needs: [32],
    render: () => {
      let appState: AppRuntimeData = {
        id: 'vscode',
        name: 'Visual Studio Code',
        running: true,
        focused: true,
        project: 'PhoneDeck',
        file: 'App.tsx',
        unsaved: false,
        cpu_pct: 1.4,
        ram_bytes: 420_000_000,
        icon: 'Code',
        quick_launches: [
          { id: 'proj', label: 'PhoneDeck', value: '.' },
          { id: 'new', label: '+ Win', value: '-n' },
        ],
      };
      const raw = ctx.getMetric(32);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            appState = (parsed.vscode || Object.values(parsed)[0] || appState) as AppRuntimeData;
          }
        } catch {}
      }
      return React.createElement(AppCardWidget, {
        app: appState,
        onAction: (id, act, ql) => ctx.sendAction && ctx.sendAction('app_action', { app_id: id, action: act, quick_launch_id: ql }),
      });
    },
  }),

  'app-dock': (_box, ctx) => ({
    needs: [32],
    render: () => {
      let appsList: AppRuntimeData[] = [
        { id: 'vscode', name: 'VS Code', running: true, focused: true, icon: 'Code' },
        { id: 'operagx', name: 'Opera GX', running: true, focused: false, icon: 'Flame', audio_active: true },
        { id: 'chrome', name: 'Chrome', running: false, focused: false, icon: 'Globe' },
        { id: 'spotify', name: 'Spotify', running: true, focused: false, icon: 'Music' },
        { id: 'terminal', name: 'Terminal', running: false, focused: false, icon: 'Terminal' },
      ];
      const raw = ctx.getMetric(32);
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            appsList = Object.values(parsed);
          }
        } catch {}
      }
      return React.createElement(AppDockWidget, {
        apps: appsList,
        onAction: (id, act, ql) => ctx.sendAction && ctx.sendAction('app_action', { app_id: id, action: act, quick_launch_id: ql }),
      });
    },
  }),
};
