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
  ShortcutGridWidget,
  NowPlayingLargeWidget,
  MiniNowPlayingWidget,
  VinylPlayerWidget,
  VolumeDialWidget,
  MediaSourceSwitcherWidget,
  AppTileWidget,
  AppCardWidget,
  AppDockWidget,
  type AppRuntimeData,
} from '@phone-deck/widgets';
import { useMetric, useEvents, useDeckStore } from './deckStore';
import {
  sendMediaAction,
  sendMediaSeek,
  sendMediaVolume,
  sendMediaSource,
  sendAppAction,
} from './useDeckBridge';

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

  const handleOpenEditor = (id: string) => {
    const evt = events.find((e) => e.id === id);
    const cwd = evt?.cwd || '.';
    fetch('http://127.0.0.1:8767/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open_editor', cwd }),
    }).catch(() => {
      // In browser simulation or fallback, open local editor
      console.log('Action open_editor requested for', cwd);
    });
  };

  const handleMarkReviewed = (id: string) => {
    useDeckStore.getState().removeEvent(id);
  };

  const handleDismiss = (id: string) => {
    useDeckStore.getState().removeEvent(id);
  };

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

  return (
    <AgentInboxWidget
      events={formattedEvents}
      onOpenInEditor={handleOpenEditor}
      onMarkReviewed={handleMarkReviewed}
      onDismiss={handleDismiss}
    />
  );
});
AgentInboxContainer.displayName = 'AgentInboxContainer';

/**
 * Customizable Shortcuts & Controls Container
 */
export const ShortcutGridContainer: React.FC = React.memo(() => {
  const theme = useDeckStore((s) => s.theme);

  const handleExecuteShortcut = async (id: string) => {
    try {
      await fetch(`http://127.0.0.1:8767/api/shortcut/${id}`, {
        method: 'POST',
      });
    } catch {
      console.log('Shortcut executed in simulation:', id);
    }
  };

  return (
    <ShortcutGridWidget
      accentColor={theme.palette.accent}
      onExecuteShortcut={handleExecuteShortcut}
    />
  );
});
ShortcutGridContainer.displayName = 'ShortcutGridContainer';

/**
 * Now Playing Large Container (Art-forward, zero wire bandwidth position interpolation)
 */
export const NowPlayingLargeContainer: React.FC = React.memo(() => {
  const isPlaying = Boolean(useMetric(FIELD_IDS.MediaPlaying));
  const title = (useMetric(FIELD_IDS.MediaTitle) as string) || 'No Media Active';
  const artist = (useMetric(FIELD_IDS.MediaArtist) as string) || 'Unknown Artist';
  const album = (useMetric(FIELD_IDS.MediaAlbum) as string) || '';
  const sourceApp = (useMetric(FIELD_IDS.MediaSourceApp) as string) || 'Spotify';
  const positionSec = Number(useMetric(FIELD_IDS.MediaPositionSec) || 0);
  const durationSec = Number(useMetric(FIELD_IDS.MediaDurationSec) || 0);
  const playbackRate = Number(useMetric(FIELD_IDS.MediaPlaybackRate) || 1000);
  const artId = (useMetric(FIELD_IDS.MediaArtId) as string) || '';
  const palette = (useMetric(FIELD_IDS.MediaPalette) as string) || '#7C5CFF,#18181B,#00E599';
  const masterVolume = Number(useMetric(FIELD_IDS.MasterVolumePct) ?? 75);
  const isMuted = Boolean(useMetric(FIELD_IDS.MasterMute));
  const artBaseUrl = useDeckStore((s) => s.artBaseUrl);

  return (
    <NowPlayingLargeWidget
      title={title}
      artist={artist}
      album={album}
      sourceApp={sourceApp}
      isPlaying={isPlaying}
      positionSec={positionSec}
      durationSec={durationSec}
      playbackRate={playbackRate}
      artId={artId}
      palette={palette}
      masterVolume={masterVolume}
      isMuted={isMuted}
      artBaseUrl={artBaseUrl}
      onTogglePlay={() => sendMediaAction('toggle')}
      onNext={() => sendMediaAction('next')}
      onPrev={() => sendMediaAction('prev')}
      onSeek={(pos) => sendMediaSeek(pos)}
      onVolumeChange={(vol) => sendMediaVolume(vol)}
      onToggleMute={() => sendMediaAction('mute')}
      onCycleSource={() => sendMediaAction('cycle_source')}
    />
  );
});
NowPlayingLargeContainer.displayName = 'NowPlayingLargeContainer';

