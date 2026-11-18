import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAmbientStore } from './ambientStore';
import { useDeckStore } from './deckStore';

interface NightClockProps {
  onTap: () => void;
  onDoubleTap: () => void;
}

export function NightClockView({ onTap, onDoubleTap }: NightClockProps) {
  const config = useAmbientStore((s) => s.config);
  const state = useAmbientStore((s) => s.state);
  const rawLux = useAmbientStore((s) => s.rawLux);
  const filteredLux = useAmbientStore((s) => s.filteredLux);
  const timeInStateSecs = useAmbientStore((s) => s.timeInStateSecs);
  const isSensorCovered = useAmbientStore((s) => s.isSensorCovered);
  const hasActiveEventDot = useAmbientStore((s) => s.hasActiveEventDot);
  const wakeAlertUntil = useAmbientStore((s) => s.wakeAlertUntil);
  const events = useDeckStore((s) => s.events);

  // Phone's own clock state (zero network)
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [secondsStr, setSecondsStr] = useState('');

  // Burn-in pixel shift offset (a few px shifted every ~60s to protect OLED pixels)
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });

  // Tap handling (distinguish single tap from double tap)
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Time formatting aligned to exact minute boundary (or 1s if seconds enabled)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      if (!config.is24h) {
        hours = hours % 12 || 12;
      }
      const hh = String(hours).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      setTimeStr(`${hh}:${mm}`);
      setSecondsStr(ss);

      // Date: e.g. "WED, NOV 18"
      const dateFormatted = now.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      setDateStr(dateFormatted.toUpperCase());
    };

    updateTime();

    if (config.showSeconds) {
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    } else {
      // Align timer to exact minute boundary
      let timeoutId: ReturnType<typeof setTimeout>;
      const scheduleNextMinute = () => {
        const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
        timeoutId = setTimeout(() => {
          updateTime();
          scheduleNextMinute();
        }, msUntilNextMinute);
      };
      scheduleNextMinute();
      return () => clearTimeout(timeoutId);
    }
  }, [config.is24h, config.showSeconds]);

  // OLED burn-in pixel shift every 60s
  useEffect(() => {
    const shiftInterval = setInterval(() => {
      // Subtle shift within -3px to +3px
      const ox = (Math.floor(Math.random() * 7) - 3);
      const oy = (Math.floor(Math.random() * 7) - 3);
      setPixelShift({ x: ox, y: oy });
    }, 60_000);

    return () => clearInterval(shiftInterval);
  }, []);

  const handleClick = () => {
    if (tapTimeoutRef.current) {
      // Double tap detected
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      onDoubleTap();
    } else {
      // Wait to see if second tap arrives within 250ms
      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
        onTap();
      }, 250);
    }
  };

  const latestEvent = events[0];
  const isWakeActive = wakeAlertUntil !== null && Date.now() < wakeAlertUntil;

  // Determine dot color based on latest event kind
  const dotColor = latestEvent?.kind === 'error'
    ? '#FF3B5C'
    : latestEvent?.kind === 'needs_input' || latestEvent?.kind === 'approval'
    ? '#FFB800'
    : '#00E599';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      onClick={handleClick}
      className="fixed inset-0 z-50 bg-[#000000] text-white flex flex-col justify-between items-center p-6 select-none cursor-pointer overflow-hidden"
    >
      {/* Top Status Bar: Minimal & discreet */}
      <div className="w-full flex justify-between items-center text-[11px] font-mono text-zinc-600">
        <div className="flex items-center space-x-2">
          {state === 'locked_dark' && (
            <span className="text-amber-400 font-semibold tracking-wider bg-amber-400/10 px-1.5 py-0.5 rounded text-[9px]">
              LOCKED DARK
            </span>
          )}
          {isSensorCovered && (
            <span className="text-amber-500 font-mono text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded">
              SENSOR COVERED (&gt;1H AT 0 LUX)
            </span>
          )}
        </div>

        <div className="text-[10px] tracking-widest uppercase text-zinc-700">
          TAP TO PEEK · 2× TAP LOCK
        </div>
      </div>

      {/* Main Clock Area with slow burn-in protection shift */}
      <div
        style={{
          transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
          transition: 'transform 3s ease-out',
        }}
        className="flex flex-col items-center justify-center my-auto relative"
      >
        <div className="flex items-baseline space-x-2">
          {/* Huge thin tabular numerals (Section 7 Void style) */}
          <span className="text-7xl sm:text-8xl md:text-9xl font-mono font-extralight tracking-tight text-white/90 tabular-nums">
            {timeStr || '--:--'}
          </span>

          {config.showSeconds && (
            <span className="text-2xl sm:text-3xl font-mono font-light text-zinc-500 tabular-nums">
              {secondsStr}
            </span>
          )}

          {/* Discreet Event Dot Indicator */}
          {hasActiveEventDot && (
            <div
              style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
              className="w-2.5 h-2.5 rounded-full ml-1 mb-3 animate-pulse"
              title={`Agent event: ${latestEvent?.title || 'Notification'}`}
            />
          )}
        </div>

        {/* Small tracked date */}
        <div className="text-xs sm:text-sm font-mono tracking-[0.25em] text-zinc-500 uppercase mt-2">
          {dateStr}
        </div>

        {/* Wake Notification Dialog (if alertMode === 'wake' and active) */}
        <AnimatePresence>
          {isWakeActive && latestEvent && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-6 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 text-left max-w-sm"
            >
              <div className="flex items-center space-x-2 text-xs font-mono mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="text-zinc-400 uppercase font-semibold">{latestEvent.agent}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">{latestEvent.project}</span>
              </div>
              <div className="text-sm font-semibold text-zinc-200">{latestEvent.title}</div>
              <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{latestEvent.summary}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle debug info footer */}
      <div className="w-full flex justify-between items-center text-[10px] font-mono text-zinc-700">
        <span>STATE: {state.toUpperCase()} ({timeInStateSecs}S)</span>
        <span>RAW: {rawLux.toFixed(1)} LX · FILT: {filteredLux.toFixed(1)} LX</span>
      </div>
    </motion.div>
  );
}
