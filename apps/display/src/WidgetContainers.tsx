import React from 'react';
import { FIELD_IDS } from '@phone-deck/ui-kit';
import {
  DigitalClockWidget,
  AnalogClockWidget,
  FlipClockWidget,
  MetricTileWidget,
  RadialGaugeWidget,
  HistoryChartWidget,
  MemoryDisksWidget,
  NetworkIoWidget,
  TopProcessesWidget,
  SystemUptimeWidget,
  PhoneStatusWidget,
  AgentInboxWidget,
} from '@phone-deck/widgets';
import { useMetric, useEvents } from './deckStore';

/**
 * Clock Widget Container (Zero bandwidth, pure local time)
 */
export const DigitalClockContainer: React.FC = React.memo(() => {
  return <DigitalClockWidget />;
});
DigitalClockContainer.displayName = 'DigitalClockContainer';

export const AnalogClockContainer: React.FC = React.memo(() => {
  return <AnalogClockWidget />;
});
AnalogClockContainer.displayName = 'AnalogClockContainer';

export const FlipClockContainer: React.FC = React.memo(() => {
  return <FlipClockWidget />;
});
FlipClockContainer.displayName = 'FlipClockContainer';

/**
 * CPU Radial Gauge Container (Spring interpolated at 30 fps)
 * Only re-renders when FIELD_IDS.CpuTotal changes!
 */
export const CpuGaugeContainer: React.FC = React.memo(() => {
  const cpuRaw = useMetric(FIELD_IDS.CpuTotal);
  const cpuVal = typeof cpuRaw === 'number' ? cpuRaw / 10 : 38.0;

  return (
    <RadialGaugeWidget
      title="CPU LOAD"
      value={cpuVal}
      subtext="SPRING 30FPS"
      accentColor="#7C5CFF"
    />
  );
});
CpuGaugeContainer.displayName = 'CpuGaugeContainer';

/**
 * CPU Metric Tile Container
 * Only re-renders when CpuTotal, CpuFreq, or CpuTemp changes!
 */
export const CpuTileContainer: React.FC = React.memo(() => {
  const cpuRaw = useMetric(FIELD_IDS.CpuTotal);
  const freqRaw = useMetric(FIELD_IDS.CpuFreqMhz);
  const tempRaw = useMetric(FIELD_IDS.CpuTempC);

  const cpuVal = typeof cpuRaw === 'number' ? (cpuRaw / 10).toFixed(1) : '38.0';
  const freqText = typeof freqRaw === 'number' ? `${freqRaw} MHz` : '4200 MHz';
  const tempText =
    typeof tempRaw === 'number' ? `${(tempRaw / 10).toFixed(1)}°C` : '48.0°C';

  return (
    <MetricTileWidget
      title="CPU USAGE"
      value={cpuVal}
      unit="%"
      subtext={`${freqText} · ${tempText}`}
      accentColor="#7C5CFF"
    />
  );
});
CpuTileContainer.displayName = 'CpuTileContainer';

/**
 * RAM Metric Tile Container
 * Only re-renders when RamUsedBytes or RamTotalBytes changes!
 */
export const RamTileContainer: React.FC = React.memo(() => {
  const usedRaw = useMetric(FIELD_IDS.RamUsedBytes);
  const totalRaw = useMetric(FIELD_IDS.RamTotalBytes);

  const used = typeof usedRaw === 'number' ? usedRaw : 17_000_000_000;
  const total = typeof totalRaw === 'number' ? totalRaw : 34_359_738_368;

  const pct = ((used / total) * 100).toFixed(1);
  const usedGb = (used / (1024 * 1024 * 1024)).toFixed(1);
  const totalGb = (total / (1024 * 1024 * 1024)).toFixed(0);

  return (
    <MetricTileWidget
      title="MEMORY RAM"
      value={pct}
      unit="%"
      subtext={`${usedGb} GB / ${totalGb} GB`}
      accentColor="#00E599"
    />
  );
});
RamTileContainer.displayName = 'RamTileContainer';

/**
 * GPU Metric Tile Container
 */
export const GpuTileContainer: React.FC = React.memo(() => {
  const gpuRaw = useMetric(FIELD_IDS.GpuUsage);
  const tempRaw = useMetric(FIELD_IDS.GpuTempC);

  const gpuVal = typeof gpuRaw === 'number' ? (gpuRaw / 10).toFixed(1) : '24.0';
  const tempText =
    typeof tempRaw === 'number' ? `${(tempRaw / 10).toFixed(1)}°C` : '55.0°C';

  return (
    <MetricTileWidget
      title="GPU LOAD"
      value={gpuVal}
      unit="%"
      subtext={`RTX 4090 · ${tempText}`}
      accentColor="#FFB800"
    />
  );
});
GpuTileContainer.displayName = 'GpuTileContainer';

