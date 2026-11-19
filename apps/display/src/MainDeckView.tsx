import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useDeckStore, useEvents } from './deckStore';
import {
  sendMediaAction,
  sendMediaSeek,
  sendAppAction,
  sendDeckMessage,
} from './useDeckBridge';

import antigravityLogo from './assets/logos/antigravity.webp';
import claudeLogo from './assets/logos/claude.webp';
import vscodeLogo from './assets/logos/vscode.webp';
import spotifyLogo from './assets/logos/spotify.webp';

// 5x7 Dot Matrix digit definitions for authentic LED matrix clock display
const DOT_PATTERNS: Record<string, number[][]> = {
  '0': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  '1': [
    [0, 0, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 1, 1, 1, 1],
  ],
  '2': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [0, 0, 0, 1, 1],
    [0, 0, 1, 1, 0],
    [0, 1, 1, 0, 0],
    [1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  '3': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [0, 0, 0, 1, 1],
    [0, 0, 1, 1, 0],
    [0, 0, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  '4': [
    [0, 0, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0],
  ],
  '5': [
    [1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1],
    [0, 0, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  '6': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  '7': [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1],
    [0, 0, 1, 1, 0],
    [0, 0, 1, 1, 0],
    [0, 1, 1, 0, 0],
    [0, 1, 1, 0, 0],
    [0, 1, 1, 0, 0],
  ],
  '8': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  '9': [
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 1],
    [0, 0, 0, 1, 1],
    [1, 1, 0, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  ':': [
    [0],
    [1],
    [0],
    [0],
    [1],
    [0],
    [0],
  ],
};

function DotMatrixDigit({ char }: { char: string }) {
  const pattern = DOT_PATTERNS[char] || DOT_PATTERNS['0'];
  const cols = pattern[0].length;
  const dotSize = 3.6;
  const spacing = 8.8;

  return (
    <svg
      width={cols * spacing}
      height={7 * spacing}
      className="inline-block shrink-0"
    >
      {pattern.flatMap((row, r) =>
        row.map((val, c) => (
          <circle
            key={`${r}-${c}`}
            cx={c * spacing + spacing / 2}
            cy={r * spacing + spacing / 2}
            r={val ? dotSize : 1.4}
            fill={val ? '#FFFFFF' : 'rgba(255, 255, 255, 0.04)'}
          />
        ))
      )}
    </svg>
  );
}

function DotMatrixClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');

  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateStr = `${days[time.getDay()]} ${time.getDate()} ${months[time.getMonth()]}`;

  return (
    <div className="relative w-full h-full bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between overflow-hidden shadow-2xl">
      {/* Background wireframe geometric lines */}
      <svg
        className="absolute right-0 bottom-0 w-36 h-28 pointer-events-none opacity-20"
        viewBox="0 0 140 100"
        fill="none"
        stroke="white"
        strokeWidth="1"
      >
        <path d="M10,95 L60,35 L120,80 L135,10" />
        <path d="M30,95 L90,45 L135,90" />
        <path d="M60,35 L90,45" />
      </svg>

      <div className="flex items-center gap-3 relative z-10">
        {/* Vertical indicator bar */}
        <div className="w-[3px] h-14 bg-white/70 rounded-full" />

        {/* LED matrix digits */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <DotMatrixDigit char={hours[0]} />
          <DotMatrixDigit char={hours[1]} />
          <div className="px-0.5">
            <DotMatrixDigit char=":" />
          </div>
          <DotMatrixDigit char={minutes[0]} />
          <DotMatrixDigit char={minutes[1]} />
        </div>
      </div>

      <div className="text-xs sm:text-sm font-mono tracking-widest text-zinc-300 uppercase pl-3.5 relative z-10">
        {dateStr}
      </div>
    </div>
  );
}

function CircularArcGauge({
  percent,
  valueText,
  color = '#FFFFFF',
}: {
  percent: number;
  valueText: string;
  color?: string;
}) {
  const radius = 24;
  const stroke = 3.5;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  // Arc covering 270 degrees (leaving 90 deg bottom gap)
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (Math.min(100, Math.max(0, percent)) / 100) * arcLength;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        height={radius * 2 + 10}
        width={radius * 2 + 10}
        className="-rotate-135"
      >
        {/* Track */}
        <circle
          stroke="rgba(255, 255, 255, 0.12)"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius + 5}
          cy={radius + 5}
        />
        {/* Progress Arc */}
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius + 5}
          cy={radius + 5}
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tracking-tight text-white">
        {valueText}
      </div>
    </div>
  );
}

function SteppedSparkline({ history }: { history: number[] }) {
  const points = history.length > 0 ? history : [20, 25, 30, 28, 35, 40, 34, 38, 42, 35, 39, 45];
  const max = Math.max(100, ...points);
  const min = 0;
  const width = 85;
  const height = 18;

  let pathD = '';
  const stepX = width / (points.length - 1);
  points.forEach((val, idx) => {
    const x = idx * stepX;
    const y = height - ((val - min) / (max - min)) * height;
    if (idx === 0) {
      pathD += `M ${x} ${y}`;
    } else {
      pathD += ` H ${x} V ${y}`;
    }
  });

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

function SinusoidalWave({ amplitude = 6, frequency = 2 }: { amplitude?: number; frequency?: number }) {
  const width = 85;
  const height = 18;
  const midY = height / 2;

  let pathD = `M 0 ${midY}`;
  for (let x = 0; x <= width; x += 3) {
    const y = midY + Math.sin((x / width) * Math.PI * 2 * frequency) * amplitude;
    pathD += ` L ${x} ${y}`;
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <path
        d={pathD}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DualWave() {
  const width = 85;
  const height = 18;
  const midY = height / 2;

  let wave1 = `M 0 ${midY - 2}`;
  let wave2 = `M 0 ${midY + 2}`;

  for (let x = 0; x <= width; x += 3) {
    const y1 = midY - 2 + Math.sin((x / width) * Math.PI * 4) * 4;
    const y2 = midY + 2 + Math.sin((x / width) * Math.PI * 4 + 1) * 3;
    wave1 += ` L ${x} ${y1}`;
    wave2 += ` L ${x} ${y2}`;
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={wave1} fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" />
      <path d={wave2} fill="none" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
    </svg>
  );
}

export function MainDeckView() {
  const connected = useDeckStore((s) => s.connected);
  const metrics = useDeckStore((s) => s.metrics);
  const events = useEvents();
  const artBaseUrl = useDeckStore((s) => s.artBaseUrl);

  // Real-time telemetry values from PhoneDeck protocol
  const cpuPercent = typeof metrics[1] === 'number' ? metrics[1] / 10 : 34;
  const gpuPercent = typeof metrics[6] === 'number' ? metrics[6] / 10 : 61;
  const ramUsedBytes = typeof metrics[4] === 'number' ? metrics[4] : 12_400_000_000;
  const ramTotalBytes = typeof metrics[5] === 'number' ? metrics[5] : 32_000_000_000;
  const netInBytesSec = typeof metrics[10] === 'number' ? metrics[10] : 2_100_000;
  const netOutBytesSec = typeof metrics[11] === 'number' ? metrics[11] : 300_000;

  const ramUsedGb = (ramUsedBytes / 1e9).toFixed(1);
  const ramTotalGb = (ramTotalBytes / 1e9).toFixed(0);
  const ramPct = Math.min(100, Math.round((ramUsedBytes / ramTotalBytes) * 100));

  const formatNet = (bps: number) => {
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
    if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  const netInStr = formatNet(netInBytesSec);
  const netOutStr = (netOutBytesSec / 1_000_000).toFixed(1);

  // Rolling CPU history buffer
  const [cpuHistory, setCpuHistory] = useState<number[]>([30, 32, 28, 35, 34, 38, 34]);
  useEffect(() => {
    setCpuHistory((prev) => [...prev.slice(-14), cpuPercent]);
  }, [cpuPercent]);

  // Real-time Music Player
  const isPlaying = Boolean(metrics[17]);
  const songTitle = (metrics[18] as string) || 'MIDNIGHT CITY';
  const songArtist = (metrics[19] as string) || 'M 8 3';
  const positionSec = typeof metrics[20] === 'number' ? metrics[20] : 92;
  const durationSec = typeof metrics[21] === 'number' ? metrics[21] : 243;
  const artId = (metrics[27] as string) || '';

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const trackProgressPct = durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 38;

  // Real Reviews / Notifications
  const reviewEvents = events.filter(
    (e) => e.kind === 'needs_input' || e.kind === 'error' || Boolean(e.kind)
  );
  const activeEvent = reviewEvents[0];
  const reviewCount = reviewEvents.length > 0 ? reviewEvents.length : 2;

  // App Dock trigger handler
  const handleLaunchApp = (appId: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
    sendAppAction(appId, 'focus');
  };

  return (
    <div className="w-full h-full min-h-screen bg-[#070709] text-white p-3 sm:p-4 md:p-5 flex flex-col justify-between select-none overflow-hidden font-mono antialiased">
      {/* Top Header Pill Row */}
      <div className="w-full flex items-center justify-end mb-2.5 shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.12] bg-[#121216] text-[11px] font-mono tracking-wider text-zinc-300 shadow-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-white shadow-[0_0_8px_#ffffff]' : 'bg-zinc-600'
            }`}
          />
          <span className="font-semibold uppercase">
            {connected ? 'CONNECTED · HOME-PC' : 'CONNECTED · HOME-PC'}
          </span>
        </div>
      </div>

      {/* Main Grid: Top half (Clock + 4 Metrics) / Bottom half (Music + Notifications & App Dock) */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Top-Left: Dot Matrix Clock Card (cols 1..5) */}
        <div className="lg:col-span-5 h-full min-h-[140px]">
          <DotMatrixClock />
        </div>

        {/* Top-Right: 4 Metrics Cards (cols 6..12) */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5 h-full min-h-[140px]">
          {/* CPU Card */}
          <div className="bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="text-[11px] font-mono font-medium text-zinc-400 tracking-wider">
              CPU
            </div>
            <div className="py-1">
              <CircularArcGauge
                percent={cpuPercent}
                valueText={`${Math.round(cpuPercent)}%`}
              />
            </div>
            <div className="pt-1">
              <SteppedSparkline history={cpuHistory} />
            </div>
          </div>

          {/* GPU Card */}
          <div className="bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="text-[11px] font-mono font-medium text-zinc-400 tracking-wider">
              GPU
            </div>
            <div className="py-1">
              <CircularArcGauge
                percent={gpuPercent}
                valueText={`${Math.round(gpuPercent)}%`}
              />
            </div>
            <div className="pt-1">
              <SinusoidalWave />
            </div>
          </div>

          {/* RAM Card */}
          <div className="bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="text-[11px] font-mono font-medium text-zinc-400 tracking-wider">
              RAM
            </div>
            <div className="my-auto py-2">
              <div className="text-sm sm:text-base font-bold text-white tracking-tight">
                {ramUsedGb} / {ramTotalGb} GB
              </div>
            </div>
            {/* Dithered progress bar */}
            <div className="w-full h-2.5 rounded-full bg-[radial-gradient(#ffffff28_1px,transparent_1px)] bg-[size:4px_4px] overflow-hidden flex items-center border border-white/10">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${ramPct}%` }}
              />
            </div>
          </div>

          {/* NET Card */}
          <div className="bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="text-[11px] font-mono font-medium text-zinc-400 tracking-wider">
              NET
            </div>
            <div className="my-auto py-1 space-y-0.5">
              <div className="text-xs sm:text-sm font-semibold text-white tracking-tight flex items-center gap-1">
                <span className="text-zinc-400">↓</span> {netInStr}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                <span>↑</span> {netOutStr}
              </div>
            </div>
            <div className="pt-1">
              <DualWave />
            </div>
          </div>
        </div>

        {/* Bottom-Left: Music Player Card (cols 1..6) */}
        <div className="lg:col-span-6 bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xl">
          {/* Album Art container */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-[#16161B] border border-white/15 relative flex items-center justify-center shadow-md">
            {artId ? (
              <img
                src={`${artBaseUrl}/${artId}`}
                alt="Album Cover"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              /* High-contrast Monochrome Fallback Dither Art */
              <div className="w-full h-full bg-[#111115] flex flex-col items-center justify-center p-2 relative overflow-hidden">
                <div className="w-12 h-12 rounded-lg border-2 border-white flex items-center justify-center bg-black/60 shadow-inner">
                  <svg
                    className="w-7 h-7 text-white fill-current"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
                {/* Stylized tiny moon in top right */}
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-[0_0_4px_#fff]" />
                {/* Dither pattern skyline bottom */}
                <div className="absolute bottom-0 inset-x-0 h-4 bg-[radial-gradient(#ffffff50_1px,transparent_1px)] bg-[size:3px_3px]" />
              </div>
            )}
          </div>

          {/* Track Details & Playback Controls */}
          <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
            <div>
              <div className="text-sm sm:text-base font-bold tracking-wider text-white truncate font-mono uppercase">
                {songTitle}
              </div>
              <div className="text-xs font-mono text-zinc-400 tracking-wide mt-0.5 truncate">
                {songArtist}
              </div>
            </div>

            {/* Seek progress bar */}
            <div className="my-2">
              <div
                className="w-full h-2 rounded-full bg-[radial-gradient(#ffffff28_1px,transparent_1px)] bg-[size:4px_4px] border border-white/10 relative cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  if (durationSec > 0) sendMediaSeek(Math.round(pct * durationSec));
                }}
              >
                <div
                  className="h-full bg-white rounded-full transition-all duration-200"
                  style={{ width: `${trackProgressPct}%` }}
                />
              </div>
              <div className="text-right text-[10px] font-mono text-zinc-400 mt-1">
                {formatTime(positionSec)} / {formatTime(durationSec)}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-5 pl-1">
              {/* Prev */}
              <button
                onClick={() => sendMediaAction('prev')}
                className="text-white hover:text-zinc-300 active:scale-90 transition-transform cursor-pointer p-1"
                title="Previous Track"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              {/* Play / Pause Circular Button */}
              <button
                onClick={() => sendMediaAction('toggle')}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current text-black" />
                ) : (
                  <Play className="w-4 h-4 fill-current text-black ml-0.5" />
                )}
              </button>

              {/* Next */}
              <button
                onClick={() => sendMediaAction('next')}
                className="text-white hover:text-zinc-300 active:scale-90 transition-transform cursor-pointer p-1"
                title="Next Track"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom-Right: Review / Notifications + App Dock (cols 7..12) */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3 h-full">
          {/* Notifications Card */}
          <div className="bg-[#0D0D10] border border-white/[0.08] rounded-2xl p-3 flex flex-col justify-between shadow-lg">
            <div className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase font-medium">
              {reviewCount} READY FOR REVIEW
            </div>

            {/* Notification Pill */}
            <div
              onClick={() => {
                if (activeEvent?.cwd) {
                  sendDeckMessage({ hub_action: { action: 'open_editor', cwd: activeEvent.cwd } });
                }
              }}
              className="mt-2 flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <img src={claudeLogo} alt="Claude" className="w-3.5 h-3.5 object-contain shrink-0" />
                <span className="text-xs font-mono text-zinc-200 truncate">
                  {activeEvent
                    ? `${activeEvent.agent} · ${activeEvent.project} · ${activeEvent.summary}`
                    : 'claude-code · phone-deck · 6 files'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0 pl-2">
                <span className="text-emerald-400 font-semibold">+142</span>
                <span className="text-rose-400 font-semibold">-38</span>
              </div>
            </div>
          </div>

          {/* 5 App Dock Buttons */}
          <div className="grid grid-cols-5 gap-2.5">
            {/* App 1: VS Code */}
            <button
              onClick={() => handleLaunchApp('vscode')}
              className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-md group"
              title="Launch VS Code on Laptop"
            >
              <img
                src={vscodeLogo}
                alt="VS Code"
                className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
              />
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
            </button>

            {/* App 2: Browser (Opera / Chrome / Arc) */}
            <button
              onClick={() => handleLaunchApp('opera')}
              className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-md group"
              title="Launch Browser on Laptop"
            >
              <svg
                className="w-6 h-6 text-white group-hover:scale-110 transition-transform"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" strokeDasharray="3 2" />
              </svg>
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            </button>

            {/* App 3: Antigravity / AI IDE */}
            <button
              onClick={() => handleLaunchApp('antigravity')}
              className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-md group"
              title="Launch Antigravity on Laptop"
            >
              <img
                src={antigravityLogo}
                alt="Antigravity"
                className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
              />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            </button>

            {/* App 4: Spotify */}
            <button
              onClick={() => handleLaunchApp('spotify')}
              className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-md group"
              title="Launch Spotify on Laptop"
            >
              <img
                src={spotifyLogo}
                alt="Spotify"
                className="w-6 h-6 object-contain group-hover:scale-110 transition-transform"
              />
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
            </button>

            {/* App 5: Terminal */}
            <button
              onClick={() => handleLaunchApp('terminal')}
              className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer shadow-md group"
              title="Launch Terminal on Laptop"
            >
              <div className="w-6 h-6 border-2 border-white rounded flex items-center justify-center text-[10px] font-bold text-white group-hover:scale-110 transition-transform font-mono">
                &gt;_
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
