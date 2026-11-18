import { useState } from 'react';
import { QrCode, Monitor, Cpu, Radio, Shield, Settings2, SlidersHorizontal, HardDrive } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'status' | 'devices' | 'editor' | 'settings'>('status');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#000000] text-[#EDEDF2] font-sans antialiased select-none">
      {/* Top Header / Status bar */}
      <header className="h-12 border-b border-white/[0.08] px-5 flex items-center justify-between shrink-0 bg-[#000000]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#7C5CFF] shadow-[0_0_12px_#7C5CFF]" />
          <span className="font-semibold tracking-wider text-xs uppercase text-[#EDEDF2]">
            Phone Deck <span className="text-[#7C5CFF]">Agent</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.05] text-[#71717A] border border-white/[0.06]">
            v0.1.0-alpha
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {[
            { id: 'status', label: 'Monitor', icon: Monitor },
            { id: 'devices', label: 'Pairing', icon: QrCode },
            { id: 'editor', label: 'Layout Editor', icon: SlidersHorizontal },
            { id: 'settings', label: 'Settings', icon: Settings2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                activeTab === id
                  ? 'bg-white/[0.08] text-[#EDEDF2] shadow-sm'
                  : 'text-[#71717A] hover:text-[#EDEDF2] hover:bg-white/[0.03]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-xs font-mono text-[#71717A]">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#00E599]" />
            <span>LAN: 8765</span>
          </span>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'status' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Live Status Row */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>CPU Total</span>
                  <Cpu className="w-3.5 h-3.5 text-[#7C5CFF]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#EDEDF2]">
                  12<span className="text-xl text-[#71717A] font-normal">%</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">
                  4.2 GHz · 42°C
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>RAM Used</span>
                  <HardDrive className="w-3.5 h-3.5 text-[#7C5CFF]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#EDEDF2]">
                  14.2<span className="text-xl text-[#71717A] font-normal">/32G</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">
                  44% utilized
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>Throughput</span>
                  <Radio className="w-3.5 h-3.5 text-[#00E599]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#00E599]">
                  0.18<span className="text-xl text-[#71717A] font-normal">KB/s</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">
                  Budget: &lt; 1.0 KB/s
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>Connected Decks</span>
                  <Monitor className="w-3.5 h-3.5 text-[#7C5CFF]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#EDEDF2]">
                  0<span className="text-xl text-[#71717A] font-normal"> active</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">
                  Ready for pairing
                </div>
              </div>
            </div>

            {/* Quick Setup / Pairing Banner */}
            <div className="p-6 rounded-2xl bg-[#050508] border border-white/[0.08] flex items-center justify-between">
              <div className="space-y-2 max-w-lg">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF] text-[11px] font-mono font-medium border border-[#7C5CFF]/20">
                  <Shield className="w-3 h-3" />
                  PINNED TLS · LOCAL ENCRYPTED
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-[#EDEDF2]">
                  Pair your Android Display
                </h2>
                <p className="text-xs text-[#71717A] leading-relaxed">
                  Open Phone Deck Display on your phone. Scan the QR code to establish an encrypted local WebSocket stream. No cloud, zero accounts.
                </p>
              </div>

              <button
                onClick={() => setActiveTab('devices')}
                className="px-5 py-2.5 rounded-xl bg-[#7C5CFF] hover:bg-[#6C4CEF] text-white text-xs font-semibold tracking-wide flex items-center gap-2 shadow-[0_0_20px_rgba(124,92,255,0.3)] transition-all cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                Show Pairing QR
              </button>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="max-w-xl mx-auto p-8 rounded-2xl bg-[#08080C] border border-white/[0.08] text-center space-y-6">
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight">Pair New Display Device</h2>
              <p className="text-xs text-[#71717A]">Single-use 120s cryptographic pairing token</p>
            </div>

            {/* Placeholder QR with styling */}
            <div className="w-56 h-56 mx-auto rounded-xl bg-white p-4 flex flex-col items-center justify-center border-4 border-[#7C5CFF]/40 shadow-[0_0_30px_rgba(124,92,255,0.2)]">
              <div className="w-full h-full border-2 border-dashed border-black/30 rounded-lg flex flex-col items-center justify-center p-3">
                <QrCode className="w-24 h-24 text-black mb-2" />
                <span className="text-[10px] font-mono text-black font-semibold uppercase tracking-widest">
                  PAIRING QR
                </span>
                <span className="text-[9px] font-mono text-black/60 truncate max-w-[150px]">
                  phonedeck://pair?h=192.168.1.10
                </span>
              </div>
            </div>

            <div className="text-xs font-mono text-[#71717A] space-y-1">
              <div>Agent Fingerprint: <span className="text-[#EDEDF2]">sha256:7c5cff...void</span></div>
              <div>Token expires in <span className="text-[#00E599]">119 s</span></div>
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-[#08080C] border border-white/[0.08] text-center space-y-3">
            <SlidersHorizontal className="w-8 h-8 text-[#7C5CFF] mx-auto" />
            <h3 className="text-sm font-semibold">Visual Layout Editor</h3>
            <p className="text-xs text-[#71717A]">
              Phase 5 feature: 12x6 Deck grid editor with drag-and-drop widget placement.
            </p>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold">Agent Preferences</h3>
            <div className="text-xs text-[#71717A] space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>Autostart on Windows Login</span>
                <span className="text-[#00E599] font-mono">Enabled</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>Minimize to System Tray</span>
                <span className="text-[#00E599] font-mono">Enabled</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>Telemetry Deadband Threshold</span>
                <span className="text-[#EDEDF2] font-mono">1.0% CPU / 1°C</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Hairline Footer */}
      <footer className="h-8 border-t border-white/[0.06] px-5 flex items-center justify-between text-[11px] font-mono text-[#71717A] bg-[#000000]">
        <span>Phone Deck Agent Desktop</span>
        <span className="text-[#00E599] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
          WSS Server Ready
        </span>
      </footer>
    </div>
  );
}
