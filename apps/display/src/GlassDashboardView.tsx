import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { useDeckStore, useEvents } from './deckStore';
import { sendMediaAction } from './useDeckBridge';

interface GlassDashboardViewProps {
  onOpenOverview?: () => void;
  onOpenPairing?: () => void;
  connected?: boolean;
  hostName?: string;
}

export const GlassDashboardView: React.FC<GlassDashboardViewProps> = ({
  onOpenOverview,
  onOpenPairing,
  connected = true,
  hostName = 'HOME-PC',
}) => {
  const metrics = useDeckStore((s) => s.metrics);
  const events = useEvents();

  // Local Clock & Date (Real-time updates)
  const [timeStr, setTimeStr] = useState('21:47');
  const [dateStr, setDateStr] = useState('WED 18 NOV');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hours}:${minutes}`);

      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = [
        'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
        'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
      ];
      const dayName = days[now.getDay()];
      const dayNum = String(now.getDate()).padStart(2, '0');
      const monthName = months[now.getMonth()];
      setDateStr(`${dayName} ${dayNum} ${monthName}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry metrics
  const cpuPercent = typeof metrics[1] === 'number' ? metrics[1] / 10 : 34;
  const gpuPercent = typeof metrics[6] === 'number' ? metrics[6] / 10 : 61;
  const ramUsedBytes = typeof metrics[4] === 'number' ? metrics[4] : 13_314_398_617; // ~12.4 GB
  const ramTotalBytes = typeof metrics[5] === 'number' ? metrics[5] : 34_359_738_368; // 32 GB
  const netIn = typeof metrics[10] === 'number' ? metrics[10] : 2_202_009; // ~2.1 MB/s
  const netOut = typeof metrics[11] === 'number' ? metrics[11] : 314_572; // ~0.3 MB/s

  const ramUsedGb = (ramUsedBytes / (1024 * 1024 * 1024)).toFixed(1);
  const ramTotalGb = Math.round(ramTotalBytes / (1024 * 1024 * 1024));
  const ramPercent = Math.min(100, Math.max(0, (ramUsedBytes / (ramTotalBytes || 1)) * 100));

  const formatNetRate = (bytesPerSec: number): string => {
    if (bytesPerSec >= 1_048_576) {
      return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
    }
    if (bytesPerSec >= 1024) {
      return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    }
    return `${Math.round(bytesPerSec)} B/s`;
  };

  const netInFormatted = formatNetRate(netIn);
  const netOutFormatted = (netOut / 1_048_576).toFixed(1);

  // Media Player State
  const isPlaying = metrics[17] === true || metrics[24] === 'playing';
  const mediaTitle = (metrics[18] as string) || 'Midnight City';
  const mediaArtist = (metrics[19] as string) || 'M 8 3';
  const positionSec = typeof metrics[20] === 'number' ? metrics[20] : 92; // 1:32
  const durationSec = typeof metrics[21] === 'number' ? metrics[21] : 243; // 4:03

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const mediaProgressPct = Math.min(
    100,
    Math.max(0, (positionSec / (durationSec || 1)) * 100)
  );

  // AI Review card state
  const activeEvent = events.find((e) => e.kind === 'done' || e.kind === 'approval') || events[0];
  const reviewCount = events.length > 0 ? events.length : 2;
  const reviewProject = activeEvent?.project || 'phone-deck';
  const reviewAgent = activeEvent?.agent || 'claude-code';
  const filesChanged = activeEvent?.stats?.files_changed ?? 6;
  const insertions = activeEvent?.stats?.insertions ?? 142;
  const deletions = activeEvent?.stats?.deletions ?? 38;

  // App quick launches
  const [activeApp, setActiveApp] = useState<string>('vscode');

  return (
    <div className="w-full h-full flex flex-col justify-between p-3 md:p-4 select-none">
      {/* Top Header Pill Bar */}
      <div className="w-full flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center space-x-2">
          {/* Subtle Overview / Page Indicator */}
          {onOpenOverview && (
            <button
              onClick={onOpenOverview}
              className="px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.15] backdrop-blur-md border border-white/[0.14] text-[10px] tracking-wider uppercase text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Overview & Pages"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#B07BFF]" />
              <span>DECK</span>
            </button>
          )}
        </div>

        {/* Top-Right Frosted Status Pill */}
        <button
          onClick={onOpenPairing}
          className="px-3.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.18] flex items-center space-x-2 text-[11px] font-mono tracking-widest text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all cursor-pointer"
        >
          <div
            className={`w-2 h-2 rounded-full ${
              connected
                ? 'bg-[#B07BFF] shadow-[0_0_8px_#B07BFF]'
                : 'bg-amber-400 shadow-[0_0_8px_#F59E0B]'
            }`}
          />
          <span className="font-semibold uppercase">
            {connected ? `CONNECTED · ${hostName}` : 'CONNECTING · PC'}
          </span>
        </button>
      </div>

      {/* Main 2-Row Grid Viewport */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0 items-stretch">
        {/* ROW 1: Left Sunset Clock (col 1..4) + 4 Metrics (cols 5..12) */}
        
        {/* Card 1: Sunset Mountain Vista Clock Card */}
        <div className="col-span-12 lg:col-span-4 h-full min-h-[140px] rounded-2xl border border-white/[0.2] overflow-hidden relative shadow-[0_8px_32px_rgba(0,0,0,0.3)] bg-gradient-to-br from-[#4b3c66] to-[#7a5784] flex items-center">
          {/* Sunset Mountain Background with Hot Air Balloon */}
          <img
            src="/clock-card-bg.png"
            alt="Sunset Horizon"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            onError={(e) => {
              // Graceful fallback gradient if image loading fails
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />

          {/* Left Content: Glowing Vertical Bar + Crisp Digits + Date */}
          <div className="relative z-10 flex items-center h-full px-5 py-3">
            {/* Glowing Neon Lavender Vertical Accent Bar */}
            <div className="w-1.5 h-12 md:h-14 bg-[#B07BFF] rounded-full shadow-[0_0_12px_#B07BFF] mr-3.5 shrink-0" />

            <div className="flex flex-col justify-center">
              <span className="text-4xl md:text-5xl font-light text-white tracking-normal font-sans leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                {timeStr}
              </span>
              <span className="tracking-[0.25em] text-[11px] md:text-xs font-semibold text-white/95 uppercase mt-1.5 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Metric Cards (cols 5..12: each takes 2 cols) */}
        <div className="col-span-12 lg:col-span-8 grid grid-cols-4 gap-3 h-full">
          {/* Metric 1: CPU Card */}
          <div className="h-full rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.25)] relative overflow-hidden">
            <span className="text-zinc-300 font-mono text-[11px] uppercase font-bold tracking-wider">
              CPU
            </span>

            <div className="flex items-center space-x-2.5 my-auto">
              {/* Circular Gauge */}
              <div className="relative w-10 h-10 md:w-11 md:h-11 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/10"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    stroke="#B07BFF"
                    strokeWidth="3.5"
                    strokeDasharray={`${cpuPercent}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(176,123,255,0.8))' }}
                  />
                </svg>
              </div>

              <span className="text-xl md:text-2xl font-bold text-white font-sans tracking-tight">
                {Math.round(cpuPercent)}%
              </span>
            </div>

            {/* Sine Wave Sparkline */}
            <div className="w-full h-5 relative overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                <path
                  d="M0 10 Q 15 2, 30 10 T 60 10 T 90 10 T 100 10"
                  fill="none"
                  stroke="#B07BFF"
                  strokeWidth="2"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(176,123,255,0.7))' }}
                />
              </svg>
            </div>
          </div>

          {/* Metric 2: GPU Card */}
          <div className="h-full rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.25)] relative overflow-hidden">
            <span className="text-zinc-300 font-mono text-[11px] uppercase font-bold tracking-wider">
              GPU
            </span>

            <div className="flex items-center space-x-2.5 my-auto">
              {/* Circular Gauge */}
              <div className="relative w-10 h-10 md:w-11 md:h-11 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/10"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    stroke="#B07BFF"
                    strokeWidth="3.5"
                    strokeDasharray={`${gpuPercent}, 100`}
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(176,123,255,0.8))' }}
                  />
                </svg>
              </div>

              <span className="text-xl md:text-2xl font-bold text-white font-sans tracking-tight">
                {Math.round(gpuPercent)}%
              </span>
            </div>

            {/* Sine Wave Sparkline */}
            <div className="w-full h-5 relative overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                <path
                  d="M0 10 Q 15 16, 30 10 T 60 10 T 85 8 T 100 10"
                  fill="none"
                  stroke="#B07BFF"
                  strokeWidth="2"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(176,123,255,0.7))' }}
                />
              </svg>
            </div>
          </div>

          {/* Metric 3: RAM Card */}
          <div className="h-full rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.25)] relative overflow-hidden">
            <span className="text-zinc-300 font-mono text-[11px] uppercase font-bold tracking-wider">
              RAM
            </span>

            <div className="my-auto">
              <span className="text-base md:text-lg font-bold text-white font-sans tracking-tight whitespace-nowrap">
                {ramUsedGb} / {ramTotalGb} GB
              </span>
            </div>

            {/* Horizontal Capsule Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-white/[0.12] overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-[#B07BFF] transition-all duration-300"
                style={{
                  width: `${ramPercent}%`,
                  boxShadow: '0 0 8px rgba(176,123,255,0.8)',
                }}
              />
            </div>
          </div>

          {/* Metric 4: NET Card */}
          <div className="h-full rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 flex flex-col justify-between shadow-[0_8px_24px_rgba(0,0,0,0.25)] relative overflow-hidden">
            <span className="text-zinc-300 font-mono text-[11px] uppercase font-bold tracking-wider">
              NET
            </span>

            <div className="my-auto">
              <span className="text-xs md:text-sm font-semibold text-white font-sans whitespace-nowrap">
                ↓ {netInFormatted} &nbsp;↑ {netOutFormatted}
              </span>
            </div>

            {/* Sine Wave Sparkline */}
            <div className="w-full h-5 relative overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none">
                <path
                  d="M0 10 Q 12 4, 25 10 T 50 10 T 75 6 T 100 10"
                  fill="none"
                  stroke="#B07BFF"
                  strokeWidth="2"
                  style={{ filter: 'drop-shadow(0 0 4px rgba(176,123,255,0.7))' }}
                />
              </svg>
            </div>
          </div>
        </div>

        {/* ROW 2: Bottom Row: Left Now Playing Card (col 1..6) + Right AI Review & App Dock (col 7..12) */}

        {/* Left Bottom: Now Playing / Media Card */}
        <div className="col-span-12 lg:col-span-6 h-full min-h-[140px] rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 md:p-3.5 flex items-center space-x-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.25)] relative overflow-hidden">
          {/* Album Art Thumbnail */}
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden border border-white/15 shrink-0 shadow-md relative bg-purple-900/40">
            <img
              src="/album-art-crop.png"
              alt="Album Artwork"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* Track Details & Playback Controls */}
          <div className="flex-1 flex flex-col justify-between h-full py-0.5 min-w-0">
            <div>
              <h3 className="text-base md:text-lg font-bold text-white truncate font-sans tracking-tight">
                {mediaTitle}
              </h3>
              <p className="text-xs md:text-sm text-zinc-300 truncate font-sans">
                {mediaArtist}
              </p>
            </div>

            {/* Horizontal Capsule Progress Bar with Timestamp */}
            <div className="flex items-center space-x-2.5 my-1.5">
              <div className="flex-1 h-2 rounded-full bg-white/[0.12] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-[#B07BFF] transition-all duration-300"
                  style={{
                    width: `${mediaProgressPct}%`,
                    boxShadow: '0 0 8px rgba(176,123,255,0.8)',
                  }}
                />
              </div>
              <span className="text-[11px] font-mono text-zinc-300 shrink-0">
                {formatTime(positionSec)} / {formatTime(durationSec)}
              </span>
            </div>

            {/* Controls: Prev, Glowing Round Play/Pause, Next */}
            <div className="flex items-center space-x-6">
              <button
                onClick={() => sendMediaAction('prev')}
                className="text-zinc-300 hover:text-white transition-colors cursor-pointer p-1"
                title="Previous Track"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => sendMediaAction('toggle')}
                className="w-8 h-8 rounded-full bg-[#B07BFF] hover:bg-[#a068f5] text-white flex items-center justify-center shadow-[0_0_14px_rgba(176,123,255,0.7)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={() => sendMediaAction('next')}
                className="text-zinc-300 hover:text-white transition-colors cursor-pointer p-1"
                title="Next Track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Bottom: AI Review Card (top) + 5-App Dock (bottom) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col justify-between h-full space-y-2.5">
          {/* AI Review Card */}
          <div className="rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex flex-col justify-between flex-1">
            <span className="text-zinc-300 font-mono text-[10px] md:text-[11px] uppercase tracking-[0.2em] font-semibold">
              {reviewCount} READY FOR REVIEW
            </span>

            {/* Darker Inner Frosted Pill */}
            <div className="mt-1.5 rounded-xl bg-black/30 border border-white/10 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-2 truncate">
                <Sparkles className="w-3.5 h-3.5 text-[#B07BFF] shrink-0" />
                <span className="text-xs md:text-sm text-white/95 font-medium truncate font-sans">
                  {reviewAgent} · {reviewProject} · {filesChanged} files
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0 ml-2 font-mono text-xs md:text-sm">
                <span className="text-[#B07BFF] font-semibold">
                  +{insertions}
                </span>
                <span className="text-zinc-400 font-semibold">
                  -{deletions}
                </span>
              </div>
            </div>
          </div>

          {/* 5-App Dock Row */}
          <div className="grid grid-cols-5 gap-2 shrink-0">
            {/* App 1: VS Code */}
            <button
              onClick={() => setActiveApp('vscode')}
              className={`h-14 md:h-16 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.15] flex flex-col items-center justify-center relative transition-all cursor-pointer shadow-sm group ${
                activeApp === 'vscode' ? 'border-[#B07BFF]/50 bg-white/[0.12]' : ''
              }`}
              title="Visual Studio Code"
            >
              <svg className="w-6 h-6 md:w-7 md:h-7" viewBox="0 0 24 24" fill="none">
                <path
                  d="M17.5 2.5L7 11.5L2 7.5L0 9L4.5 12.5L0 16L2 17.5L7 13.5L17.5 22.5L24 19.5V5.5L17.5 2.5Z"
                  fill="#007ACC"
                />
                <path
                  d="M17.5 7.5L9.5 13.5L17.5 19.5V7.5Z"
                  fill="#0065A9"
                />
              </svg>
              {/* Purple glowing active dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-[#B07BFF] shadow-[0_0_6px_#B07BFF] absolute bottom-1.5" />
            </button>

            {/* App 2: Opera GX */}
            <button
              onClick={() => setActiveApp('opera')}
              className={`h-14 md:h-16 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.15] flex flex-col items-center justify-center relative transition-all cursor-pointer shadow-sm group ${
                activeApp === 'opera' ? 'border-[#B07BFF]/50 bg-white/[0.12]' : ''
              }`}
              title="Opera GX Browser"
            >
              <div className="w-6 h-6 md:w-7 md:h-7 rounded-full border-2 border-[#FF1B44] flex items-center justify-center p-0.5">
                <div className="w-full h-full rounded-full border border-[#FF6680]" />
              </div>
              {/* Gray dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 absolute bottom-1.5" />
            </button>

            {/* App 3: Antigravity */}
            <button
              onClick={() => setActiveApp('antigravity')}
              className={`h-14 md:h-16 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.15] flex flex-col items-center justify-center relative transition-all cursor-pointer shadow-sm group ${
                activeApp === 'antigravity' ? 'border-[#B07BFF]/50 bg-white/[0.12]' : ''
              }`}
              title="Antigravity Agent"
            >
              <svg className="w-6 h-6 md:w-7 md:h-7" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 20H8L12 11L16 20H22L12 2Z"
                  fill="url(#anti-grad)"
                />
                <defs>
                  <linearGradient id="anti-grad" x1="2" y1="2" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#B07BFF" />
                    <stop offset="1" stopColor="#7C5CFF" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Gray dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 absolute bottom-1.5" />
            </button>

            {/* App 4: Spotify */}
            <button
              onClick={() => setActiveApp('spotify')}
              className={`h-14 md:h-16 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.15] flex flex-col items-center justify-center relative transition-all cursor-pointer shadow-sm group ${
                activeApp === 'spotify' ? 'border-[#B07BFF]/50 bg-white/[0.12]' : ''
              }`}
              title="Spotify"
            >
              <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#1DB954] flex items-center justify-center p-1">
                <svg viewBox="0 0 24 24" fill="black" className="w-full h-full">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.503 17.31c-.217.356-.677.469-1.033.252-2.83-1.73-6.393-2.12-10.59-1.163-.404.092-.81-.161-.902-.566-.092-.404.161-.81.566-.902 4.601-1.052 8.54-.607 11.706 1.346.356.217.469.677.253 1.033zm1.47-3.266c-.273.444-.855.586-1.299.313-3.24-1.993-8.18-2.569-12.012-1.405-.499.151-1.03-.131-1.181-.63-.151-.499.131-1.03.63-1.181 4.38-1.33 9.816-.689 13.549 1.604.444.273.586.855.313 1.299zm.126-3.41c-3.886-2.308-10.298-2.52-14.01-1.393-.597.181-1.229-.161-1.41-.758-.181-.597.161-1.229.758-1.41 4.269-1.296 11.348-1.047 15.828 1.613.537.319.714 1.014.395 1.551-.319.537-1.014.714-1.551.395l-.01.002z" />
                </svg>
              </div>
              {/* Purple glowing active dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-[#B07BFF] shadow-[0_0_6px_#B07BFF] absolute bottom-1.5" />
            </button>

            {/* App 5: Terminal */}
            <button
              onClick={() => setActiveApp('terminal')}
              className={`h-14 md:h-16 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] backdrop-blur-xl border border-white/[0.15] flex flex-col items-center justify-center relative transition-all cursor-pointer shadow-sm group ${
                activeApp === 'terminal' ? 'border-[#B07BFF]/50 bg-white/[0.12]' : ''
              }`}
              title="Terminal Shell"
            >
              <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center font-mono text-[10px] text-zinc-200 font-bold">
                {'>_'}
              </div>
              {/* Purple glowing active dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-[#B07BFF] shadow-[0_0_6px_#B07BFF] absolute bottom-1.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
