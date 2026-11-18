import React, { useEffect, useState } from 'react';

export const DigitalClockWidget: React.FC = () => {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setDate(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
      <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
        <span>LOCAL CLOCK</span>
        <span className="text-[#EDEDF2]">{date}</span>
      </div>
      <div className="font-mono text-3xl md:text-4xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
        {time || '00:00:00'}
      </div>
      <div className="text-[10px] font-mono text-[#71717A] flex items-center justify-between">
        <span>SYNC: 0 B/S</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
      </div>
    </div>
  );
};

export const AnalogClockWidget: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;

  const secDeg = sec * 6;
  const minDeg = min * 6 + sec * 0.1;
  const hrDeg = hr * 30 + min * 0.5;

  return (
    <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col items-center justify-center select-none relative overflow-hidden">
      <div className="relative w-28 h-28 rounded-full border border-white/[0.1] bg-[#050508] flex items-center justify-center shadow-inner">
        {/* Dial ticks */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <div
            key={deg}
            className="absolute w-0.5 h-1.5 bg-white/[0.2]"
            style={{
              transform: `rotate(${deg}deg) translateY(-48px)`,
            }}
          />
        ))}

        {/* Hour Hand */}
        <div
          className="absolute w-1 h-7 bg-[#EDEDF2] rounded-full origin-bottom"
          style={{
            transform: `rotate(${hrDeg}deg) translateY(-50%)`,
          }}
        />

        {/* Minute Hand */}
        <div
          className="absolute w-0.5 h-10 bg-[#71717A] rounded-full origin-bottom"
          style={{
            transform: `rotate(${minDeg}deg) translateY(-50%)`,
          }}
        />

        {/* Second Hand (Accent) */}
        <div
          className="absolute w-0.5 h-11 bg-[#7C5CFF] rounded-full origin-bottom shadow-[0_0_8px_#7C5CFF]"
          style={{
            transform: `rotate(${secDeg}deg) translateY(-50%)`,
          }}
        />

        {/* Center Pivot */}
        <div className="w-2 h-2 rounded-full bg-[#7C5CFF] z-10" />
      </div>
      <div className="mt-2 text-[9px] font-mono text-[#71717A] uppercase tracking-widest">
        ANALOG DIAL
      </div>
    </div>
  );
};

export const FlipClockWidget: React.FC = () => {
  const [time, setTime] = useState({ hr: '12', min: '00', sec: '00' });

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime({
        hr: String(d.getHours()).padStart(2, '0'),
        min: String(d.getMinutes()).padStart(2, '0'),
        sec: String(d.getSeconds()).padStart(2, '0'),
      });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
      <div className="text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
        RETRO FLIP
      </div>
      <div className="flex items-center justify-center gap-1.5 font-mono my-auto">
        {[time.hr, time.min, time.sec].map((part, i) => (
          <React.Fragment key={i}>
            <div className="relative px-2 py-1.5 rounded-lg bg-[#12121A] border border-white/[0.1] text-2xl font-light tabular-nums text-[#EDEDF2] shadow-md flex items-center justify-center">
              <span>{part}</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-black/60 pointer-events-none" />
            </div>
            {i < 2 && <span className="text-[#7C5CFF] font-bold text-sm">:</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="text-[9px] font-mono text-[#71717A] text-center">
        LOW POWER 1 HZ
      </div>
    </div>
  );
};
