import React from 'react';
import catalog from './widgets.json';

// Export all widget components
export * from './components/ClockWidgets';
export * from './components/MetricWidgets';
export * from './components/HistoryChartWidget';
export * from './components/SystemWidgets';
export * from './components/AgentInboxWidget';

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

export interface WidgetCatalogEntry {
  id: string;
  name: string;
  category: 'time' | 'computer' | 'ai' | 'personal' | 'data';
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
};