/**
 * Mini Now Playing Container (Compact 1-row)
 */
export const MiniNowPlayingContainer: React.FC = React.memo(() => {
  const isPlaying = Boolean(useMetric(FIELD_IDS.MediaPlaying));
  const title = (useMetric(FIELD_IDS.MediaTitle) as string) || 'No Media';
  const artist = (useMetric(FIELD_IDS.MediaArtist) as string) || '';
  const artId = (useMetric(FIELD_IDS.MediaArtId) as string) || '';
  const artBaseUrl = useDeckStore((s) => s.artBaseUrl);

  return (
    <MiniNowPlayingWidget
      title={title}
      artist={artist}
      isPlaying={isPlaying}
      artId={artId}
      artBaseUrl={artBaseUrl}
      onTogglePlay={() => sendMediaAction('toggle')}
    />
  );
});
MiniNowPlayingContainer.displayName = 'MiniNowPlayingContainer';

/**
 * Vinyl Player Container (33 1/3 rpm turntable with tonearm tracking)
 */
export const VinylPlayerContainer: React.FC = React.memo(() => {
  const isPlaying = Boolean(useMetric(FIELD_IDS.MediaPlaying));
  const title = (useMetric(FIELD_IDS.MediaTitle) as string) || 'No Media';
  const artist = (useMetric(FIELD_IDS.MediaArtist) as string) || '';
  const positionSec = Number(useMetric(FIELD_IDS.MediaPositionSec) || 0);
  const durationSec = Number(useMetric(FIELD_IDS.MediaDurationSec) || 240);
  const artId = (useMetric(FIELD_IDS.MediaArtId) as string) || '';
  const artBaseUrl = useDeckStore((s) => s.artBaseUrl);

  return (
    <VinylPlayerWidget
      title={title}
      artist={artist}
      isPlaying={isPlaying}
      positionSec={positionSec}
      durationSec={durationSec}
      artId={artId}
      artBaseUrl={artBaseUrl}
      onTogglePlay={() => sendMediaAction('toggle')}
    />
  );
});
VinylPlayerContainer.displayName = 'VinylPlayerContainer';

/**
 * Volume Dial & Fader Container
 */
export const VolumeDialContainer: React.FC = React.memo(() => {
  const masterVolume = Number(useMetric(FIELD_IDS.MasterVolumePct) ?? 75);
  const isMuted = Boolean(useMetric(FIELD_IDS.MasterMute));

  return (
    <VolumeDialWidget
      masterVolume={masterVolume}
      isMuted={isMuted}
      onVolumeChange={(vol) => sendMediaVolume(vol)}
      onToggleMute={() => sendMediaAction('mute')}
    />
  );
});
VolumeDialContainer.displayName = 'VolumeDialContainer';

/**
 * Quick Media Source Switcher Container
 */
export const MediaSourceSwitcherContainer: React.FC = React.memo(() => {
  const sourceApp = (useMetric(FIELD_IDS.MediaSourceApp) as string) || 'Spotify';
  const sessionListRaw = useMetric(FIELD_IDS.MediaSessionList);

  let availableSessions = ['Spotify', 'Opera GX', 'Google Chrome', 'VLC Media Player'];
  if (typeof sessionListRaw === 'string') {
    try {
      const parsed = JSON.parse(sessionListRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        availableSessions = parsed;
      }
    } catch {
      // keep fallback
    }
  } else if (Array.isArray(sessionListRaw) && sessionListRaw.length > 0) {
    availableSessions = sessionListRaw as string[];
  }

  return (
    <MediaSourceSwitcherWidget
      sourceApp={sourceApp}
      availableSessions={availableSessions}
      onSelectSource={(source) => sendMediaSource(source)}
    />
  );
});
MediaSourceSwitcherContainer.displayName = 'MediaSourceSwitcherContainer';

