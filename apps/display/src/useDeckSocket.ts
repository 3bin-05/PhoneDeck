import { useState, useEffect, useRef, useCallback } from 'react';
import { decodeMsgPack, FIELD_IDS, type AgentEvent } from '@phone-deck/ui-kit';

export interface TelemetryData {
  cpuPct: number;
  cpuFreqMhz: number;
  cpuTempC: number;
  ramPct: number;
  ramUsedGb: number;
  ramTotalGb: number;
  gpuPct: number;
  gpuTempC: number;
  netThroughputKb: number;
  uptimeSeconds: number;
  pcBatteryPct: number;
  pcBatteryCharging: boolean;
  mediaPlaying: boolean;
  mediaTitle: string;
  mediaArtist: string;
}

const DEFAULT_TELEMETRY: TelemetryData = {
  cpuPct: 38.0,
  cpuFreqMhz: 4200,
  cpuTempC: 48.0,
  ramPct: 52.0,
  ramUsedGb: 16.6,
  ramTotalGb: 32.0,
  gpuPct: 24.0,
  gpuTempC: 55.0,
  netThroughputKb: 0.24,
  uptimeSeconds: 14200,
  pcBatteryPct: 82,
  pcBatteryCharging: true,
  mediaPlaying: true,
  mediaTitle: 'Selected Ambient Works',
  mediaArtist: 'Aphex Twin',
};

export function useDeckSocket(wsUrl: string = 'ws://127.0.0.1:8765/ws') {
  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryData>(DEFAULT_TELEMETRY);
  const [latestEvent, setLatestEvent] = useState<AgentEvent | null>(null);
  const [bytesPerSec, setBytesPerSec] = useState<number>(0);
  const [packetCount, setPacketCount] = useState<number>(0);

  const rawStateRef = useRef<Record<number, any>>({});
  const bytesWindowRef = useRef<{ bytes: number; timestamp: number }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  const handleMessage = useCallback((data: ArrayBuffer) => {
    try {
      const decoded = decodeMsgPack(data);
      if (!Array.isArray(decoded) || decoded.length < 3) return;

      const [channel, , payload] = decoded;

      // Track throughput
      const now = performance.now();
      bytesWindowRef.current.push({ bytes: data.byteLength, timestamp: now });
      // Keep trailing 1000ms window
      bytesWindowRef.current = bytesWindowRef.current.filter((entry) => now - entry.timestamp <= 1000);
      const totalBytes = bytesWindowRef.current.reduce((acc, entry) => acc + entry.bytes, 0);
      setBytesPerSec(totalBytes);
      setPacketCount((c) => c + 1);

      // Channel 1 = Telemetry (lossy, latest-wins, delta-encoded)
      if (channel === 1 && payload) {
        const updates = payload.updates || payload;
        if (typeof updates === 'object' && updates !== null) {
          for (const [k, v] of Object.entries(updates)) {
            const fieldId = Number(k);
            if (v === null) {
              delete rawStateRef.current[fieldId];
            } else {
              rawStateRef.current[fieldId] = v;
            }
          }

          const raw = rawStateRef.current;
          const cpuRaw = raw[FIELD_IDS.CpuTotal] ?? 380;
          const cpuFreq = raw[FIELD_IDS.CpuFreqMhz] ?? 4200;
          const cpuTemp = raw[FIELD_IDS.CpuTempC] ?? 480;
          const ramUsed = raw[FIELD_IDS.RamUsedBytes] ?? 17_000_000_000;
          const ramTotal = raw[FIELD_IDS.RamTotalBytes] ?? 34_359_738_368;
          const gpuUsage = raw[FIELD_IDS.GpuUsage] ?? 240;
          const gpuTemp = raw[FIELD_IDS.GpuTempC] ?? 550;
          const netIn = raw[FIELD_IDS.NetInBytesSec] ?? 120_000;
          const netOut = raw[FIELD_IDS.NetOutBytesSec] ?? 30_000;
          const uptime = raw[FIELD_IDS.UptimeSeconds] ?? 14200;
          const battery = raw[FIELD_IDS.PcBatteryPct] ?? 82;
          const charging = raw[FIELD_IDS.PcBatteryCharging] ?? true;
          const playing = raw[FIELD_IDS.MediaPlaying] ?? true;
          const title = raw[FIELD_IDS.MediaTitle] ?? 'Selected Ambient Works';
          const artist = raw[FIELD_IDS.MediaArtist] ?? 'Aphex Twin';

          const ramUsedGb = Number((ramUsed / (1024 * 1024 * 1024)).toFixed(1));
          const ramTotalGb = Number((ramTotal / (1024 * 1024 * 1024)).toFixed(1));
          const ramPct = Math.round((ramUsed / (ramTotal || 1)) * 100);

          setTelemetry({
            cpuPct: Number((cpuRaw / 10).toFixed(1)),
            cpuFreqMhz: cpuFreq,
            cpuTempC: Number((cpuTemp / 10).toFixed(1)),
            ramPct,
            ramUsedGb,
            ramTotalGb,
            gpuPct: Number((gpuUsage / 10).toFixed(1)),
            gpuTempC: Number((gpuTemp / 10).toFixed(1)),
            netThroughputKb: Number(((netIn + netOut) / 1024).toFixed(1)),
            uptimeSeconds: uptime,
            pcBatteryPct: battery,
            pcBatteryCharging: charging,
            mediaPlaying: playing,
            mediaTitle: title,
            mediaArtist: artist,
          });
        }
      }

      // Channel 2 = Events (reliable, ordered)
      if (channel === 2 && payload) {
        let event: AgentEvent;
        if (Array.isArray(payload)) {
          event = {
            id: payload[0],
            ts: payload[1],
            agent: payload[2],
            project: payload[3],
            cwd: payload[4],
            kind: payload[5],
            title: payload[6],
            summary: payload[7],
            stats: payload[8]
              ? Array.isArray(payload[8])
                ? {
                    duration_s: payload[8][0],
                    files_changed: payload[8][1],
                    insertions: payload[8][2],
                    deletions: payload[8][3],
                  }
                : payload[8]
              : undefined,
            actions: payload[9] || [],
            expires_at: payload[10] || undefined,
          };
        } else {
          event = payload as AgentEvent;
        }
        setLatestEvent(event);
      }
    } catch (err) {
      console.error('[deck-socket] Error decoding MessagePack packet:', err);
    }
  }, []);

  useEffect(() => {
    let unmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (unmounted) return;
      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        socketRef.current = ws;

        ws.onopen = () => {
          if (unmounted) {
            ws.close();
            return;
          }
          setConnected(true);
          console.log(`[deck-socket] Connected to ${wsUrl}`);
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            handleMessage(event.data);
          } else if (event.data instanceof Blob) {
            event.data.arrayBuffer().then((buffer) => handleMessage(buffer));
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setConnected(false);
          reconnectTimeout = setTimeout(connect, 1500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [wsUrl, handleMessage]);

  return {
    connected,
    telemetry,
    latestEvent,
    bytesPerSec,
    packetCount,
  };
}
