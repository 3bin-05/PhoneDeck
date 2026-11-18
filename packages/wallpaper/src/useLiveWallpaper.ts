import { useEffect, useRef, useState } from 'react';
import {
  WallpaperManifest,
  GovernorInputs,
  GovernorState,
  TelemetryUniforms,
} from './types';
import { WallpaperGovernor } from './governor';
import { ShaderRenderer } from './renderers/ShaderRenderer';
import { ParticleRenderer } from './renderers/ParticleRenderer';
import { StaticKenBurnsRenderer } from './renderers/StaticKenBurnsRenderer';
import { ParallaxManager } from './renderers/ParallaxManager';

export interface UseLiveWallpaperProps {
  manifest: WallpaperManifest;
  telemetry: {
    cpuPercent: number;
    gpuPercent?: number;
    netBytesPerSec?: number;
    tempCelsius?: number;
  };
  governorInputs: GovernorInputs;
  accentColor: string;
}

export function useLiveWallpaper({
  manifest,
  telemetry,
  governorInputs,
  accentColor,
}: UseLiveWallpaperProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const governorRef = useRef<WallpaperGovernor>(new WallpaperGovernor('balanced'));
  const shaderRendererRef = useRef<ShaderRenderer | null>(null);
  const particleRendererRef = useRef<ParticleRenderer | null>(null);
  const staticRendererRef = useRef<StaticKenBurnsRenderer | null>(null);
  const parallaxRef = useRef<ParallaxManager>(new ParallaxManager());

  const [governorState, setGovernorState] = useState<GovernorState>(() =>
    governorRef.current.getState()
  );

  // Smoothed telemetry uniforms
  const smoothedTelemetryRef = useRef<TelemetryUniforms>({
    cpu: 0.1,
    gpu: 0.1,
    net: 0.0,
    temp: 0.2,
  });

  // Keep latest props in refs to avoid restarting RAF loop
  const latestProps = useRef({ manifest, telemetry, governorInputs, accentColor });
  useEffect(() => {
    latestProps.current = { manifest, telemetry, governorInputs, accentColor };
  }, [manifest, telemetry, governorInputs, accentColor]);

  // Initialize renderers and parallax
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    parallaxRef.current.start();

    if (manifest.type === 'shader') {
      const renderer = new ShaderRenderer(canvas);
      if (manifest.assets?.fragmentShader) {
        renderer.setFragmentShader(manifest.assets.fragmentShader);
      }
      shaderRendererRef.current = renderer;
    } else if (manifest.type === 'particles') {
      particleRendererRef.current = new ParticleRenderer(canvas);
    } else if (manifest.type === 'static-ken-burns') {
      const staticR = new StaticKenBurnsRenderer(canvas);
      if (manifest.assets?.image) {
        staticR.setImage(manifest.assets.image);
      }
      staticRendererRef.current = staticR;
    }

    return () => {
      parallaxRef.current.stop();
      shaderRendererRef.current?.dispose();
      particleRendererRef.current?.dispose();
      staticRendererRef.current?.dispose();
      shaderRendererRef.current = null;
      particleRendererRef.current = null;
      staticRendererRef.current = null;
    };
  }, [manifest.id, manifest.type]);

  // Main Governor & RAF render loop
  useEffect(() => {
    let animId: number;
    let lastRenderTime = performance.now();
    const startTime = performance.now();

    const loop = (timestamp: number) => {
      const {
        manifest: currentManifest,
        telemetry: currentTelem,
        governorInputs: currentInputs,
        accentColor: currentAccent,
      } = latestProps.current;

      const governor = governorRef.current;

      // 1. Update Governor state
      const state = governor.update(currentInputs);
      setGovernorState(state);

      // If hidden or completely stopped, reschedule check with long timeout
      if (!currentInputs.pageVisibility) {
        return; // Page visibility event listener will restart loop
      }

      // Frame interval capping (e.g. 33.3ms for 30fps, 41.6ms for 24fps, 83.3ms for 12fps)
      const targetInterval = state.effectiveFps > 0 ? 1000 / state.effectiveFps : Infinity;
      const elapsedSinceLastRender = timestamp - lastRenderTime;

      if (state.tier === 'static') {
        // Render one final resting frame in static mode then don't render again until waking
        renderFrame(timestamp, state, currentManifest, currentAccent);
        return;
      }

      if (elapsedSinceLastRender >= targetInterval - 1.5) {
        lastRenderTime = timestamp;
        const frameStart = performance.now();

        // 2. Smooth live telemetry
        smoothTelemetry(currentTelem);

        // 3. Render frame
        renderFrame(timestamp, state, currentManifest, currentAccent);

        const frameDuration = performance.now() - frameStart;
        governor.recordFrame(frameDuration);
      }

      animId = requestAnimationFrame(loop);
    };

    const renderFrame = (
      now: number,
      state: GovernorState,
      currentManifest: WallpaperManifest,
      currentAccent: string
    ) => {
      const timeSec = (now - startTime) / 1000;
      const telem = smoothedTelemetryRef.current;
      const drift = { x: state.driftX, y: state.driftY };
      const dim = currentManifest.dim ?? 0.35;

      if (currentManifest.type === 'shader' && shaderRendererRef.current) {
        shaderRendererRef.current.render(
          timeSec,
          state.scale,
          telem,
          drift,
          dim,
          currentAccent
        );
      } else if (currentManifest.type === 'particles' && particleRendererRef.current) {
        particleRendererRef.current.render(
          state.scale,
          telem,
          drift,
          dim,
          currentAccent
        );
      } else if (currentManifest.type === 'static-ken-burns' && staticRendererRef.current) {
        staticRendererRef.current.render(
          timeSec,
          state.scale,
          dim,
          drift
        );
      }
    };

    const smoothTelemetry = (t: {
      cpuPercent: number;
      gpuPercent?: number;
      netBytesPerSec?: number;
      tempCelsius?: number;
    }) => {
      const curr = smoothedTelemetryRef.current;

      // Target normalized metrics
      const targetCpu = Math.min(1.0, Math.max(0.0, t.cpuPercent / 100));
      const targetGpu = t.gpuPercent !== undefined ? Math.min(1.0, Math.max(0.0, t.gpuPercent / 100)) : targetCpu * 0.8;

      // Net: log-scaled (0 B/s to 10 MB/s mapped to 0.0 - 1.0)
      const netBps = t.netBytesPerSec || 0;
      const targetNet = netBps > 1000 ? Math.min(1.0, Math.log10(netBps / 1000) / 4.0) : 0.0;

      // Temp: 35C to 85C mapped to 0.0 - 1.0
      const tempC = t.tempCelsius || 45;
      const targetTemp = Math.min(1.0, Math.max(0.0, (tempC - 35) / 50));

      // Critically damped exponential moving average
      curr.cpu = curr.cpu * 0.9 + targetCpu * 0.1;
      curr.gpu = curr.gpu * 0.9 + targetGpu * 0.1;
      curr.net = curr.net * 0.85 + targetNet * 0.15;
      curr.temp = curr.temp * 0.95 + targetTemp * 0.05;
    };

    animId = requestAnimationFrame(loop);

    // Visibility change handler to resume when waking up
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        governorRef.current.reset();
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(loop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [manifest.id, governorInputs.isDimmed, governorInputs.pageVisibility]);

  return {
    canvasRef,
    containerRef,
    governorState,
  };
}
