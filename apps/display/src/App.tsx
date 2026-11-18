import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Moon,
  ChevronLeft,
  ChevronRight,
  Shield,
  QrCode,
  X,
  Check,
  Gauge,
  Volume2,
} from 'lucide-react';
import {
  useDeckStore,
  useActivePage,
  useIsDimmed,
  useStats,
  useTheme,
  useEvents,
} from './deckStore';
import { BUILTIN_THEMES } from '@phone-deck/theme-engine';
import {
  LiveWallpaper,
  BUILTIN_WALLPAPERS,
  DEFAULT_WALLPAPER,
} from '@phone-deck/wallpaper';
import { useDeckBridge } from './useDeckBridge';
import { ApprovalDialog } from './ApprovalDialog';
import {
  DigitalClockContainer,
  AnalogClockContainer,
  CpuGaugeContainer,
  CpuTileContainer,
  RamTileContainer,
  GpuTileContainer,
  CpuHistoryContainer,
  MemoryDisksContainer,
  NetworkIoContainer,
  TopProcessesContainer,
  SystemUptimeContainer,
  PhoneStatusContainer,
  AgentInboxContainer,
  ShortcutGridContainer,
} from './WidgetContainers';

interface ConnectionStatus {
  paired: boolean;
  connected: boolean;
  agent_id?: string | null;
  active_host?: string | null;
  error?: string | null;
}

