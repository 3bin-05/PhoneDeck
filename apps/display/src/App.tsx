import { useState, useEffect } from 'react';
import { Cpu, HardDrive, Wifi, Sparkles, BatteryCharging, Activity, Radio, AlertTriangle } from 'lucide-react';
import { useDeckSocket } from './useDeckSocket';

export default function App() {
  const [time, setTime] = useState('');
  const [isBrowserFrame, setIsBrowserFrame] = useState(false);
  const { connected, telemetry, latestEvent, bytesPerSec } = useDeckSocket();

  useEffect(() => {
    // Detect if running inside desktop browser (simulate 780x360 frame) vs native fullscreen mobile
    const checkViewport = () => {
      setIsBrowserFrame(window.innerWidth > 850);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const deckScreen = (
    <div className="relative w-full h-full bg-[#000000] text-[#EDEDF2] overflow-hidden select-none flex flex-col justify-between p-3.5">
      {/* Background Aurora Glow */}
      <div className="absolute inset-0 bg-radial-[circle_at_top_right] from-[#7C5CFF]/15 via-transparent to-transparent pointer-events-none" />

      {/* Top Deck Bar */}
      <div className="flex items-center justify-between z-10 border-b border-white/[0.08] pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected
                ? 'bg-[#00E599] shadow-[0_0_8px_#00E599]'
                : 'bg-[#FFB800] shadow-[0_0_8px_#FFB800] animate-pulse'
            }`}
          />
          <span className="font-mono text-[11px] font-semibold tracking-wider text-[#EDEDF2] uppercase flex items-center gap-1.5">
            PHONE DECK <span className="text-[#7C5CFF]">VOID</span>
            <span
              className={`text-[9px] px-1.5 py-0.2 rounded font-normal ${
                connected
                  ? 'bg-[#00E599]/15 text-[#00E599]'
                  : 'bg-[#FFB800]/15 text-[#FFB800]'
              }`}
            >
              {connected ? 'LIVE' : 'CONNECTING...'}
            </span>
          </span>
          <span className="text-[10px] font-mono text-[#71717A] px-1.5 py-0.5 rounded bg-white/[0.04]">
            PAGE 1/2
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-[#71717A]">
          <span className="flex items-center gap-1 text-[#00E599]">
            <Radio className="w-3 h-3 text-[#00E599]" />
            <span>{bytesPerSec > 0 ? `${bytesPerSec} B/s` : '< 0.3 KB/s'}</span>
          </span>
          <span className="flex items-center gap-1 text-[#71717A]">
            <Wifi className="w-3 h-3 text-[#7C5CFF]" />
            <span>{telemetry.netThroughputKb} KB/s</span>
          </span>
          <span className="flex items-center gap-1 text-[#EDEDF2]">
            <BatteryCharging className="w-3 h-3 text-[#7C5CFF]" />
            <span>{telemetry.pcBatteryPct}%</span>
          </span>
          <span>{telemetry.cpuTempC}°C</span>
        </div>
      </div>

      {/* Main Grid: 12-column Deck Layout */}
      <div className="grid grid-cols-12 gap-2.5 flex-1 py-2 z-10 min-h-0">
        {/* Widget 1: Digital Clock (Huge Tabular Numerals) */}
        <div className="col-span-3 rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#71717A]">
            SYSTEM TIME
          </div>
          <div className="font-mono text-3xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {time || '10:58:00'}
          </div>
          <div className="text-[10px] font-mono text-[#71717A]">
            UPTIME {formatUptime(telemetry.uptimeSeconds)}
          </div>
        </div>

        {/* Widget 2: CPU Metric */}
        <div className="col-span-2 rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#71717A]">
            <span>CPU</span>
            <Cpu className="w-3 h-3 text-[#7C5CFF]" />
          </div>
          <div className="font-mono text-3xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {telemetry.cpuPct}
            <span className="text-sm text-[#71717A]">%</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717A] truncate">
            {(telemetry.cpuFreqMhz / 1000).toFixed(1)} GHz · {telemetry.cpuTempC}°C
          </div>
        </div>

        {/* Widget 3: RAM Metric */}
        <div className="col-span-2 rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#71717A]">
            <span>RAM</span>
            <HardDrive className="w-3 h-3 text-[#7C5CFF]" />
          </div>
          <div className="font-mono text-3xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {telemetry.ramPct}
            <span className="text-sm text-[#71717A]">%</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717A] truncate">
            {telemetry.ramUsedGb} / {telemetry.ramTotalGb} GB
          </div>
        </div>

        {/* Widget 4: GPU Metric */}
        <div className="col-span-2 rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#71717A]">
            <span>GPU</span>
            <Activity className="w-3 h-3 text-[#7C5CFF]" />
          </div>
          <div className="font-mono text-3xl font-light tracking-tighter tabular-nums text-[#EDEDF2]">
            {telemetry.gpuPct}
            <span className="text-sm text-[#71717A]">%</span>
          </div>
          <div className="text-[10px] font-mono text-[#71717A] truncate">
            {telemetry.gpuTempC}°C
          </div>
        </div>

        {/* Widget 5: AI Agent Hub "Done" / "Approval" Card */}
        <div
          className={`col-span-3 rounded-xl p-3 flex flex-col justify-between relative overflow-hidden transition-all ${
            latestEvent?.kind === 'approval'
              ? 'bg-[#141006] border border-[#FFB800]/40 shadow-[0_0_15px_rgba(255,184,0,0.15)]'
              : 'bg-[#08080E] border border-[#7C5CFF]/30 shadow-[0_0_15px_rgba(124,92,255,0.12)]'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase">
            <span
              className={`font-semibold flex items-center gap-1 ${
                latestEvent?.kind === 'approval' ? 'text-[#FFB800]' : 'text-[#7C5CFF]'
              }`}
            >
              {latestEvent?.kind === 'approval' ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {latestEvent?.kind === 'approval' ? 'APPROVAL NEEDED' : 'AI AGENT INBOX'}
            </span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase ${
                latestEvent?.kind === 'approval'
                  ? 'bg-[#FFB800]/20 text-[#FFB800]'
                  : 'bg-[#7C5CFF]/20 text-[#7C5CFF]'
              }`}
            >
              {latestEvent?.kind || 'IDLE'}
            </span>
          </div>

          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[#EDEDF2] truncate">
              {latestEvent ? latestEvent.title : 'No active sessions'}
            </div>
            <div className="font-mono text-[10px] text-[#71717A] truncate">
              {latestEvent?.stats
                ? `${latestEvent.project} · ${latestEvent.stats.files_changed} files · +${latestEvent.stats.insertions} −${latestEvent.stats.deletions}`
                : latestEvent?.summary || 'Waiting for agent events...'}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
            {latestEvent?.actions && latestEvent.actions.length > 0 ? (
              latestEvent.actions.slice(0, 2).map((act, i) => (
                <button
                  key={act}
                  className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${
                    i === 0
                      ? latestEvent.kind === 'approval'
                        ? 'bg-[#FFB800] text-black hover:bg-[#E6A600]'
                        : 'bg-[#7C5CFF] text-white hover:bg-[#6C4CEF]'
                      : 'bg-white/[0.06] text-[#EDEDF2] hover:bg-white/[0.1]'
                  }`}
                >
                  {act === 'open_editor'
                    ? 'Editor'
                    : act === 'open_folder'
                    ? 'Folder'
                    : act === 'approve'
                    ? 'Approve'
                    : act === 'deny'
                    ? 'Deny'
                    : act}
                </button>
              ))
            ) : (
              <span className="text-[10px] font-mono text-[#71717A]">
                deck-mock linked
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Deck Navigation Dots & Action shortcut row */}
      <div className="flex items-center justify-between z-10 border-t border-white/[0.08] pt-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-full bg-[#7C5CFF]" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/[0.15]" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/[0.15]" />
        </div>

        <div className="flex items-center gap-2">
          {['Dev', 'Media', 'Rules', 'Lock'].map((tile) => (
            <button
              key={tile}
              className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[10px] font-mono text-[#EDEDF2] transition-all"
            >
              {tile}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // If viewed on desktop browser, present in a 780x360 phone frame preview
  if (isBrowserFrame) {
    return (
      <div className="w-screen h-screen bg-[#050508] flex flex-col items-center justify-center p-4">
        <div className="mb-3 flex items-center gap-3 text-xs font-mono text-[#71717A]">
          <span>Phone Deck Display Desktop Preview (~780x360 CSS px)</span>
          <button
            onClick={() => setIsBrowserFrame(false)}
            className="px-2 py-0.5 rounded bg-white/[0.08] text-[#EDEDF2] hover:bg-white/[0.15]"
          >
            Toggle Fullscreen
          </button>
        </div>

        {/* Landscape Phone Bezel */}
        <div
          className="relative rounded-[28px] border-4 border-[#1F1F28] p-2 bg-[#000000] shadow-[0_0_60px_rgba(0,0,0,0.8)]"
          style={{ width: '780px', height: '360px' }}
        >
          <div className="w-full h-full rounded-[20px] overflow-hidden">
            {deckScreen}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#000000]">
      {deckScreen}
    </div>
  );
}
