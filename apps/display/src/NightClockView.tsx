import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAmbientStore } from './ambientStore';
import { useDeckStore } from './deckStore';

interface NightClockProps {
  onTap: () => void;
  onDoubleTap: () => void;
}

interface FlipDigitProps {
  digit: string;
  badge?: string | null;
}

const FlipDigit: React.FC<FlipDigitProps> = ({ digit, badge }) => {
  return (
    <div className="relative flex flex-col items-center justify-center bg-[#25252A] rounded-xl sm:rounded-2xl md:rounded-[22px] overflow-hidden shadow-[0_12px_36px_rgba(0,0,0,0.9)] border border-white/[0.05] w-[18.5vw] max-w-[136px] min-w-[62px] aspect-[1/1.55]">
      {/* Top Half Flap */}
      <div className="relative w-full h-1/2 overflow-hidden bg-gradient-to-b from-[#323238] via-[#2A2A30] to-[#25252A] border-b-[1.5px] border-black/90 flex items-start justify-center">
        {/* Optional AM / PM Badge on upper-left */}
        {badge && (
          <span className="absolute top-2 left-2.5 sm:top-2.5 sm:left-3.5 text-[11px] sm:text-xs md:text-sm font-black tracking-wider text-[#F4F1E8] font-sans select-none z-10 leading-none">
            {badge}
          </span>
        )}

        {/* Top half numeral */}
        <div className="absolute top-0 w-full h-[200%] flex items-center justify-center pointer-events-none">
          <span className="text-[105px] sm:text-[135px] md:text-[160px] font-black font-sans text-[#F4F1E8] tracking-tighter leading-none select-none">
            {digit}
          </span>
        </div>
      </div>

      {/* Horizontal Seam & Vintage Hinge Pin Notches */}
      <div className="relative w-full h-[2px] bg-[#0A0A0C] z-20 flex justify-between items-center pointer-events-none">
        {/* Left hinge notch */}
        <div className="w-1.5 sm:w-2 h-2.5 sm:h-3.5 -ml-0.5 rounded-r-full bg-[#000000]" />
        {/* Right hinge notch */}
        <div className="w-1.5 sm:w-2 h-2.5 sm:h-3.5 -mr-0.5 rounded-l-full bg-[#000000]" />
      </div>

      {/* Bottom Half Flap */}
      <div className="relative w-full h-1/2 overflow-hidden bg-gradient-to-b from-[#1F1F24] via-[#222227] to-[#26262B] shadow-[inset_0_5px_8px_rgba(0,0,0,0.65)] flex items-end justify-center">
        {/* Bottom half numeral */}
        <div className="absolute bottom-0 w-full h-[200%] flex items-center justify-center pointer-events-none">
          <span className="text-[105px] sm:text-[135px] md:text-[160px] font-black font-sans text-[#F4F1E8] tracking-tighter leading-none select-none">
            {digit}
          </span>
        </div>
      </div>
    </div>
  );
};

