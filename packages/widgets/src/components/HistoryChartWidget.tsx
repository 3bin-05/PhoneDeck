import React, { useEffect, useRef, useState } from 'react';
import { MetricRingBuffer } from '@phone-deck/ui-kit';

export interface HistoryChartProps {
  title: string;
  currentValue: number;
  unit?: string;
  accentColor?: string;
  capacity?: number;
}

export const HistoryChartWidget: React.FC<HistoryChartProps> = React.memo(
  ({
    title,
    currentValue,
    unit = '%',
    accentColor = '#7C5CFF',
    capacity = 120,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const bufferRef = useRef<MetricRingBuffer>(new MetricRingBuffer(capacity));
    const [minVal, setMinVal] = useState<number>(0);
    const [maxVal, setMaxVal] = useState<number>(100);

    // Push new value to ring buffer whenever currentValue updates
    useEffect(() => {
      bufferRef.current.push(performance.now(), currentValue);
    }, [currentValue]);

    // Render canvas whenever currentValue changes or on animation frame
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const data = bufferRef.current.toArray();
      if (data.length < 2) {
        ctx.restore();
        return;
      }

      let min = Infinity;
      let max = -Infinity;
      for (const d of data) {
        if (d.value < min) min = d.value;
        if (d.value > max) max = d.value;
      }

      // Safe boundaries
      const displayMin = Math.floor(Math.min(0, min));
      const displayMax = Math.ceil(Math.max(100, max));
      const range = Math.max(1, displayMax - displayMin);

      setMinVal(min === Infinity ? 0 : Math.round(min));
      setMaxVal(max === -Infinity ? 100 : Math.round(max));

      // Draw hairline grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.25);
      ctx.lineTo(width, height * 0.25);
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
      ctx.moveTo(0, height * 0.75);
      ctx.lineTo(width, height * 0.75);
      ctx.stroke();

      // Build path
      ctx.beginPath();
      const stepX = width / Math.max(1, data.length - 1);
      for (let i = 0; i < data.length; i++) {
        const x = i * stepX;
        const normY = (data[i].value - displayMin) / range;
        const y = height - normY * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      // Gradient Fill
      const lastX = (data.length - 1) * stepX;
      ctx.lineTo(lastX, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, `${accentColor}33`); // 20% opacity
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Glowing Stroke line
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = i * stepX;
        const normY = (data[i].value - displayMin) / range;
        const y = height - normY * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 8;
      ctx.stroke();

      ctx.restore();
    }, [currentValue, accentColor]);

    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <span>{title}</span>
          <div className="flex items-center space-x-2">
            <span>
              MIN: <b className="text-[#EDEDF2] font-mono">{minVal}</b>
            </span>
            <span>
              MAX: <b className="text-[#EDEDF2] font-mono">{maxVal}</b>
            </span>
          </div>
        </div>

        <div className="flex-1 w-full my-1 relative overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <div className="flex items-baseline space-x-1">
            <span className="font-mono text-lg font-light text-[#EDEDF2] tabular-nums">
              {currentValue.toFixed(1)}
            </span>
            <span className="text-[10px]">{unit}</span>
          </div>
          <span className="text-[9px] uppercase tracking-wider text-[#71717A]">
            LTTB RING BUFFER
          </span>
        </div>
      </div>
    );
  }
);
HistoryChartWidget.displayName = 'HistoryChartWidget';