/**
 * App Tile Container (Small 2x2 / 3x2)
 */
export const AppTileContainer: React.FC<{ appId: string; defaultName?: string; defaultIcon?: string }> = React.memo(
  ({ appId, defaultName, defaultIcon }) => {
    const raw = useMetric(FIELD_IDS.AppStates);
    let app: AppRuntimeData = {
      id: appId,
      name: defaultName || appId,
      running: false,
      focused: false,
      icon: defaultIcon || 'App',
    };

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed[appId]) {
          app = parsed[appId];
        }
      } catch {}
    }

    return (
      <AppTileWidget
        app={app}
        onAction={(id, act, ql) => sendAppAction(id, act, ql)}
      />
    );
  }
);
AppTileContainer.displayName = 'AppTileContainer';

/**
 * App Card Container (Large 6x3)
 */
export const AppCardContainer: React.FC<{ appId: string; defaultName?: string; defaultIcon?: string }> = React.memo(
  ({ appId, defaultName, defaultIcon }) => {
    const raw = useMetric(FIELD_IDS.AppStates);
    let app: AppRuntimeData = {
      id: appId,
      name: defaultName || (appId === 'vscode' ? 'Visual Studio Code' : appId === 'opera' ? 'Opera GX' : appId),
      running: appId === 'vscode' || appId === 'opera',
      focused: appId === 'vscode',
      project: appId === 'vscode' ? 'PhoneDeck' : undefined,
      file: appId === 'vscode' ? 'App.tsx' : undefined,
      tab_title: appId === 'opera' ? 'YouTube Music' : undefined,
      audio_active: appId === 'opera',
      cpu_pct: appId === 'vscode' ? 1.4 : 2.1,
      ram_bytes: appId === 'vscode' ? 420_000_000 : 650_000_000,
      icon: defaultIcon || (appId === 'vscode' ? 'Code' : appId === 'opera' ? 'Flame' : 'App'),
      quick_launches:
        appId === 'vscode'
          ? [
              { id: 'proj', label: 'PhoneDeck', value: '.' },
              { id: 'new', label: '+ Win', value: '-n' },
            ]
          : [
              { id: 'search', label: 'Google', value: 'https://google.com' },
              { id: 'ytm', label: 'YTM', value: 'https://music.youtube.com' },
            ],
    };

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed[appId]) {
          app = parsed[appId];
        }
      } catch {}
    }

    return (
      <AppCardWidget
        app={app}
        onAction={(id, act, ql) => sendAppAction(id, act, ql)}
      />
    );
  }
);
AppCardContainer.displayName = 'AppCardContainer';

/**
 * App Dock Container (Full-width row)
 */
export const AppDockContainer: React.FC = React.memo(() => {
  const raw = useMetric(FIELD_IDS.AppStates);
  let apps: AppRuntimeData[] = [
    { id: 'vscode', name: 'VS Code', running: true, focused: true, icon: 'Code' },
    { id: 'opera', name: 'Opera GX', running: true, focused: false, icon: 'Flame', audio_active: true },
    { id: 'chrome', name: 'Chrome', running: false, focused: false, icon: 'Globe' },
    { id: 'spotify', name: 'Spotify', running: true, focused: false, icon: 'Music' },
    { id: 'terminal', name: 'Terminal', running: false, focused: false, icon: 'Terminal' },
    { id: 'antigravity', name: 'Antigravity', running: true, focused: false, icon: 'Sparkles' },
  ];

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        apps = Object.values(parsed);
      }
    } catch {}
  }

  return (
    <AppDockWidget
      apps={apps}
      sortRunningFirst={true}
      onAction={(id, act, ql) => sendAppAction(id, act, ql)}
    />
  );
});
AppDockContainer.displayName = 'AppDockContainer';
