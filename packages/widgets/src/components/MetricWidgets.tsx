import React, { useEffect, useRef, useState } from 'react';
import { Spring } from '@phone-deck/ui-kit';

export interface MetricTileProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  accentColor?: string;
}

export const MetricTileWidget: React.FC<MetricTileProps> = React.memo(
  ({ title, value, unit = '', subtext, accentColor = '#7C5CFF' }) => {
    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>{title}</span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
        </div>
        <div className="flex items-baseline space-x-1">
          <span className="font-mono text-3xl md:text-4xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {value}
          </span>
          {unit && (
            <span className="font-mono text-xs text-[#71717A] tracking-normal">
              {unit}
            </span>
          )}
        </div>
        <div className="text-[10px] font-mono text-[#71717A] truncate">
          {subtext || 'NORMAL'}
        </div>
      </div>
    );
  }
);
MetricTileWidget.displayName = 'MetricTileWidget';

export interface RadialGaugeProps {
  title: string;
  value: number; // 0 to 100
  subtext?: string;
  accentColor?: string;
}

export const RadialGaugeWidget: React.FC<RadialGaugeProps> = React.memo(
  ({ title, value, subtext, accentColor = '#7C5CFF' }) => {
    const springRef = useRef<Spring>(new Spring(value, 12.0));
    const [displayVal, setDisplayVal] = useState(value);
    const animFrameRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(performance.now());

    useEffect(() => {
      springRef.current.setTarget(value);
    }, [value]);

    useEffect(() => {
      let isRunning = true;

      const loop = (now: number) => {
        if (!isRunning) return;
        const dt = Math.max(0.001, (now - lastTimeRef.current) / 1000);
        lastTimeRef.current = now;

        const updated = springRef.current.step(dt);
        setDisplayVal(updated);

        // Continue rAF loop if still animating towards target
        if (
          Math.abs(springRef.current.value - springRef.current.target) > 0.05 ||
          Math.abs(springRef.current.velocity) > 0.05
        ) {
          animFrameRef.current = requestAnimationFrame(loop);
        } else {
          animFrameRef.current = null;
        }
      };

      if (!animFrameRef.current) {
        lastTimeRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(loop);
      }

      return () => {
        isRunning = false;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      };
    }, [value]);

    // Gauge geometry
    const size = 110;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    // 240 degree arc (from 150deg to 390deg)
    const arcRatio = 240 / 360;
    const totalArcLength = circumference * arcRatio;
    const pct = Math.max(0, Math.min(100, displayVal)) / 100;
    const strokeDashoffset = totalArcLength * (1 - pct);

    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none relative overflow-hidden">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider z-10">
          <span>{title}</span>
          <span className="text-[#EDEDF2] font-mono tabular-nums">
            {displayVal.toFixed(1)}%
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center relative">
          <svg
            className="w-24 h-24 transform rotate-[150deg]"
            viewBox={`0 0 ${size} ${size}`}
          >
            {/* Background Arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${totalArcLength} ${circumference}`}
              strokeLinecap="round"
            />
            {/* Live Spring Filled Arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={accentColor}
              strokeWidth={strokeWidth}
              strokeDasharray={`${totalArcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px ${accentColor}80)`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span className="font-mono text-2xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
              {Math.round(displayVal)}
            </span>
            <span className="text-[9px] font-mono text-[#71717A] -mt-1">
              PERCENT
            </span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#71717A] flex items-center justify-between z-10">
          <span>{subtext || 'SPRING 30FPS'}</span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
        </div>
      </div>
    );
  }
);
RadialGaugeWidget.displayName = 'RadialGaugeWidget';