const FlipColon: React.FC = () => {
  return (
    <div className="flex flex-col justify-center items-center gap-6 sm:gap-8 md:gap-11 px-1 sm:px-2 md:px-3 h-full select-none">
      <div className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 md:w-4.5 md:h-4.5 rounded-[3px] bg-[#F4F1E8] shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
      <div className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 md:w-4.5 md:h-4.5 rounded-[3px] bg-[#F4F1E8] shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
    </div>
  );
};

export const NightClockView: React.FC<NightClockProps> = ({ onTap, onDoubleTap }) => {
  const config = useAmbientStore((s) => s.config);
  const state = useAmbientStore((s) => s.state);
  const hasActiveEventDot = useAmbientStore((s) => s.hasActiveEventDot);
  const wakeAlertUntil = useAmbientStore((s) => s.wakeAlertUntil);
  const events = useDeckStore((s) => s.events);

  // Time components
  const [digits, setDigits] = useState<{ h1: string; h2: string; m1: string; m2: string; ampm: string | null }>({
    h1: '0',
    h2: '7',
    m1: '3',
    m2: '5',
    ampm: 'AM',
  });
  const [dateStr, setDateStr] = useState('THURSDAY, NOVEMBER 19, 2026');

  // Burn-in pixel shift offset (shifts subtle ±3px every 60s for AMOLED protection)
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });

  // Tap handling (distinguish single tap from double tap)
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      let ampm: string | null = null;

      if (!config.is24h) {
        ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
      }

      const hh = String(hours).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');

      setDigits({
        h1: hh[0],
        h2: hh[1],
        m1: mm[0],
        m2: mm[1],
        ampm,
      });

      // Format date exactly: "THURSDAY, NOVEMBER 19, 2026"
      const weekday = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      const month = now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      const day = now.getDate();
      const year = now.getFullYear();
      setDateStr(`${weekday}, ${month} ${day}, ${year}`);
    };

    updateTime();

    // Schedule next minute update
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
  }, [config.is24h]);

  // OLED burn-in pixel shift every 60s
  useEffect(() => {
    const shiftInterval = setInterval(() => {
      const ox = Math.floor(Math.random() * 7) - 3;
      const oy = Math.floor(Math.random() * 7) - 3;
      setPixelShift({ x: ox, y: oy });
    }, 60_000);

    return () => clearInterval(shiftInterval);
  }, []);

  const handleClick = () => {
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      onDoubleTap();
    } else {
      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
        onTap();
      }, 250);
    }
  };

  const latestEvent = events[0];
  const isWakeActive = wakeAlertUntil !== null && Date.now() < wakeAlertUntil;
  const dotColor =
    latestEvent?.kind === 'error'
      ? '#FF3B5C'
      : latestEvent?.kind === 'needs_input' || latestEvent?.kind === 'approval'
      ? '#FFB800'
      : '#00E599';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      onClick={handleClick}
      className="fixed inset-0 z-50 bg-[#000000] text-white flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 select-none cursor-pointer overflow-hidden"
    >
      {/* Clock & Date Area with OLED burn-in safe micro-shift */}
      <div
        style={{
          transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
          transition: 'transform 3s ease-out',
        }}
        className="flex flex-col items-center justify-center my-auto relative"
      >
        {/* Flip Cards Row */}
        <div className="flex items-center justify-center gap-2 sm:gap-3.5 md:gap-5">
          {/* Card 1: Hours Tens with AM/PM badge */}
          <FlipDigit digit={digits.h1} badge={digits.ampm} />

          {/* Card 2: Hours Units */}
          <FlipDigit digit={digits.h2} />

          {/* Colon Separator */}
          <FlipColon />

          {/* Card 3: Minutes Tens */}
          <FlipDigit digit={digits.m1} />

          {/* Card 4: Minutes Units */}
          <FlipDigit digit={digits.m2} />
        </div>

        {/* Date Row: "THURSDAY, NOVEMBER 19, 2026" */}
        <div className="mt-6 sm:mt-8 md:mt-10 text-center flex items-center justify-center gap-3">
          <span className="text-sm sm:text-lg md:text-2xl font-black tracking-[0.16em] sm:tracking-[0.22em] text-[#F4F1E8] font-sans uppercase select-none">
            {dateStr}
          </span>

          {/* Discreet AI Event Indicator Dot */}
          {hasActiveEventDot && (
            <div
              style={{ backgroundColor: dotColor, boxShadow: `0 0 8px ${dotColor}` }}
              className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0"
              title={`Agent: ${latestEvent?.title || 'Notification'}`}
            />
          )}
        </div>

        {/* Locked Dark Indicator (Discreet) */}
        {state === 'locked_dark' && (
          <div className="mt-3 text-[10px] tracking-widest text-[#F4F1E8]/30 font-mono uppercase">
            LOCKED DARK · DOUBLE TAP TO UNLOCK
          </div>
        )}

        {/* Wake Dialog (if alertMode === 'wake' and active event) */}
        <AnimatePresence>
          {isWakeActive && latestEvent && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="mt-6 p-4 rounded-xl bg-[#18181D]/90 border border-white/10 text-left max-w-sm"
            >
              <div className="flex items-center space-x-2 text-xs font-mono mb-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
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
    </motion.div>
  );
};