/**
 * History Chart Container (Canvas LTTB Ring Buffer)
 * Only updates with CPU changes!
 */
export const CpuHistoryContainer: React.FC = React.memo(() => {
  const cpuRaw = useMetric(FIELD_IDS.CpuTotal);
  const cpuVal = typeof cpuRaw === 'number' ? cpuRaw / 10 : 38.0;

  return (
    <HistoryChartWidget
      title="CPU LOAD HISTORY"
      currentValue={cpuVal}
      unit="%"
      accentColor="#7C5CFF"
    />
  );
});
CpuHistoryContainer.displayName = 'CpuHistoryContainer';

/**
 * Memory & Storage Disks Container
 */
export const MemoryDisksContainer: React.FC = React.memo(() => {
  const ramUsedRaw = useMetric(FIELD_IDS.RamUsedBytes);
  const ramTotalRaw = useMetric(FIELD_IDS.RamTotalBytes);
  const diskUsedRaw = useMetric(FIELD_IDS.DiskUsedBytes);
  const diskTotalRaw = useMetric(FIELD_IDS.DiskTotalBytes);

  const ramUsed =
    typeof ramUsedRaw === 'number' ? ramUsedRaw : 17_000_000_000;
  const ramTotal =
    typeof ramTotalRaw === 'number' ? ramTotalRaw : 34_359_738_368;
  const diskUsed =
    typeof diskUsedRaw === 'number' ? diskUsedRaw : 450_000_000_000;
  const diskTotal =
    typeof diskTotalRaw === 'number' ? diskTotalRaw : 1_000_000_000_000;

  return (
    <MemoryDisksWidget
      ramUsedBytes={ramUsed}
      ramTotalBytes={ramTotal}
      diskUsedBytes={diskUsed}
      diskTotalBytes={diskTotal}
    />
  );
});
MemoryDisksContainer.displayName = 'MemoryDisksContainer';

/**
 * Network I/O Container
 */
export const NetworkIoContainer: React.FC = React.memo(() => {
  const inRaw = useMetric(FIELD_IDS.NetInBytesSec);
  const outRaw = useMetric(FIELD_IDS.NetOutBytesSec);

  const inBytes = typeof inRaw === 'number' ? inRaw : 245_760;
  const outBytes = typeof outRaw === 'number' ? outRaw : 87_040;

  return <NetworkIoWidget inBytesSec={inBytes} outBytesSec={outBytes} />;
});
NetworkIoContainer.displayName = 'NetworkIoContainer';

/**
 * Top Processes Container
 */
export const TopProcessesContainer: React.FC = React.memo(() => {
  return <TopProcessesWidget />;
});
TopProcessesContainer.displayName = 'TopProcessesContainer';

/**
 * System Uptime Container
 */
export const SystemUptimeContainer: React.FC = React.memo(() => {
  const uptimeRaw = useMetric(FIELD_IDS.UptimeSeconds);
  const uptimeSec = typeof uptimeRaw === 'number' ? uptimeRaw : 14200;

  return <SystemUptimeWidget uptimeSeconds={uptimeSec} />;
});
SystemUptimeContainer.displayName = 'SystemUptimeContainer';

/**
 * Phone Device Status Container
 */
export const PhoneStatusContainer: React.FC = React.memo(() => {
  const batRaw = useMetric(FIELD_IDS.PcBatteryPct);
  const chargingRaw = useMetric(FIELD_IDS.PcBatteryCharging);

  const batPct = typeof batRaw === 'number' ? batRaw : 85;
  const isCharging = typeof chargingRaw === 'boolean' ? chargingRaw : true;

  return (
    <PhoneStatusWidget
      batteryPct={batPct}
      isCharging={isCharging}
      tempC={32.1}
    />
  );
});
PhoneStatusContainer.displayName = 'PhoneStatusContainer';

/**
 * AI Agent Inbox Container
 */
export const AgentInboxContainer: React.FC = React.memo(() => {
  const events = useEvents();

  const formattedEvents = events.map((e) => {
    const status: 'done' | 'needs_input' | 'error' =
      e.kind === 'needs_input'
        ? 'needs_input'
        : e.kind === 'error'
        ? 'error'
        : 'done';

    return {
      id: e.id,
      agent: e.agent,
      project: e.project,
      durationSec: e.stats?.duration_s ?? 120,
      filesChanged: e.stats?.files_changed ?? 1,
      insertions: e.stats?.insertions ?? 10,
      deletions: e.stats?.deletions ?? 2,
      status,
      timestamp: 'Just now',
    };
  });

  return <AgentInboxWidget events={formattedEvents} />;
});
AgentInboxContainer.displayName = 'AgentInboxContainer';
