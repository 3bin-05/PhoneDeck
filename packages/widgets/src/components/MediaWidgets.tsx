import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Disc,
  Radio,
  Sliders,
} from 'lucide-react';

export interface NowPlayingProps {
  title?: string;
  artist?: string;
  album?: string;
  sourceApp?: string;
  isPlaying?: boolean;
  positionSec?: number;
  durationSec?: number;
  playbackRate?: number; // 1000 = 1.0x
  artId?: string;
  palette?: string; // "#RRGGBB,#RRGGBB,#RRGGBB"
  masterVolume?: number; // 0..100
  isMuted?: boolean;
  availableSessions?: string[];
  artBaseUrl?: string; // default: "http://127.0.0.1:8765/api/media/art"
  onTogglePlay?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSeek?: (posSec: number) => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  onCycleSource?: () => void;
  onSelectSource?: (source: string) => void;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 1. Now Playing (Large)
 * Art-forward, no boxed card, typography first, interpolated progress.
 */
export const NowPlayingLargeWidget: React.FC<NowPlayingProps> = React.memo((props) => {
  const {
    title = 'No Media Active',
    artist = 'Aphex Twin',
    album = 'Selected Ambient Works',
    sourceApp = 'Spotify',
    isPlaying = false,
    positionSec = 0,
    durationSec = 240,
    playbackRate = 1000,
    artId = '',
    palette = '#7C5CFF,#18181B,#00E599',
    masterVolume = 75,
    isMuted = false,
    artBaseUrl = 'http://127.0.0.1:8765/api/media/art',
    onTogglePlay,
    onNext,
    onPrev,
    onSeek,
    onVolumeChange,
    onToggleMute,
    onCycleSource,
  } = props;

  // Local Interpolated Progress (zero network traffic while playing)
  const [interpolatedPos, setInterpolatedPos] = useState<number>(positionSec);
  const anchorTimeRef = useRef<number>(performance.now());
  const anchorPosRef = useRef<number>(positionSec);

  useEffect(() => {
    anchorPosRef.current = positionSec;
    anchorTimeRef.current = performance.now();
    setInterpolatedPos(positionSec);
  }, [positionSec, isPlaying]);

  useEffect(() => {
    if (!isPlaying || durationSec <= 0) return;

    let animId: number;
    const rate = (playbackRate || 1000) / 1000;

    const tick = () => {
      const elapsed = (performance.now() - anchorTimeRef.current) / 1000;
      const current = Math.min(durationSec, anchorPosRef.current + elapsed * rate);
      setInterpolatedPos(current);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, durationSec, playbackRate]);

  // Primary accent from palette
  const accentColor = palette.split(',')[0] || '#7C5CFF';
  const progressRatio = durationSec > 0 ? Math.min(1, Math.max(0, interpolatedPos / durationSec)) : 0;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || durationSec <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.round(ratio * durationSec);
    onSeek(targetSec);
  };

  const artUrl = artId ? `${artBaseUrl}/${artId}` : null;

  return (
    <div className="w-full h-full p-4 flex flex-col justify-between select-none relative overflow-hidden bg-transparent">
      {/* Top Source Badge */}
      <div className="flex items-center justify-between z-10">
        <button
          onClick={onCycleSource}
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[10px] font-mono uppercase tracking-wider text-zinc-300 transition-all cursor-pointer"
          title="Click to cycle media session"
        >
          <Radio className="w-3 h-3 text-[#7C5CFF]" />
          <span>{sourceApp}</span>
        </button>

        <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
          <button
            onClick={onToggleMute}
            className="hover:text-white transition-colors cursor-pointer"
            title="Toggle Mute"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <span className="text-[10px] tabular-nums">{isMuted ? 'MUTE' : `${masterVolume}%`}</span>
        </div>
      </div>

      {/* Center Media Card: Art-Forward */}
      <div className="flex items-center space-x-4 my-auto z-10">
        {/* Album Art thumbnail with dynamic accent glow */}
        <div
          style={{
            boxShadow: `0 8px 30px ${accentColor}25`,
            borderColor: `${accentColor}40`,
          }}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border shrink-0 bg-zinc-950 flex items-center justify-center relative group"
        >
          {artUrl ? (
            <img
              src={artUrl}
              alt={title}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide broken image and fall back to vinyl icon
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <Disc className="w-10 h-10 text-zinc-700 animate-spin" style={{ animationDuration: '6s' }} />
          )}
        </div>

        {/* Track Metadata */}
        <div className="flex-1 min-w-0">
          <div className="text-base sm:text-lg font-bold text-white tracking-tight truncate leading-tight">
            {title}
          </div>
          <div className="text-xs sm:text-sm text-zinc-400 font-medium truncate mt-0.5">
            {artist}
          </div>
          {album && (
            <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider truncate mt-1">
              {album}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls & Interpolated Progress Bar */}
      <div className="space-y-2 z-10">
        {/* Progress bar (Tap to Seek) */}
        <div
          onClick={handleProgressBarClick}
          className="w-full h-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-full overflow-hidden cursor-pointer relative group transition-colors"
        >
          <div
            style={{
              width: `${progressRatio * 100}%`,
              backgroundColor: accentColor,
            }}
            className="h-full rounded-full transition-all duration-75 relative"
          />
        </div>

        {/* Timestamps & Playback Buttons */}
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {formatTime(interpolatedPos)}
          </span>

          <div className="flex items-center space-x-3">
            <button
              onClick={onPrev}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Previous Track"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={onTogglePlay}
              style={{
                backgroundColor: isPlaying ? '#FFFFFF' : accentColor,
                color: isPlaying ? '#000000' : '#FFFFFF',
              }}
              className="p-2 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              onClick={onNext}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <span className="text-[10px] text-zinc-500 tabular-nums">
            {formatTime(durationSec)}
          </span>
        </div>

        {/* Master Volume Slider */}
        <div className="flex items-center space-x-2 pt-1 border-t border-white/[0.04]">
          <Volume2 className="w-3 h-3 text-zinc-500 shrink-0" />
          <input
            type="range"
            min="0"
            max="100"
            value={masterVolume}
            onChange={(e) => onVolumeChange && onVolumeChange(parseInt(e.target.value))}
            className="w-full h-1 bg-white/[0.08] accent-[#7C5CFF] rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
});
NowPlayingLargeWidget.displayName = 'NowPlayingLargeWidget';

/**
 * 2. Mini Now Playing
 * Art + Title/Artist + Play/Pause in a compact 1-row form factor.
 */
export const MiniNowPlayingWidget: React.FC<NowPlayingProps> = React.memo((props) => {
  const {
    title = 'Alberto Balsalm',
    artist = 'Aphex Twin',
    isPlaying = false,
    artId = '',
    artBaseUrl = 'http://127.0.0.1:8765/api/media/art',
    onTogglePlay,
  } = props;

  const artUrl = artId ? `${artBaseUrl}/${artId}` : null;

  return (
    <div className="w-full h-full px-3 py-1.5 rounded-xl bg-[#09090D] border border-white/[0.08] flex items-center justify-between select-none">
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-900 border border-white/[0.06] shrink-0 flex items-center justify-center">
          {artUrl ? (
            <img src={artUrl} alt={title} className="w-full h-full object-cover" />
          ) : (
            <Disc className="w-4 h-4 text-zinc-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate leading-tight">{title}</div>
          <div className="text-[10px] text-zinc-400 truncate font-mono">{artist}</div>
        </div>
      </div>

      <button
        onClick={onTogglePlay}
        className="p-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white transition-all cursor-pointer shrink-0 ml-2"
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
      </button>
    </div>
  );
});
MiniNowPlayingWidget.displayName = 'MiniNowPlayingWidget';

/**
 * 3. Vinyl Player
 * Spinning vinyl record (33 1/3 rpm), smooth deceleration on pause,
 * mechanical tonearm that tracks progress inward.
 */
export const VinylPlayerWidget: React.FC<NowPlayingProps> = React.memo((props) => {
  const {
    title = 'Selected Ambient Works',
    artist = 'Aphex Twin',
    isPlaying = false,
    positionSec = 0,
    durationSec = 240,
    artId = '',
    artBaseUrl = 'http://127.0.0.1:8765/api/media/art',
    onTogglePlay,
  } = props;

  // Cumulative rotation degrees to handle smooth deceleration & stop without jumping
  const [rotation, setRotation] = useState(0);
  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const velocityRef = useRef<number>(isPlaying ? 200 : 0); // deg/sec (33 1/3 rpm = ~200 deg/sec)

  useEffect(() => {
    const targetVelocity = isPlaying ? 200.0 : 0.0;

    const animateLoop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Smooth accelerate/decelerate towards target velocity (~1.5s transition)
      const smoothing = isPlaying ? 3.0 : 1.8;
      velocityRef.current += (targetVelocity - velocityRef.current) * Math.min(1, dt * smoothing);

      if (velocityRef.current > 0.1 || isPlaying) {
        setRotation((prev) => (prev + velocityRef.current * dt) % 360);
        animRef.current = requestAnimationFrame(animateLoop);
      } else {
        animRef.current = null;
      }
    };

    lastTimeRef.current = performance.now();
    if (!animRef.current) {
      animRef.current = requestAnimationFrame(animateLoop);
    }

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [isPlaying]);

  // Tonearm rotation angle: sweeps inward from 15deg (lead-in) to 36deg (run-out groove)
  const progressRatio = durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
  const tonearmAngle = isPlaying ? 16 + progressRatio * 20 : 10;

  const artUrl = artId ? `${artBaseUrl}/${artId}` : null;

  return (
    <div
      onClick={onTogglePlay}
      className="w-full h-full p-4 rounded-2xl bg-[#08080C] border border-white/[0.08] flex flex-col items-center justify-between select-none relative overflow-hidden cursor-pointer group"
    >
      {/* Vinyl Disc Container */}
      <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center my-auto">
        {/* Vinyl Record */}
        <div
          style={{
            transform: `rotate(${rotation}deg)`,
            backgroundImage:
              'radial-gradient(circle, #0A0A0E 0%, #181820 40%, #0A0A0E 45%, #181820 70%, #050508 100%)',
          }}
          className="w-full h-full rounded-full shadow-2xl border-4 border-black/80 flex items-center justify-center relative"
        >
          {/* Vinyl Grooves styling */}
          <div className="absolute inset-2 rounded-full border border-white/[0.04] pointer-events-none" />
          <div className="absolute inset-5 rounded-full border border-white/[0.03] pointer-events-none" />
          <div className="absolute inset-8 rounded-full border border-white/[0.04] pointer-events-none" />
          <div className="absolute inset-11 rounded-full border border-white/[0.02] pointer-events-none" />

          {/* Center Label (Album Art) */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-amber-500/40 bg-zinc-900 flex items-center justify-center relative shadow-inner">
            {artUrl ? (
              <img src={artUrl} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-purple-900 to-indigo-900 flex items-center justify-center text-[8px] font-mono text-zinc-300">
                VINYL
              </div>
            )}
            {/* Center Spindle Hole */}
            <div className="w-3 h-3 rounded-full bg-black border border-white/40 absolute z-10" />
          </div>
        </div>

        {/* Tonearm */}
        <div
          style={{
            transformOrigin: 'top right',
            transform: `rotate(${tonearmAngle}deg)`,
            transition: 'transform 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          className="absolute -top-1 right-2 w-1.5 h-24 sm:h-28 bg-gradient-to-b from-zinc-300 to-zinc-600 rounded-full shadow-lg pointer-events-none"
        >
          {/* Tonearm Base Pivot */}
          <div className="w-4 h-4 rounded-full bg-zinc-700 border border-zinc-500 absolute -top-1 -right-1 shadow" />
          {/* Cartridge headshell */}
          <div className="w-3 h-4 bg-zinc-800 rounded-sm absolute bottom-0 -left-1 border border-zinc-600" />
        </div>
      </div>

      {/* Track info & play state */}
      <div className="w-full text-center mt-2 z-10">
        <div className="text-xs font-semibold text-white truncate">{title}</div>
        <div className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">{artist}</div>
        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mt-1">
          {isPlaying ? '33 ⅓ RPM · PLAYING' : 'PAUSED · TAP TO RESUME'}
        </div>
      </div>
    </div>
  );
});
VinylPlayerWidget.displayName = 'VinylPlayerWidget';

/**
 * 4. Master Volume Dial & Fader
 * Large tactile dial or fader for master volume + mute toggle. Shows dB or % readout.
 */
export const VolumeDialWidget: React.FC<NowPlayingProps> = React.memo((props) => {
  const {
    masterVolume = 75,
    isMuted = false,
    onVolumeChange,
    onToggleMute,
  } = props;

  // Compute dB estimation from percentage (0% = -inf, 100% = 0 dB)
  const dbReadout =
    masterVolume <= 0
      ? '-∞ dB'
      : `${(20 * Math.log10(masterVolume / 100)).toFixed(1)} dB`;

  return (
    <div className="w-full h-full p-4 rounded-2xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between select-none">
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
        <div className="flex items-center space-x-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>MASTER VOLUME</span>
        </div>
        <button
          onClick={onToggleMute}
          className={`px-2 py-0.5 rounded text-[9px] font-semibold cursor-pointer transition-all ${
            isMuted
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-white/[0.04] text-zinc-400 hover:text-white'
          }`}
        >
          {isMuted ? 'MUTED' : 'ACTIVE'}
        </button>
      </div>

      {/* Main Level Readout */}
      <div className="flex items-baseline justify-center space-x-2 my-auto">
        <span className="text-5xl sm:text-6xl font-mono font-light text-white tabular-nums tracking-tight">
          {isMuted ? '0' : masterVolume}
        </span>
        <span className="text-sm font-mono text-zinc-500">%</span>
      </div>

      <div className="text-center text-[10px] font-mono text-zinc-500 mb-2">
        {isMuted ? 'MUTE ENGAGED' : dbReadout}
      </div>

      {/* Tactile Slider */}
      <div className="space-y-2">
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : masterVolume}
          onChange={(e) => onVolumeChange && onVolumeChange(parseInt(e.target.value))}
          className="w-full h-2 bg-white/[0.08] accent-[#7C5CFF] rounded-lg cursor-pointer"
        />

        <div className="flex justify-between text-[9px] font-mono text-zinc-600">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
});
VolumeDialWidget.displayName = 'VolumeDialWidget';

/**
 * 5. Quick Source Switcher
 * Pill list of active media sessions (Spotify, Opera GX, Chrome, etc.) with icons.
 */
export const MediaSourceSwitcherWidget: React.FC<NowPlayingProps> = React.memo((props) => {
  const {
    sourceApp = 'Spotify',
    availableSessions = ['Spotify', 'Opera GX', 'Google Chrome', 'VLC Media Player'],
    onSelectSource,
  } = props;

  return (
    <div className="w-full h-full p-3.5 rounded-2xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between select-none">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>ACTIVE SESSIONS</span>
        <span className="text-zinc-600 font-mono">{availableSessions.length} APPS</span>
      </div>

      <div className="grid grid-cols-2 gap-2 my-auto">
        {availableSessions.map((app) => {
          const isActive = app.toLowerCase() === sourceApp.toLowerCase();
          return (
            <button
              key={app}
              onClick={() => onSelectSource && onSelectSource(app)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center space-x-2 ${
                isActive
                  ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/40 text-white shadow-sm'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-zinc-400'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isActive ? 'bg-[#00E599] shadow-[0_0_6px_#00E599]' : 'bg-zinc-600'
                }`}
              />
              <span className="text-xs font-medium truncate">{app}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[9px] font-mono text-zinc-600 text-center mt-1">
        TAP PILL TO FOCUS SESSION
      </div>
    </div>
  );
});
MediaSourceSwitcherWidget.displayName = 'MediaSourceSwitcherWidget';
