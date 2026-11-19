import React, { useState, useEffect } from 'react';
import { useDeckStore } from './deckStore';
import { sendMediaAction } from './useDeckBridge';

interface GlassDashboardViewProps {
  onOpenOverview?: () => void;
  onOpenPairing?: () => void;
  connected?: boolean;
  hostName?: string;
}

export const GlassDashboardView: React.FC<GlassDashboardViewProps> = ({
  onOpenPairing,
  connected = true,
  hostName = 'HOME-PC',
}) => {
  const metrics = useDeckStore((s) => s.metrics);

  // Live Time & Date
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

  // Telemetry metrics (with defaults from reference image)
  const cpuPercent = typeof metrics[1] === 'number' ? Math.round(metrics[1] / 10) : 34;
  const gpuPercent = typeof metrics[6] === 'number' ? Math.round(metrics[6] / 10) : 61;
  const ramUsedBytes = typeof metrics[4] === 'number' ? metrics[4] : 13_314_398_617;
  const ramTotalBytes = typeof metrics[5] === 'number' ? metrics[5] : 34_359_738_368;
  const netIn = typeof metrics[10] === 'number' ? metrics[10] : 2_202_009;
  const netOut = typeof metrics[11] === 'number' ? metrics[11] : 314_572;

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
  const positionSec = typeof metrics[20] === 'number' ? metrics[20] : 92;
  const durationSec = typeof metrics[21] === 'number' ? metrics[21] : 243;

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const mediaProgressPct = Math.min(
    100,
    Math.max(0, (positionSec / (durationSec || 1)) * 100)
  );

  const [activeApp, setActiveApp] = useState<string>('vscode');

  return (
    <div className="w-full h-full bg-[#121217] flex items-center justify-center overflow-hidden relative select-none">
      {/* 1024x460 Pixel-Perfect Canvas Surface */}
      <div className="relative w-full h-full max-w-[1024px] max-h-[460px] aspect-[1024/460] overflow-hidden">
        {/* Base UI Image: 100% Pixel-Perfect Reference Design */}
        <img
          src="/ui-reference.jpg"
          alt="Phone Deck UI"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none z-0"
        />

        {/* 1. Top Right Pill Interactive Hotspot (CONNECTED · HOME-PC) */}
        <button
          onClick={onOpenPairing}
          className="absolute z-20 cursor-pointer rounded-full hover:bg-white/[0.08] active:scale-95 transition-all flex items-center px-4"
          style={{
            left: '73.44%',
            top: '5.65%',
            width: '23.63%',
            height: '6.96%',
          }}
          title="Click to view Connection / Pairing details"
        >
          {/* Live text overlay in case host name or status changed */}
          <div className="w-full h-full flex items-center justify-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                connected
                  ? 'bg-[#B07BFF] shadow-[0_0_8px_#B07BFF]'
                  : 'bg-amber-400 shadow-[0_0_8px_#F59E0B]'
              }`}
            />
            <span className="text-[11px] font-mono tracking-widest text-white/95 font-semibold uppercase truncate">
              {connected ? `CONNECTED · ${hostName}` : 'CONNECTING...'}
            </span>
          </div>
        </button>

        {/* 2. Top-Left Clock Card Live Overlays (21:47 & WED 18 NOV) */}
        <div
          className="absolute z-10 flex items-center"
          style={{
            left: '2.54%',
            top: '14.78%',
            width: '31.84%',
            height: '30.87%',
          }}
        >
          {/* Digits & Date Overlay aligned over the left of the card */}
          <div className="flex items-center h-full pl-[5.5%] pt-[1%]">
            <div className="w-[3px] h-[48%] bg-[#B07BFF] rounded-full shadow-[0_0_10px_#B07BFF] mr-3 shrink-0" />
            <div className="flex flex-col justify-center">
              <span className="text-[44px] leading-none font-light text-white tracking-normal font-sans drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                {timeStr}
              </span>
              <span className="tracking-[0.22em] text-[10.5px] font-semibold text-white/95 uppercase mt-1.5 font-sans drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        {/* 3. CPU Card Live Metrics Overlay */}
        <div
          className="absolute z-10 flex flex-col justify-between p-3"
          style={{
            left: '35.35%',
            top: '15.22%',
            width: '13.67%',
            height: '30.43%',
          }}
        >
          <span className="text-[#A1A1AA] font-mono text-[10.5px] uppercase font-bold tracking-wider">
            CPU
          </span>
          <div className="flex items-center space-x-2 my-auto">
            {/* Live circular gauge arc */}
            <div className="relative w-9 h-9 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth="3.5"
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
            <span className="text-[22px] font-bold text-white font-sans tracking-tight">
              {cpuPercent}%
            </span>
          </div>
          {/* Sparkline wave */}
          <div className="w-full h-4 overflow-hidden">
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

        {/* 4. GPU Card Live Metrics Overlay */}
        <div
          className="absolute z-10 flex flex-col justify-between p-3"
          style={{
            left: '50.0%',
            top: '15.22%',
            width: '13.67%',
            height: '30.43%',
          }}
        >
          <span className="text-[#A1A1AA] font-mono text-[10.5px] uppercase font-bold tracking-wider">
            GPU
          </span>
          <div className="flex items-center space-x-2 my-auto">
            <div className="relative w-9 h-9 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  stroke="rgba(255, 255, 255, 0.12)"
                  strokeWidth="3.5"
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
            <span className="text-[22px] font-bold text-white font-sans tracking-tight">
              {gpuPercent}%
            </span>
          </div>
          <div className="w-full h-4 overflow-hidden">
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

        {/* 5. RAM Card Live Metrics Overlay */}
        <div
          className="absolute z-10 flex flex-col justify-between p-3"
          style={{
            left: '64.65%',
            top: '15.22%',
            width: '15.82%',
            height: '30.43%',
          }}
        >
          <span className="text-[#A1A1AA] font-mono text-[10.5px] uppercase font-bold tracking-wider">
            RAM
          </span>
          <div className="my-auto">
            <span className="text-[17px] font-bold text-white font-sans tracking-tight whitespace-nowrap">
              {ramUsedGb} / {ramTotalGb} GB
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.12] overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-[#B07BFF] transition-all duration-300"
              style={{
                width: `${ramPercent}%`,
                boxShadow: '0 0 8px rgba(176,123,255,0.8)',
              }}
            />
          </div>
        </div>

        {/* 6. NET Card Live Metrics Overlay */}
        <div
          className="absolute z-10 flex flex-col justify-between p-3"
          style={{
            left: '81.45%',
            top: '15.22%',
            width: '15.82%',
            height: '30.43%',
          }}
        >
          <span className="text-[#A1A1AA] font-mono text-[10.5px] uppercase font-bold tracking-wider">
            NET
          </span>
          <div className="my-auto">
            <span className="text-[12.5px] font-semibold text-white font-sans whitespace-nowrap">
              ↓ {netInFormatted} &nbsp;↑ {netOutFormatted}
            </span>
          </div>
          <div className="w-full h-4 overflow-hidden">
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

        {/* 7. Bottom-Left Now Playing Interactive Card */}
        <div
          className="absolute z-10 flex items-center p-3"
          style={{
            left: '2.54%',
            top: '47.83%',
            width: '43.16%',
            height: '33.91%',
          }}
        >
          {/* Spacer for album art */}
          <div className="w-[118px] h-full shrink-0" />

          {/* Right Track info & Interactive Playback Controls */}
          <div className="flex-1 flex flex-col justify-between h-full pl-3.5 py-0.5 min-w-0">
            <div>
              <h3 className="text-[17px] font-bold text-white truncate font-sans tracking-tight leading-snug">
                {mediaTitle}
              </h3>
              <p className="text-[12px] text-zinc-300 truncate font-sans">
                {mediaArtist}
              </p>
            </div>

            {/* Progress Capsule */}
            <div className="flex items-center space-x-2 my-1">
              <div className="flex-1 h-2 rounded-full bg-white/[0.12] overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-[#B07BFF] transition-all duration-300"
                  style={{
                    width: `${mediaProgressPct}%`,
                    boxShadow: '0 0 8px rgba(176,123,255,0.8)',
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-300 shrink-0">
                {formatTime(positionSec)} / {formatTime(durationSec)}
              </span>
            </div>

            {/* Clickable Controls (Prev, Round Play/Pause, Next) */}
            <div className="flex items-center space-x-7">
              <button
                onClick={() => sendMediaAction('prev')}
                className="text-white hover:text-[#B07BFF] active:scale-90 transition-all cursor-pointer p-1"
                title="Previous Track"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={() => sendMediaAction('toggle')}
                className="w-8 h-8 rounded-full bg-[#B07BFF] hover:bg-[#a068f5] text-white flex items-center justify-center shadow-[0_0_14px_rgba(176,123,255,0.7)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => sendMediaAction('next')}
                className="text-white hover:text-[#B07BFF] active:scale-90 transition-all cursor-pointer p-1"
                title="Next Track"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 8. Bottom-Right 5-App Dock Interactive Buttons */}
        <div
          className="absolute z-20 flex items-center justify-between"
          style={{
            left: '46.8%',
            top: '69.57%',
            width: '51.2%',
            height: '19.57%',
          }}
        >
          {/* App 1: VS Code */}
          <button
            onClick={() => setActiveApp('vscode')}
            className={`w-[18.2%] h-full rounded-2xl hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer ${
              activeApp === 'vscode' ? 'ring-1 ring-[#B07BFF]/50' : ''
            }`}
            title="Visual Studio Code"
          />

          {/* App 2: Opera GX */}
          <button
            onClick={() => setActiveApp('opera')}
            className={`w-[18.2%] h-full rounded-2xl hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer ${
              activeApp === 'opera' ? 'ring-1 ring-[#B07BFF]/50' : ''
            }`}
            title="Opera GX"
          />

          {/* App 3: Antigravity */}
          <button
            onClick={() => setActiveApp('antigravity')}
            className={`w-[18.2%] h-full rounded-2xl hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer ${
              activeApp === 'antigravity' ? 'ring-1 ring-[#B07BFF]/50' : ''
            }`}
            title="Antigravity"
          />

          {/* App 4: Spotify */}
          <button
            onClick={() => setActiveApp('spotify')}
            className={`w-[18.2%] h-full rounded-2xl hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer ${
              activeApp === 'spotify' ? 'ring-1 ring-[#B07BFF]/50' : ''
            }`}
            title="Spotify"
          />

          {/* App 5: Terminal */}
          <button
            onClick={() => setActiveApp('terminal')}
            className={`w-[18.2%] h-full rounded-2xl hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer ${
              activeApp === 'terminal' ? 'ring-1 ring-[#B07BFF]/50' : ''
            }`}
            title="Terminal"
          />
        </div>
      </div>
    </div>
  );
};
