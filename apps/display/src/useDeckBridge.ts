import { useEffect, useRef } from 'react';
import { decodeMsgPack, type AgentEvent } from '@phone-deck/ui-kit';
import { useDeckStore } from './deckStore';
import { useAmbientStore, registerAmbientSocketSender } from './ambientStore';

export function useDeckBridge(wsUrl: string = 'ws://127.0.0.1:8765/ws') {
  const socketRef = useRef<WebSocket | null>(null);
  const pendingUpdatesRef = useRef<Record<number, any>>({});
  const bytesWindowRef = useRef<{ bytes: number; timestamp: number; channel: number }[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    let active = true;

    // Hardware light sensor & schedule initialization
    const cleanupSensor = useAmbientStore.getState().initHardwareSensor();
    useAmbientStore.getState().evaluateSchedule();
    const scheduleInterval = setInterval(() => {
      useAmbientStore.getState().evaluateSchedule();
    }, 30_000);

    // 1. One shared requestAnimationFrame loop that pushes ONE batched update per animation frame
    const flushBatchLoop = (now: number) => {
      if (!active) return;

      const frameDelta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      // Stop processing telemetry if in dark mode (heartbeat profile only)
      const ambientState = useAmbientStore.getState().state;
      const isDark = ambientState === 'dark' || ambientState === 'locked_dark';

      // Flush batched updates if any arrived and not dark
      const keys = Object.keys(pendingUpdatesRef.current);
      if (keys.length > 0) {
        if (!isDark) {
          const batch = { ...pendingUpdatesRef.current };
          pendingUpdatesRef.current = {};
          useDeckStore.getState().applyMetricBatch(batch);
        } else {
          pendingUpdatesRef.current = {};
        }
      }

      // Update frame time stat
      useDeckStore.getState().updateStats({
        frameTimeMs: Math.max(0.5, Math.min(16.6, frameDelta)),
      });

      // Stop rAF loop if document is hidden to conserve 100% battery
      if (!document.hidden) {
        animFrameIdRef.current = requestAnimationFrame(flushBatchLoop);
      } else {
        animFrameIdRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && !animFrameIdRef.current) {
        lastFrameTimeRef.current = performance.now();
        animFrameIdRef.current = requestAnimationFrame(flushBatchLoop);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animFrameIdRef.current = requestAnimationFrame(flushBatchLoop);

    // 2. Volume-key paging and keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useDeckStore.getState();
      if (!state.volumeKeyPaging) return;

      if (e.key === 'VolumeUp' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        state.nextPage();
      } else if (e.key === 'VolumeDown' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        state.prevPage();
      } else if (e.key === 'd' || e.key === 'D') {
        state.toggleDimmed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 3. Socket networking
    const connect = () => {
      if (!active) return;
      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        socketRef.current = ws;

        registerAmbientSocketSender((msg) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
          }
        });

        ws.onopen = () => {
          if (!active) return;
          useDeckStore.getState().setConnected(true);

          // Announce initial display state (ambient profile subscription)
          const ambientState = useAmbientStore.getState().state;
          const isDark = ambientState === 'dark' || ambientState === 'locked_dark';
          try {
            ws.send(JSON.stringify({
              type: 'display_state',
              state: isDark ? 'dark' : 'bright',
              ambient_state: ambientState,
            }));
          } catch {
            // ignore initial state error
          }
        };

        ws.onclose = () => {
          if (!active) return;
          useDeckStore.getState().setConnected(false);
          // Exponential reconnect with jitter
          setTimeout(connect, 2000 + Math.random() * 1000);
        };

        ws.onerror = () => {
          ws.close();
        };

        ws.onmessage = (event) => {
          if (!active || !(event.data instanceof ArrayBuffer)) return;
          try {
            const decoded = decodeMsgPack(event.data);
            if (!Array.isArray(decoded) || decoded.length < 3) return;

            const [channel, , payload] = decoded;
            const now = performance.now();
            const byteLen = event.data.byteLength;

            // Track rolling 1000ms throughput
            bytesWindowRef.current.push({ bytes: byteLen, timestamp: now, channel });
            bytesWindowRef.current = bytesWindowRef.current.filter((e) => now - e.timestamp <= 1000);

            const totalBytes = bytesWindowRef.current.reduce((acc, e) => acc + e.bytes, 0);
            const telBytes = bytesWindowRef.current
              .filter((e) => e.channel === 1)
              .reduce((acc, e) => acc + e.bytes, 0);
            const evtBytes = bytesWindowRef.current
              .filter((e) => e.channel === 2)
              .reduce((acc, e) => acc + e.bytes, 0);
            const tickRate = bytesWindowRef.current.filter((e) => e.channel === 1).length;

            useDeckStore.getState().updateStats({
              throughputBps: totalBytes,
              telemetryBps: telBytes,
              eventsBps: evtBytes,
              tickRateHz: tickRate,
            });

            const ambientState = useAmbientStore.getState().state;
            const isDark = ambientState === 'dark' || ambientState === 'locked_dark';

            // Channel 1: Telemetry (queue into pendingUpdatesRef for next rAF batch, dropped in dark mode)
            if (channel === 1 && payload) {
              if (!isDark) {
                const updates = payload.updates || payload;
                if (typeof updates === 'object' && updates !== null) {
                  Object.assign(pendingUpdatesRef.current, updates);
                }
              }
            }

            // Channel 2: Events (reliable, add directly)
            if (channel === 2 && payload) {
              const agentEvt = payload as AgentEvent;
              useDeckStore.getState().addEvent(agentEvt);

              // Notify Ambient Night Clock mode of incoming agent event
              useAmbientStore.getState().triggerEventAlert(agentEvt.kind);

              // Wake dimmed screen for tasks/approvals per plan.md section 6.4 (if not locked in night dark)
              if (useDeckStore.getState().isDimmed && !isDark) {
                useDeckStore.getState().setDimmed(false);
              }

              // Trigger distinct vibration patterns per event kind
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                  if (agentEvt.kind === 'approval') {
                    navigator.vibrate([200, 100, 200, 100, 200]);
                  } else if (agentEvt.kind === 'done') {
                    navigator.vibrate([100, 50, 100]);
                  } else if (agentEvt.kind === 'error') {
                    navigator.vibrate([300, 100, 300]);
                  }
                } catch {
                  // Ignore vibration errors if not supported or disabled
                }
              }
            }
          } catch (err) {
            console.error('Failed to decode packet:', err);
          }
        };
      } catch (e) {
        console.error('Socket init error:', e);
      }
    };

    connect();

    return () => {
      active = false;
      cleanupSensor();
      clearInterval(scheduleInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [wsUrl]);
}
