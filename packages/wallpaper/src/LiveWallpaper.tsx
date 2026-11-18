import React from 'react';
import { WallpaperManifest, GovernorInputs } from './types';
import { useLiveWallpaper } from './useLiveWallpaper';

export interface LiveWallpaperProps {
  manifest: WallpaperManifest;
  telemetry: {
    cpuPercent: number;
    gpuPercent?: number;
    netBytesPerSec?: number;
    tempCelsius?: number;
  };
  governorInputs: GovernorInputs;
  accentColor?: string;
  showGovernorBadge?: boolean;
}

export const LiveWallpaper: React.FC<LiveWallpaperProps> = ({
  manifest,
  telemetry,
  governorInputs,
  accentColor = '#7C5CFF',
  showGovernorBadge = false,
}) => {
  const { canvasRef, containerRef, governorState } = useLiveWallpaper({
    manifest,
    telemetry,
    governorInputs,
    accentColor,
  });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      style={{
        zIndex: 0,
        backgroundColor: '#000000',
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          filter: manifest.blur ? `blur(${manifest.blur}px)` : undefined,
        }}
      />

      {/* Governor Debug Badge */}
      {showGovernorBadge && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/80 border border-white/10 rounded text-[10px] font-mono text-zinc-400 z-10 pointer-events-auto flex items-center space-x-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                governorState.tier === 'high'
                  ? '#10B981'
                  : governorState.tier === 'balanced'
                  ? '#3B82F6'
                  : governorState.tier === 'eco'
                  ? '#F59E0B'
                  : '#EF4444',
            }}
          />
          <span className="uppercase font-semibold text-zinc-200">
            {governorState.tier} ({governorState.effectiveFps} FPS)
          </span>
          <span>·</span>
          <span>{governorState.measuredFrameTimeMs.toFixed(1)} ms</span>
          <span>·</span>
          <span>Drift: [{governorState.driftX.toFixed(1)}, {governorState.driftY.toFixed(1)}]</span>
        </div>
      )}
    </div>
  );
};
