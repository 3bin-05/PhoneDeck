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
  ShieldAlert,
  Download,
  Sparkles,
  Layers,
} from 'lucide-react';
import { PairingView } from './PairingView';
import { GlassDashboardView } from './GlassDashboardView';
import { useUpdaterStore } from './updaterStore';
import {
  useDeckStore,
  useActivePage,
  useIsDimmed,
  useStats,
  useTheme,
  useEvents,
} from './deckStore';
import { useAmbientStore } from './ambientStore';
import { NightClockView } from './NightClockView';
import { BUILTIN_THEMES } from '@phone-deck/theme-engine';
import {
  LiveWallpaper,
  BUILTIN_WALLPAPERS,
  DEFAULT_WALLPAPER,
} from '@phone-deck/wallpaper';
import {
  useDeckBridge,
  sendMediaAction,
  sendMediaVolume,
} from './useDeckBridge';
import { ApprovalDialog } from './ApprovalDialog';
import {
  DigitalClockContainer,
  CpuGaugeContainer,
  CpuTileContainer,
  RamTileContainer,
  CpuHistoryContainer,
  MemoryDisksContainer,
  NetworkIoContainer,
  SystemUptimeContainer,
  AgentInboxContainer,
  ShortcutGridContainer,
  NowPlayingLargeContainer,
  MiniNowPlayingContainer,
  VinylPlayerContainer,
  AppCardContainer,
  AppDockContainer,
  AiSessionsContainer,
  AiQuotasContainer,
  QuotaRingContainer,
  AudioMixerContainer,
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

  const isPcUpdating = useUpdaterStore((s) => s.isPcUpdating);
  const pcUpdatingEtaSec = useUpdaterStore((s) => s.pcUpdatingEtaSec);
  const updaterStatus = useUpdaterStore((s) => s.status);

  useEffect(() => {
    return useUpdaterStore.getState().initUpdater();
  }, []);

  useEffect(() => {
    const handleActivity = () => {
      useAmbientStore.getState().extendPeek();
    };
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

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

  const ambientState = useAmbientStore((s) => s.state);

  // Part A: Ambient-Light "Night Clock" Mode (Pure #000000 OLED, phone clock, heartbeat-only telemetry)
  if (ambientState === 'dark' || ambientState === 'locked_dark' || isDimmed) {
    return (
      <NightClockView
        onTap={() => {
          if (isDimmed) useDeckStore.getState().setDimmed(false);
          useAmbientStore.getState().handleSingleTap();
        }}
        onDoubleTap={() => {
          if (isDimmed) useDeckStore.getState().setDimmed(false);
          useAmbientStore.getState().handleDoubleTap();
        }}
      />
    );
  }

  // Part B: Unpaired / Connecting Setup Screen (never fake mock data on cold start)
  if (!isDemoMode && (!connectionStatus.paired || (!connectionStatus.connected && !connected))) {
    return (
      <PairingView
        paired={connectionStatus.paired}
        connected={connected || connectionStatus.connected}
        agentId={connectionStatus.agent_id}
        activeHost={connectionStatus.active_host}
        error={connectionStatus.error}
        onPair={async (uri) => {
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const res = await invoke<ConnectionStatus>('pair_with_uri', {
                pairUri: uri,
                deviceName: 'Phone Deck Display (Mobile)',
              });
              setConnectionStatus(res);
              return res.paired;
            } catch (err: any) {
              setConnectionStatus((prev) => ({ ...prev, error: String(err) }));
              return false;
            }
          } else {
            setConnectionStatus({ paired: true, connected: true, agent_id: 'phone-deck-pc' });
            return true;
          }
        }}
        onUnpair={async () => {
          if (isTauri) {
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('unpair_device');
              setConnectionStatus({ paired: false, connected: false });
            } catch (err) {
              console.error('Unpair error:', err);
            }
          } else {
            setConnectionStatus({ paired: false, connected: false });
          }
        }}
        onEnterDemo={() => setIsDemoMode(true)}
      />
    );
  }

  return (
    <div
      style={{
        backgroundColor: theme.palette.surface,
        color: theme.palette.text,
      }}
      className={`w-full h-screen flex flex-col select-none overflow-hidden font-sans theme-${theme.name}`}
    >
      {/* Peek Mode Banner */}
      {ambientState === 'peek' && (
        <div className="h-7 bg-amber-500/10 border-b border-amber-500/20 px-4 flex items-center justify-between text-[11px] font-mono text-amber-300 z-30 shrink-0">
          <span className="flex items-center space-x-1.5">
            <Moon className="w-3.5 h-3.5" />
            <span>STEAM DECK MODE (NIGHT AWAKE)</span>
          </span>
          <button
            onClick={() => useAmbientStore.getState().handleSingleTap()}
            className="text-[10px] uppercase font-semibold text-amber-200 hover:text-white px-2 py-0.5 rounded bg-amber-500/20 cursor-pointer"
          >
            RETURN TO CLOCK ✕
          </button>
        </div>
      )}

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="h-7 bg-amber-500/15 border-b border-amber-500/30 px-4 flex items-center justify-between text-[11px] font-mono text-amber-300 z-30 shrink-0">
          <span className="flex items-center space-x-1.5 font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DEMO MODE (OFFLINE MOCK DATA)</span>
          </span>
          <button
            onClick={() => setIsDemoMode(false)}
            className="text-[10px] uppercase font-semibold text-amber-200 hover:text-white px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 cursor-pointer border border-amber-500/30"
          >
            CONNECT TO PC &rarr;
          </button>
        </div>
      )}

      {/* Top Header Bar (Discreet or hidden on Page 0 in Glass theme) */}
      {!(theme.name === 'glass' && activePage === 0) && (
        <header
          style={{
            backgroundColor: `${theme.palette.surface}F0`,
            borderColor: theme.palette.border,
          }}
          className="h-10 px-4 border-b flex items-center justify-between text-xs font-mono shrink-0 z-20 backdrop-blur-md"
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
              title="Click to cycle theme (Glass / Void / Paper / Neon Grid)"
            >
              {theme.name}
            </button>
            <button
              onClick={() => {
                const wallpapers = Object.keys(BUILTIN_WALLPAPERS);
                const currKey = theme.background?.ref || 'glass-bokeh';
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
              title="Click to cycle Live Wallpaper preset"
            >
              WP: {theme.background?.ref?.replace('-lite', '') || 'glass-bokeh'}
            </button>
          </div>

          {/* Center Page Title & Overview Trigger */}
          <div className="flex items-center space-x-2 text-[11px] text-[#71717A]">
            <button
              onClick={() => useDeckStore.getState().prevPage()}
              className="hover:text-[#EDEDF2] transition-colors p-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowOverview(true)}
              className="uppercase tracking-wider text-[#EDEDF2] font-medium hover:text-[#B07BFF] flex items-center gap-1.5 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-white/[0.04]"
              title="Click to view All Pages Overview"
            >
              <Layers className="w-3 h-3 text-[#B07BFF]" />
              <span>
                {activePage === 0 && 'Page 1 · System Overview'}
                {activePage === 1 && 'Page 2 · Dev & Processes'}
                {activePage === 2 && 'Page 3 · Audio & Media'}
                {activePage === 3 && 'Page 4 · AI Agents & Quotas'}
              </span>
            </button>
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
              onClick={() => {
                if (isDemoMode) {
                  setIsDemoMode(false);
                } else {
                  setShowPairModal(true);
                }
              }}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                connected
                  ? 'bg-[#B07BFF]/10 border-[#B07BFF]/30 text-[#B07BFF]'
                  : isDemoMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-[#71717A] hover:text-[#EDEDF2]'
              }`}
            >
              <Shield className="w-3 h-3" />
              <span>
                {connected
                  ? `LIVE TLS${connectionStatus.active_host ? ` · ${connectionStatus.active_host.split(':')[0]}` : ''}`
                  : isDemoMode
                  ? 'DEMO (MOCK)'
                  : 'OFFLINE'}
              </span>
            </button>

            {/* Budget HUD toggle */}
            <button
              onClick={() => setShowBudgetHud(!showBudgetHud)}
              className={`p-1.5 rounded transition-colors ${
                showBudgetHud
                  ? 'bg-[#B07BFF] text-white'
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
      )}

      {/* Main 12x6 Grid Viewport with Swipeable Pages */}
      <main className={`flex-1 relative overflow-hidden ${theme.name === 'glass' && activePage === 0 ? 'p-0' : 'p-2 md:p-3'}`}>
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
              className="w-full h-full"
            >
              {theme.name === 'glass' ? (
                <GlassDashboardView
                  onOpenOverview={() => setShowOverview(true)}
                  onOpenPairing={() => {
                    if (isDemoMode) {
                      setIsDemoMode(false);
                    } else {
                      setShowPairModal(true);
                    }
                  }}
                  connected={connected}
                  hostName={connectionStatus.active_host ? connectionStatus.active_host.split(':')[0] : 'HOME-PC'}
                />
              ) : (
                <div className="w-full h-full grid grid-cols-12 grid-rows-6 gap-2">
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
                </div>
              )}
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
              {/* PAGE 2: DEV, APPS & PROCESSES */}
              {/* Visual Studio Code App Card (col 1..6, row 1..3) */}
              <div className="col-span-6 row-span-3">
                <AppCardContainer appId="vscode" defaultName="Visual Studio Code" defaultIcon="Code" />
              </div>

              {/* Opera GX App Card (col 7..12, row 1..3) */}
              <div className="col-span-6 row-span-3">
                <AppCardContainer appId="opera" defaultName="Opera GX" defaultIcon="Flame" />
              </div>

              {/* App Dock (col 1..12, row 4) */}
              <div className="col-span-12 row-span-1">
                <AppDockContainer />
              </div>

              {/* AI Agent Inbox (col 1..7, row 5..6) */}
              <div className="col-span-7 row-span-2">
                <AgentInboxContainer />
              </div>

              {/* Custom Shortcuts Grid (col 8..12, row 5..6) */}
              <div className="col-span-5 row-span-2">
                <ShortcutGridContainer />
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
              {/* PAGE 3: MEDIA & TURNTABLE */}
              {/* Spinning Vinyl Turntable (col 1..4, row 1..6) */}
              <div className="col-span-4 row-span-6">
                <VinylPlayerContainer />
              </div>

              {/* Now Playing Large (col 5..8, row 1..4) */}
              <div className="col-span-4 row-span-4">
                <NowPlayingLargeContainer />
              </div>

              {/* Mini Now Playing (col 5..8, row 5..6) */}
              <div className="col-span-4 row-span-2">
                <MiniNowPlayingContainer />
              </div>

              {/* Application Audio Mixer & Panic Mute (col 9..12, row 1..6) */}
              <div className="col-span-4 row-span-6">
                <AudioMixerContainer />
              </div>
            </motion.div>
          )}

          {activePage === 3 && (
            <motion.div
              key="page-3"
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
              {/* PAGE 4: AI CODING AGENTS & QUOTAS */}
              {/* AI Coding Sessions (col 1..7, row 1..6) */}
              <div className="col-span-7 row-span-6">
                <AiSessionsContainer />
              </div>

              {/* AI Quotas & Burn-Rate Tracker (col 8..12, row 1..4) */}
              <div className="col-span-5 row-span-4">
                <AiQuotasContainer />
              </div>

              {/* Compact Claude 5H Ring (col 8..9, row 5..6) */}
              <div className="col-span-2 row-span-2">
                <QuotaRingContainer title="Claude" provider="5H LIMIT" usedPct={42} resetEta="2h 18m" accentColor="#D97706" />
              </div>

              {/* Compact Antigravity Fast Quota Ring (col 10..12, row 5..6) */}
              <div className="col-span-3 row-span-2">
                <QuotaRingContainer title="Antigravity" provider="PRO TIER" usedPct={24} resetEta="Daily 00:00" accentColor="#7C5CFF" />
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

            {/* Part A: Ambient Night Clock Dev Controls */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[#7C5CFF]">
                <span>Ambient Sensor Debug</span>
                <span className="text-zinc-400 font-mono lowercase">
                  {useAmbientStore.getState().state} ({useAmbientStore.getState().timeInStateSecs}s)
                </span>
              </div>

              <div className="flex justify-between items-center text-[10px]">
                <span className="text-[#71717A]">Raw / Filtered Lux</span>
                <span className="text-white font-mono">
                  {useAmbientStore.getState().rawLux.toFixed(1)} / {useAmbientStore.getState().filteredLux.toFixed(1)} lx
                </span>
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-[#71717A] mb-1">
                  <span>Lux Slider (Simulate Room Light)</span>
                  <span className="text-white font-mono">{useAmbientStore.getState().rawLux.toFixed(1)} lx</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={useAmbientStore.getState().rawLux}
                  onChange={(e) => useAmbientStore.getState().pushLux(parseFloat(e.target.value))}
                  className="w-full accent-[#7C5CFF] h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => {
                    for (let i = 0; i < 5; i++) useAmbientStore.getState().pushLux(0.5);
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded text-[10px] text-zinc-300 font-mono text-center cursor-pointer"
                >
                  Lights Off (0.5 lx)
                </button>
                <button
                  onClick={() => {
                    for (let i = 0; i < 5; i++) useAmbientStore.getState().pushLux(80.0);
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded text-[10px] text-zinc-300 font-mono text-center cursor-pointer"
                >
                  Lights On (80 lx)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => useAmbientStore.getState().handleSingleTap()}
                  className="px-2 py-1 bg-[#7C5CFF]/20 hover:bg-[#7C5CFF]/30 text-[#7C5CFF] rounded text-[10px] font-mono text-center cursor-pointer"
                >
                  1× Tap (Peek)
                </button>
                <button
                  onClick={() => useAmbientStore.getState().handleDoubleTap()}
                  className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-[10px] font-mono text-center cursor-pointer"
                >
                  2× Tap (Lock)
                </button>
              </div>
            </div>

            {/* Part B: Media Session Dev Controls */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[#00E599]">
                <span>Media Session Debug</span>
                <span className="text-zinc-400 font-mono">
                  {String(metrics[23] || 'Spotify')}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => sendMediaAction('prev')}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded text-[10px] font-mono cursor-pointer"
                >
                  ⏮ Prev
                </button>
                <button
                  onClick={() => sendMediaAction('toggle')}
                  className="col-span-2 px-2 py-1 bg-[#00E599]/20 hover:bg-[#00E599]/30 text-[#00E599] rounded text-[10px] font-mono font-semibold cursor-pointer"
                >
                  ⏯ Play/Pause
                </button>
                <button
                  onClick={() => sendMediaAction('next')}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded text-[10px] font-mono cursor-pointer"
                >
                  Next ⏭
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => sendMediaAction('cycle_source')}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 rounded text-[10px] font-mono cursor-pointer"
                >
                  🔄 Cycle App
                </button>
                <button
                  onClick={() => sendMediaAction('mute')}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 rounded text-[10px] font-mono cursor-pointer"
                >
                  🔇 Mute/Unmute
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-[#71717A] mb-1">
                  <span>Master Vol Slider</span>
                  <span className="text-white font-mono">{Number(metrics[29] ?? 75)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Number(metrics[29] ?? 75)}
                  onChange={(e) => sendMediaVolume(parseInt(e.target.value))}
                  className="w-full accent-[#00E599] h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Part C: App Registry Dev Controls */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-[#7C5CFF]">
                <span>App State Simulation</span>
                <span className="text-zinc-400 font-mono">VS Code / Opera / Antigravity</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    const currentRaw = useDeckStore.getState().metrics[32];
                    let parsed: any = {};
                    try { parsed = JSON.parse(String(currentRaw)); } catch {}
                    const vscode = parsed.vscode || {};
                    parsed.vscode = { ...vscode, focused: !vscode.focused, running: true };
                    useDeckStore.getState().applyMetricBatch({ 32: JSON.stringify(parsed) });
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded text-[10px] font-mono cursor-pointer"
                >
                  Toggle VS Code Focus
                </button>
                <button
                  onClick={() => {
                    const currentRaw = useDeckStore.getState().metrics[32];
                    let parsed: any = {};
                    try { parsed = JSON.parse(String(currentRaw)); } catch {}
                    const vscode = parsed.vscode || {};
                    parsed.vscode = { ...vscode, unsaved: !vscode.unsaved };
                    useDeckStore.getState().applyMetricBatch({ 32: JSON.stringify(parsed) });
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-amber-300 rounded text-[10px] font-mono cursor-pointer"
                >
                  ● Toggle Unsaved File
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    const currentRaw = useDeckStore.getState().metrics[32];
                    let parsed: any = {};
                    try { parsed = JSON.parse(String(currentRaw)); } catch {}
                    const opera = parsed.opera || {};
                    parsed.opera = { ...opera, audio_active: !opera.audio_active, running: true };
                    useDeckStore.getState().applyMetricBatch({ 32: JSON.stringify(parsed) });
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-[#00E599] rounded text-[10px] font-mono cursor-pointer"
                >
                  🔊 Toggle Opera Audio
                </button>
                <button
                  onClick={() => {
                    const currentRaw = useDeckStore.getState().metrics[32];
                    let parsed: any = {};
                    try { parsed = JSON.parse(String(currentRaw)); } catch {}
                    const agy = parsed.antigravity || {};
                    parsed.antigravity = { ...agy, running: !agy.running, focused: !agy.running };
                    useDeckStore.getState().applyMetricBatch({ 32: JSON.stringify(parsed) });
                  }}
                  className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-[#7C5CFF] rounded text-[10px] font-mono cursor-pointer"
                >
                  ✨ Toggle Antigravity
                </button>
              </div>
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

              {connectionStatus.paired && (
                <button
                  onClick={async () => {
                    if (isTauri) {
                      const { invoke } = await import('@tauri-apps/api/core');
                      await invoke('unpair_device');
                    }
                    setConnectionStatus({ paired: false, connected: false });
                    setShowPairModal(false);
                  }}
                  className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition-colors cursor-pointer"
                >
                  Disconnect &amp; Unpair from PC
                </button>
              )}
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

      {/* PC APP UPDATING CALM OVERLAY (Void Theme) */}
      {isPcUpdating && (
        <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col items-center justify-center p-6 text-center select-none font-mono">
          <div className="w-3 h-3 rounded-full bg-[#7C5CFF] animate-pulse mb-6 shadow-[0_0_24px_#7C5CFF]" />
          <div className="text-xl font-light tracking-[0.2em] text-[#EDEDF2] uppercase mb-2">
            PC App Updating
          </div>
          <p className="text-xs text-[#71717A] max-w-xs leading-relaxed">
            The desktop agent is restarting with a verified update.{'\n'}
            Reconnecting automatically in ~{pcUpdatingEtaSec}s...
          </p>
        </div>
      )}

      {/* PROTOCOL INCOMPATIBILITY BLOCKING OVERLAY */}
      {updaterStatus.protocol_incompatible && (
        <div className="fixed inset-0 z-50 bg-[#000000] flex flex-col items-center justify-center p-6 text-center select-none font-mono">
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B5C]/10 border border-[#FF3B5C]/30 flex items-center justify-center text-[#FF3B5C] mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="text-base font-semibold text-[#EDEDF2] mb-2 tracking-wide uppercase">
            Protocol Update Required
          </div>
          <p className="text-xs text-[#71717A] max-w-sm mb-6 leading-relaxed">
            The connected PC agent is using a newer protocol version than this Display application supports.
            Update Phone Deck Display to restore telemetry and controls.
          </p>
          <button
            onClick={() => {
              if (updaterStatus.state === 'ready_to_install') {
                useUpdaterStore.getState().installStagedUpdate();
              } else if (updaterStatus.state === 'available') {
                useUpdaterStore.getState().downloadUpdate();
              } else {
                useUpdaterStore.getState().checkForUpdates();
              }
            }}
            className="px-5 py-2.5 rounded-xl bg-[#7C5CFF] text-white text-xs font-medium hover:bg-[#6847ED] transition-all cursor-pointer shadow-lg shadow-[#7C5CFF]/25 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>
              {updaterStatus.state === 'ready_to_install'
                ? 'Restart & Install Staged Update'
                : updaterStatus.state === 'downloading'
                ? `Downloading (${Math.round(updaterStatus.progress_pct)}%)...`
                : 'Download Latest Display APK'}
            </span>
          </button>
        </div>
      )}

      {/* UNOBTRUSIVE UPDATE READY TO INSTALL CARD */}
      {!updaterStatus.protocol_incompatible &&
        !isPcUpdating &&
        (updaterStatus.state === 'ready_to_install' || updaterStatus.pending_user_action) && (
          <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto p-3.5 rounded-xl bg-[#09090D]/95 border border-[#7C5CFF]/30 backdrop-blur-md shadow-2xl flex items-center justify-between font-mono text-xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-2 h-2 rounded-full bg-[#00E599] animate-ping" />
              <div>
                <div className="text-[#EDEDF2] font-medium">Update Ready</div>
                <div className="text-[10px] text-[#71717A]">
                  v{updaterStatus.manifest?.version_name || 'latest'} staged · tap to restart
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  if (updaterStatus.pending_user_action) {
                    useUpdaterStore.getState().launchPendingAction();
                  } else {
                    useUpdaterStore.getState().installStagedUpdate();
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#7C5CFF] text-white text-[11px] font-medium hover:bg-[#6847ED] transition-all cursor-pointer shadow-md shadow-[#7C5CFF]/20"
              >
                Restart &amp; Install
              </button>
            </div>
          </div>
        )}
      {/* ALL PAGES OVERVIEW MODAL (PhoneBox style) */}
      {showOverview && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between p-6 select-none font-mono">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-[#7C5CFF]" />
              <div>
                <h2 className="text-sm font-bold text-white tracking-wider uppercase">
                  All Pages Overview
                </h2>
                <p className="text-[11px] text-[#71717A]">
                  Tap any card to jump immediately · Swipe left/right or use volume keys
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowOverview(false)}
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 4 Page Thumbnail Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-auto">
            {[
              {
                index: 0,
                num: 'PAGE 1',
                title: 'System Performance',
                desc: 'CPU load, RAM, storage, network I/O, uptime and temperature sparklines',
                accent: '#7C5CFF',
                icon: Gauge,
              },
              {
                index: 1,
                num: 'PAGE 2',
                title: 'Dev & Applications',
                desc: 'VS Code, browser workspaces, app dock, running heavy processes and shortcuts',
                accent: '#00E599',
                icon: Activity,
              },
              {
                index: 2,
                num: 'PAGE 3',
                title: 'Audio & Media Deck',
                desc: 'Spinning vinyl turntable, now playing, application volume mixer and panic mute',
                accent: '#38BDF8',
                icon: Volume2,
              },
              {
                index: 3,
                num: 'PAGE 4',
                title: 'AI Coding Deck & Quotas',
                desc: 'Claude Code & Codex sessions, live tools, Antigravity quotas and reset countdowns',
                accent: '#D97706',
                icon: Sparkles,
              },
            ].map((p) => {
              const isActive = activePage === p.index;
              const Icon = p.icon;

              return (
                <div
                  key={p.index}
                  onClick={() => {
                    useDeckStore.getState().setPage(p.index);
                    setShowOverview(false);
                  }}
                  style={{
                    borderColor: isActive ? p.accent : 'rgba(255, 255, 255, 0.08)',
                    boxShadow: isActive ? `0 0 20px ${p.accent}40` : undefined,
                  }}
                  className={`p-4 rounded-2xl bg-[#09090D] hover:bg-white/[0.04] border-2 transition-all cursor-pointer flex flex-col justify-between h-48 ${
                    isActive ? 'scale-[1.02]' : 'hover:scale-[1.01]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase"
                      style={{
                        backgroundColor: `${p.accent}20`,
                        color: p.accent,
                        border: `1px solid ${p.accent}40`,
                      }}
                    >
                      {p.num}
                    </span>
                    <Icon className="w-4 h-4 text-zinc-400" />
                  </div>

                  <div className="my-auto space-y-1">
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      {p.title}
                    </h3>
                    <p className="text-[10.5px] text-[#71717A] leading-relaxed line-clamp-3">
                      {p.desc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px]">
                    <span className={isActive ? 'text-[#00E599] font-bold' : 'text-[#71717A]'}>
                      {isActive ? 'CURRENTLY ACTIVE' : 'TAP TO SWITCH'}
                    </span>
                    <Check className={`w-3.5 h-3.5 ${isActive ? 'text-[#00E599]' : 'opacity-0'}`} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] text-xs text-[#71717A]">
            <span>STEAM-DECK RESPONSIVE 12x6 COMPONENT GRID</span>
            <span className="text-[#00E599]">HARDWARE-ACCELERATED</span>
          </div>
        </div>
      )}
    </div>
  );
}