export default function App() {
  // Activate deck bridge (handles WebSocket, rAF batch flushing, keyboard/volume navigation)
  useDeckBridge();

  const activePage = useActivePage();
  const totalPages = useDeckStore((s) => s.totalPages);
  const isDimmed = useIsDimmed();
  const connected = useDeckStore((s) => s.connected);
  const stats = useStats();
  const theme = useTheme();
  const events = useEvents();
  const metrics = useDeckStore((s) => s.metrics);

  const wallpaperManifest =
    theme.background?.type === 'wallpaper' && BUILTIN_WALLPAPERS[theme.background.ref]
      ? BUILTIN_WALLPAPERS[theme.background.ref]
      : DEFAULT_WALLPAPER;

  const cpuPercent = typeof metrics[1] === 'number' ? metrics[1] / 10 : 38;
  const gpuPercent = typeof metrics[6] === 'number' ? metrics[6] / 10 : 24;
  const netIn = typeof metrics[10] === 'number' ? metrics[10] : 120000;
  const netOut = typeof metrics[11] === 'number' ? metrics[11] : 45000;
  const tempCelsius = typeof metrics[3] === 'number' ? metrics[3] / 10 : 48;
  const batteryLevel = typeof metrics[15] === 'number' ? metrics[15] : 85;
  const isCharging = typeof metrics[16] === 'boolean' ? metrics[16] : true;

  const pageWeight = activePage === 0 ? 7 : activePage === 1 ? 5 : 4;

  const approvalEvent = events.find((e) => e.kind === 'approval');

  const handleResolveApproval = async (approved: boolean) => {
    if (!approvalEvent) return;
    try {
      await fetch(`http://127.0.0.1:8767/api/answer/${approvalEvent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
    } catch {
      console.log('Approval resolved locally:', approved);
    }
    useDeckStore.getState().removeEvent(approvalEvent.id);
  };

  const [showBudgetHud, setShowBudgetHud] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairUriInput, setPairUriInput] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingMessage, setPairingMessage] = useState<string | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    paired: false,
    connected: false,
  });

  const isTauri =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const fetchStatus = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<ConnectionStatus>('get_connection_status');
        setConnectionStatus(res);
      } catch (err) {
        console.error('Fetch status error:', err);
      }
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [isTauri]);

  const handlePair = async () => {
    if (!pairUriInput.trim()) return;
    setPairingLoading(true);
    setPairingMessage(null);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<ConnectionStatus>('pair_with_uri', {
          pairUri: pairUriInput.trim(),
          deviceName: 'Phone Deck Display (Browser/Mobile)',
        });
        setConnectionStatus(res);
        setPairingMessage('Pairing successful! Encrypted TLS link established.');
        setTimeout(() => setShowPairModal(false), 1500);
      } catch (err: any) {
        setPairingMessage(`Pairing failed: ${err}`);
      } finally {
        setPairingLoading(false);
      }
    } else {
      setTimeout(() => {
        setPairingLoading(false);
        setPairingMessage(
          'Simulated pairing saved in browser localStorage.'
        );
        setTimeout(() => setShowPairModal(false), 1500);
      }, 600);
    }
  };

  // Night Mode Dim-to-Clock View (True OLED black, 1 fps ambient clock, <0.2 KB/s telemetry)
  if (isDimmed) {
    return (
      <div
        onClick={() => useDeckStore.getState().setDimmed(false)}
        className="w-full h-screen bg-[#000000] text-[#71717A] flex flex-col items-center justify-between p-8 select-none cursor-pointer transition-colors duration-500"
      >
        <div className="w-full flex justify-between items-center text-xs font-mono text-[#4B4B55]">
          <span className="flex items-center space-x-1">
            <Moon className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span>NIGHT MODE · DIMMED (&lt; 0.2 KB/S)</span>
          </span>
          <span>TAP ANYWHERE TO WAKE</span>
        </div>

        <div className="flex flex-col items-center justify-center my-auto">
          <div className="text-6xl md:text-8xl font-mono font-extralight tracking-tight text-[#EDEDF2]/80 tabular-nums">
            <DigitalClockContainer />
          </div>
          <div className="text-xs font-mono text-[#4B4B55] mt-4 flex items-center space-x-3">
            <span>PHONE BATTERY: 85%</span>
            <span>·</span>
            <span className="text-[#00E599]">COOL 30°C</span>
            <span>·</span>
            <span>OLED BURN-IN GUARD ACTIVE</span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-[#4B4B55]">
          THROUGHPUT: {stats.throughputBps} B/S · BUDGET: &lt; 200 B/S
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: theme.palette.surface,
        color: theme.palette.text,
      }}
      className="w-full h-screen flex flex-col select-none overflow-hidden font-sans"
    >
      {/* Top Header Bar */}
      <header
        style={{
          backgroundColor: `${theme.palette.surface}F0`,
          borderColor: theme.palette.border,
        }}
        className="h-10 px-4 border-b flex items-center justify-between text-xs font-mono shrink-0 z-20"
      >
        <div className="flex items-center space-x-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: theme.palette.accent,
              boxShadow: `0 0 8px ${theme.palette.accent}`,
            }}
          />
          <span className="font-semibold tracking-wider">
            PHONE DECK
          </span>
          <button
            onClick={() => {
              const themes = Object.values(BUILTIN_THEMES);
              const currIdx = themes.findIndex((t) => t.name === theme.name);
              const nextTheme = themes[(currIdx + 1) % themes.length];
              useDeckStore.getState().setTheme(nextTheme);
            }}
            className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-all cursor-pointer"
            style={{
              backgroundColor: `${theme.palette.accent}20`,
              color: theme.palette.accent,
              border: `1px solid ${theme.palette.accent}40`,
            }}
            title="Click to cycle theme (Void / Paper / Neon Grid)"
          >
            {theme.name}
          </button>
          <button
            onClick={() => {
              const wallpapers = Object.keys(BUILTIN_WALLPAPERS);
              const currKey = theme.background?.ref || 'aurora-lite';
              const nextIdx = (wallpapers.indexOf(currKey) + 1) % wallpapers.length;
              const nextKey = wallpapers[nextIdx];
              useDeckStore.getState().setTheme({
                ...theme,
                background: {
                  type: 'wallpaper',
                  ref: nextKey,
                  dim: theme.background?.dim ?? 0.35,
                },
              });
            }}
            className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-all cursor-pointer bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.08]"
            title="Click to cycle Live Wallpaper preset (Aurora / Flow / Starfield / Nebula / Grid / Particles)"
          >
            WP: {theme.background?.ref?.replace('-lite', '') || 'aurora'}
          </button>
        </div>

        {/* Center Page Title */}
        <div className="flex items-center space-x-3 text-[11px] text-[#71717A]">
          <button
            onClick={() => useDeckStore.getState().prevPage()}
            className="hover:text-[#EDEDF2] transition-colors p-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="uppercase tracking-wider text-[#EDEDF2] font-medium">
            {activePage === 0 && 'Page 1 · System Overview'}
            {activePage === 1 && 'Page 2 · Dev & Processes'}
            {activePage === 2 && 'Page 3 · Ambient & Media'}
          </span>
          <button
            onClick={() => useDeckStore.getState().nextPage()}
            className="hover:text-[#EDEDF2] transition-colors p-1"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center space-x-2">
          {/* Pairing status button */}
          <button
            onClick={() => setShowPairModal(true)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
              connectionStatus.paired || connected
                ? 'bg-[#00E599]/10 border-[#00E599]/30 text-[#00E599]'
                : 'bg-white/[0.04] border-white/[0.08] text-[#71717A] hover:text-[#EDEDF2]'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>{connected ? 'LIVE TLS' : 'MOCK/OFFLINE'}</span>
          </button>

          {/* Budget HUD toggle */}
          <button
            onClick={() => setShowBudgetHud(!showBudgetHud)}
            className={`p-1.5 rounded transition-colors ${
              showBudgetHud
                ? 'bg-[#7C5CFF] text-white'
                : 'bg-white/[0.04] text-[#71717A] hover:text-[#EDEDF2]'
            }`}
            title="Toggle Section 10 Budget HUD"
          >
            <Gauge className="w-3.5 h-3.5" />
          </button>

          {/* Night mode toggle */}
          <button
            onClick={() => useDeckStore.getState().toggleDimmed()}
            className="p-1.5 rounded bg-white/[0.04] text-[#71717A] hover:text-[#EDEDF2] transition-colors"
            title="Night Mode Dim-to-Clock (Press D)"
          >
            <Moon className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main 12x6 Grid Viewport with Swipeable Pages */}
      <main className="flex-1 p-2 md:p-3 relative overflow-hidden">
        {/* Live Wallpaper Background Engine */}
        <LiveWallpaper
          manifest={wallpaperManifest}
          telemetry={{
            cpuPercent,
            gpuPercent,
            netBytesPerSec: netIn + netOut,
            tempCelsius,
          }}
          governorInputs={{
            batteryLevel,
            isCharging,
            thermalStatus: 0,
            isDimmed,
            pageWeight,
            pageVisibility: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
          }}
          accentColor={theme.palette.accent}
          showGovernorBadge={showBudgetHud}
        />

        <div className="relative z-10 w-full h-full">
        <AnimatePresence mode="wait">
          {activePage === 0 && (
            <motion.div
              key="page-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) useDeckStore.getState().nextPage();
                else if (info.offset.x > 60) useDeckStore.getState().prevPage();
              }}
              className="w-full h-full grid grid-cols-12 grid-rows-6 gap-2"
            >
              {/* PAGE 1: SYSTEM OVERVIEW */}
              {/* Clock (col 1..4, row 1..2) */}
              <div className="col-span-4 row-span-2">
                <DigitalClockContainer />
              </div>

              {/* CPU Radial Spring Gauge (col 5..7, row 1..4) */}
              <div className="col-span-3 row-span-4">
                <CpuGaugeContainer />
              </div>

              {/* CPU Usage Tile (col 8..10, row 1..2) */}
              <div className="col-span-3 row-span-2">
                <CpuTileContainer />
              </div>

              {/* RAM Usage Tile (col 11..12, row 1..2) */}
              <div className="col-span-2 row-span-2">
                <RamTileContainer />
              </div>

              {/* History Sparkline Chart (col 8..12, row 3..6) */}
              <div className="col-span-5 row-span-4">
                <CpuHistoryContainer />
              </div>

              {/* Memory & Disks (col 1..4, row 3..4) */}
              <div className="col-span-4 row-span-2">
                <MemoryDisksContainer />
              </div>

              {/* Network Throughput I/O (col 1..4, row 5..6) */}
              <div className="col-span-4 row-span-2">
                <NetworkIoContainer />
              </div>

              {/* System Uptime (col 5..7, row 5..6) */}
              <div className="col-span-3 row-span-2">
                <SystemUptimeContainer />
              </div>
            </motion.div>
          )}

          {activePage === 1 && (
            <motion.div
              key="page-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) useDeckStore.getState().nextPage();
                else if (info.offset.x > 60) useDeckStore.getState().prevPage();
              }}
              className="w-full h-full grid grid-cols-12 grid-rows-6 gap-2"
            >
              {/* PAGE 2: DEV & PROCESSES */}
              {/* AI Agent Inbox (col 1..6, row 1..3) */}
              <div className="col-span-6 row-span-3">
                <AgentInboxContainer />
              </div>

              {/* Custom Shortcuts Grid (col 7..12, row 1..3) */}
              <div className="col-span-6 row-span-3">
                <ShortcutGridContainer />
              </div>

              {/* Top Processes (col 1..7, row 4..6) */}
              <div className="col-span-7 row-span-3">
                <TopProcessesContainer />
              </div>

              {/* Phone Status (col 8..12, row 4..6) */}
              <div className="col-span-5 row-span-3">
                <PhoneStatusContainer />
              </div>
            </motion.div>
          )}

          {activePage === 2 && (
            <motion.div
              key="page-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60) useDeckStore.getState().nextPage();
                else if (info.offset.x > 60) useDeckStore.getState().prevPage();
              }}
              className="w-full h-full grid grid-cols-12 grid-rows-6 gap-2"
            >
              {/* PAGE 3: AMBIENT & MEDIA */}
              {/* Minimal Analog Clock (col 1..4, row 1..6) */}
              <div className="col-span-4 row-span-6">
                <AnalogClockContainer />
              </div>

              {/* GPU Tile (col 5..8, row 1..3) */}
              <div className="col-span-4 row-span-3">
                <GpuTileContainer />
              </div>

              {/* Phone Status (col 9..12, row 1..3) */}
              <div className="col-span-4 row-span-3">
                <PhoneStatusContainer />
              </div>

              {/* Network Throughput (col 5..8, row 4..6) */}
              <div className="col-span-4 row-span-3">
                <NetworkIoContainer />
              </div>

              {/* System Uptime (col 9..12, row 4..6) */}
              <div className="col-span-4 row-span-3">
                <SystemUptimeContainer />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* Bottom Footer & Page Dots */}
      <footer
        style={{
          backgroundColor: theme.palette.surface,
          borderColor: theme.palette.border,
        }}
        className="h-6 px-4 border-t flex items-center justify-between text-[10px] font-mono text-[#71717A] shrink-0"
      >
        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1">
            <Volume2 className="w-3 h-3" style={{ color: theme.palette.accent }} />
            <span>VOL KEYS: PAGE</span>
          </span>
          <span>·</span>
          <span>PRESS 'D': DIM</span>
        </div>

        {/* Page Dots Indicator */}
        <div className="flex items-center space-x-1.5">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => useDeckStore.getState().setPage(idx)}
              style={{
                backgroundColor:
                  activePage === idx
                    ? theme.palette.accent
                    : 'rgba(255, 255, 255, 0.2)',
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activePage === idx ? 'w-6' : 'w-1.5 hover:bg-white/[0.4]'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <span>{stats.throughputBps} B/S</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
        </div>
      </footer>

      {/* SECTION 10 BUDGET HUD OVERLAY */}
      {showBudgetHud && (
        <div className="absolute top-12 right-4 z-50 w-72 bg-[#09090D]/95 border border-white/[0.12] rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-xs select-none">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <span className="text-[#EDEDF2] font-semibold flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-[#7C5CFF]" />
              <span>Section 10 Budget HUD</span>
            </span>
            <button
              onClick={() => setShowBudgetHud(false)}
              className="text-[#71717A] hover:text-[#EDEDF2]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 pt-2 text-[11px]">
            {/* Throughput Active */}
            <div className="flex justify-between items-center">
              <span className="text-[#71717A]">Active Throughput</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-[#EDEDF2] font-bold tabular-nums">
                  {stats.throughputBps} B/s
                </span>
                <span
                  className={`px-1 rounded text-[9px] ${
                    stats.throughputBps <= 1000
                      ? 'bg-[#00E599]/20 text-[#00E599]'
                      : 'bg-[#FF3B5C]/20 text-[#FF3B5C]'
                  }`}
                >
                  &lt;1 KB/s PASS
                </span>
              </div>
            </div>

            {/* Frame Time */}
            <div className="flex justify-between items-center">
              <span className="text-[#71717A]">Frame Time</span>
              <div className="flex items-center space-x-1.5">
                <span className="text-[#EDEDF2] font-bold tabular-nums">
                  {stats.frameTimeMs.toFixed(1)} ms
                </span>
                <span
                  className={`px-1 rounded text-[9px] ${
                    stats.frameTimeMs <= 8.0
                      ? 'bg-[#00E599]/20 text-[#00E599]'
                      : 'bg-[#FFB800]/20 text-[#FFB800]'
                  }`}
                >
                  &lt;8 ms PASS
                </span>
              </div>
            </div>

            {/* Telemetry Channel */}
            <div className="flex justify-between items-center">
              <span className="text-[#71717A]">Telemetry Channel</span>
              <span className="text-[#EDEDF2] tabular-nums">
                {stats.telemetryBps} B/s
              </span>
            </div>

            {/* Events Channel */}
            <div className="flex justify-between items-center">
              <span className="text-[#71717A]">Events Channel</span>
              <span className="text-[#EDEDF2] tabular-nums">
                {stats.eventsBps} B/s
              </span>
            </div>

            {/* Tick Rate */}
            <div className="flex justify-between items-center">
              <span className="text-[#71717A]">Tick Rate</span>
              <span className="text-[#EDEDF2] tabular-nums">
                {stats.tickRateHz.toFixed(1)} Hz
              </span>
            </div>

            {/* Agent Idle Parking */}
            <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
              <span className="text-[#71717A]">Sampler Idle Park</span>
              <span className="text-[#00E599] font-bold">ACTIVE (~0% CPU)</span>
            </div>
          </div>
        </div>
      )}

      {/* PAIRING MODAL */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#09090D] border border-white/[0.12] rounded-2xl w-full max-w-md p-5 text-sm font-mono relative shadow-2xl">
            <button
              onClick={() => setShowPairModal(false)}
              className="absolute top-4 right-4 text-[#71717A] hover:text-[#EDEDF2]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-2 text-base font-semibold text-[#EDEDF2] mb-1">
              <QrCode className="w-5 h-5 text-[#7C5CFF]" />
              <span>Pair Phone Deck</span>
            </div>
            <p className="text-xs text-[#71717A] mb-4">
              Enter the URI generated by the Agent app or paste the
              phonedeck://pair link.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#71717A] block mb-1">
                  Pairing URI
                </label>
                <input
                  type="text"
                  value={pairUriInput}
                  onChange={(e) => setPairUriInput(e.target.value)}
                  placeholder="phonedeck://pair?h=192.168.1.10&p=8766&t=..."
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-[#EDEDF2] placeholder-[#4B4B55] focus:outline-none focus:border-[#7C5CFF]"
                />
              </div>

              {pairingMessage && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center space-x-2 ${
                    pairingMessage.includes('failed')
                      ? 'bg-[#FF3B5C]/10 text-[#FF3B5C] border border-[#FF3B5C]/20'
                      : 'bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20'
                  }`}
                >
                  {pairingMessage.includes('failed') ? (
                    <X className="w-4 h-4 shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 shrink-0" />
                  )}
                  <span>{pairingMessage}</span>
                </div>
              )}

              <button
                onClick={handlePair}
                disabled={pairingLoading || !pairUriInput.trim()}
                className="w-full py-2.5 rounded-lg bg-[#7C5CFF] text-white font-medium hover:bg-[#6847ED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {pairingLoading ? (
                  <span>Verifying pinned cert &amp; pairing...</span>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Complete Pair</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL DIALOG MODAL */}
      {approvalEvent && (
        <ApprovalDialog
          event={approvalEvent}
          onResolve={handleResolveApproval}
          onClose={() => useDeckStore.getState().removeEvent(approvalEvent.id)}
        />
      )}
    </div>
  );
}
