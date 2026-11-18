import { useState, useEffect } from 'react';
import { LayoutEditor } from './editor/LayoutEditor';
import { ShortcutsManager } from './editor/ShortcutsManager';
import { RulesManager } from './editor/RulesManager';
import { AmbientSettings } from './editor/AmbientSettings';
import {
  QrCode,
  Monitor,
  Cpu,
  Radio,
  Shield,
  Settings2,
  SlidersHorizontal,
  HardDrive,
  RefreshCw,
  Trash2,
  Check,
  Copy,
  Smartphone,
  Command,
  Sparkles,
  Moon,
} from 'lucide-react';

interface PairingStatus {
  qr_svg: string;
  pair_uri: string;
  expires_in_seconds: number;
  agent_id: string;
  port: number;
  fingerprint: string;
  hosts: string[];
}

interface PairedDevice {
  device_id: string;
  device_name: string;
  paired_at: number;
  last_seen: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'status' | 'devices' | 'editor' | 'shortcuts' | 'rules' | 'ambient' | 'settings'
  >('status');
  const [pairingStatus, setPairingStatus] = useState<PairingStatus | null>(null);
  const [countdown, setCountdown] = useState<number>(120);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const fetchPairingStatus = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<PairingStatus>('get_pairing_status');
        setPairingStatus(res);
        setCountdown(res.expires_in_seconds);
      } catch (err) {
        console.error('Failed to get pairing status from Tauri:', err);
      }
    } else {
      // Browser preview mock
      setPairingStatus({
        qr_svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><rect width="100" height="100" fill="#ffffff"/><rect x="10" y="10" width="25" height="25" fill="#000000"/><rect x="65" y="10" width="25" height="25" fill="#000000"/><rect x="10" y="65" width="25" height="25" fill="#000000"/><rect x="42" y="42" width="16" height="16" fill="#7C5CFF"/><rect x="45" y="15" width="10" height="20" fill="#000000"/><rect x="15" y="45" width="20" height="10" fill="#000000"/><rect x="65" y="45" width="20" height="20" fill="#000000"/><rect x="45" y="70" width="20" height="15" fill="#000000"/></svg>`,
        pair_uri: 'phonedeck://pair?h=192.168.1.150&p=8766&t=e4f8b92a10c74b89&fp=7c5cffa812b409cd83ef9910ba7491b827e8a9f012c8b749e81b2c4d9a0f7e12&id=phone-deck-pc',
        expires_in_seconds: 120,
        agent_id: 'phone-deck-pc',
        port: 8766,
        fingerprint: '7c5cffa812b409cd83ef9910ba7491b827e8a9f012c8b749e81b2c4d9a0f7e12',
        hosts: ['192.168.1.150', '127.0.0.1'],
      });
      setCountdown(120);
    }
  };

  const fetchPairedDevices = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<PairedDevice[]>('get_paired_devices');
        setPairedDevices(res);
      } catch (err) {
        console.error('Failed to get paired devices:', err);
      }
    } else {
      setPairedDevices([
        {
          device_id: 'phone-pixel-6',
          device_name: 'Pixel 6 Pro',
          paired_at: Math.floor(Date.now() / 1000) - 3600,
          last_seen: Math.floor(Date.now() / 1000) - 60,
        },
      ]);
    }
  };

  const handleRefreshToken = async () => {
    setLoading(true);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<PairingStatus>('refresh_pairing_token');
        setPairingStatus(res);
        setCountdown(res.expires_in_seconds);
      } catch (err) {
        console.error('Refresh token error:', err);
      }
    } else {
      setCountdown(120);
    }
    setLoading(false);
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('revoke_device', { deviceId });
        await fetchPairedDevices();
      } catch (err) {
        console.error('Revoke device error:', err);
      }
    } else {
      setPairedDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
    }
  };

  const handleRevokeAll = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('revoke_all_devices');
        await fetchPairedDevices();
      } catch (err) {
        console.error('Revoke all error:', err);
      }
    } else {
      setPairedDevices([]);
    }
  };

  const handleCopyUri = () => {
    if (pairingStatus?.pair_uri) {
      navigator.clipboard.writeText(pairingStatus.pair_uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    fetchPairingStatus();
    fetchPairedDevices();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchPairingStatus();
          return 120;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
            { id: 'devices', label: 'Pairing & Devices', icon: QrCode },
            { id: 'editor', label: 'Layout Editor', icon: SlidersHorizontal },
            { id: 'shortcuts', label: 'Shortcuts', icon: Command },
            { id: 'rules', label: 'Rules', icon: Sparkles },
            { id: 'ambient', label: 'Ambient', icon: Moon },
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
            <span>WSS: 8766 (TLS)</span>
          </span>
        </div>
      </header>

      {/* Main Content View */}
      <main
        className={`flex-1 ${
          activeTab === 'editor' ? 'p-0 overflow-hidden' : 'p-6 overflow-y-auto'
        }`}
      >
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
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">4.2 GHz · 42°C</div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>RAM Used</span>
                  <HardDrive className="w-3.5 h-3.5 text-[#7C5CFF]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#EDEDF2]">
                  14.2<span className="text-xl text-[#71717A] font-normal">/32G</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">44% utilized</div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>Throughput</span>
                  <Radio className="w-3.5 h-3.5 text-[#00E599]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#00E599]">
                  0.18<span className="text-xl text-[#71717A] font-normal">KB/s</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">Budget: &lt; 1.0 KB/s</div>
              </div>

              <div className="p-4 rounded-xl bg-[#08080C] border border-white/[0.08] flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-[#71717A] uppercase tracking-wider font-mono">
                  <span>Paired Decks</span>
                  <Monitor className="w-3.5 h-3.5 text-[#7C5CFF]" />
                </div>
                <div className="mt-4 font-mono text-4xl font-light tracking-tight tabular-nums text-[#EDEDF2]">
                  {pairedDevices.length}
                  <span className="text-xl text-[#71717A] font-normal"> devices</span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-[#71717A]">HMAC Verified</div>
              </div>
            </div>

            {/* Quick Setup / Pairing Banner */}
            <div className="p-6 rounded-2xl bg-[#050508] border border-white/[0.08] flex items-center justify-between">
              <div className="space-y-2 max-w-lg">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF] text-[11px] font-mono font-medium border border-[#7C5CFF]/20">
                  <Shield className="w-3 h-3" />
                  PINNED TLS · SHA-256 FINGERPRINT · ZERO CLOUD
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-[#EDEDF2]">
                  Pair your Android Display
                </h2>
                <p className="text-xs text-[#71717A] leading-relaxed">
                  Open Phone Deck Display on your phone. Scan the QR code to establish an encrypted local WebSocket stream.
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
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: QR Code & Countdown */}
              <div className="p-6 rounded-2xl bg-[#08080C] border border-white/[0.08] flex flex-col items-center text-center space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold tracking-tight text-[#EDEDF2]">
                    Scan QR Code to Pair
                  </h3>
                  <p className="text-[11px] text-[#71717A]">
                    Token is single-use and refreshes automatically every 120s
                  </p>
                </div>

                {/* SVG QR Code */}
                <div className="w-56 h-56 rounded-xl bg-white p-3 flex items-center justify-center border-2 border-[#7C5CFF]/40 shadow-[0_0_30px_rgba(124,92,255,0.2)]">
                  {pairingStatus?.qr_svg ? (
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: pairingStatus.qr_svg }}
                    />
                  ) : (
                    <div className="animate-pulse text-black text-xs font-mono">Generating...</div>
                  )}
                </div>

                {/* Countdown & Refresh */}
                <div className="flex items-center justify-between w-full px-2 pt-2 border-t border-white/[0.06] text-xs font-mono">
                  <span className="text-[#71717A]">
                    Expires in{' '}
                    <span className="text-[#00E599] font-semibold">{countdown} s</span>
                  </span>
                  <button
                    onClick={handleRefreshToken}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#EDEDF2] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Copyable URI */}
                <button
                  onClick={handleCopyUri}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[11px] font-mono text-[#71717A] truncate transition-all cursor-pointer"
                >
                  <span className="truncate max-w-[280px]">
                    {pairingStatus?.pair_uri || 'Generating URI...'}
                  </span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-[#00E599] shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#7C5CFF] shrink-0" />
                  )}
                </button>
              </div>

              {/* Right Column: Security Details & Paired Devices */}
              <div className="space-y-6">
                {/* Security Parameters */}
                <div className="p-5 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#7C5CFF] uppercase font-semibold">
                    <Shield className="w-3.5 h-3.5" />
                    <span>TLS & Security Parameters</span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#71717A] uppercase">Certificate Fingerprint (SHA-256)</span>
                      <span className="text-[#EDEDF2] text-[11px] break-all font-mono">
                        {pairingStatus?.fingerprint || 'Computing...'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                      <span className="text-[#71717A]">WSS Port</span>
                      <span className="text-[#EDEDF2] font-semibold">{pairingStatus?.port || 8766}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">Host Interfaces</span>
                      <span className="text-[#EDEDF2]">{pairingStatus?.hosts.join(', ') || '127.0.0.1'}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">Host/Origin Verification</span>
                      <span className="text-[#00E599]">Strict Localhost Only</span>
                    </div>
                  </div>
                </div>

                {/* Paired Devices List */}
                <div className="p-5 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#EDEDF2] font-semibold">
                      <Smartphone className="w-3.5 h-3.5 text-[#7C5CFF]" />
                      <span>Paired Devices ({pairedDevices.length})</span>
                    </div>
                    {pairedDevices.length > 0 && (
                      <button
                        onClick={handleRevokeAll}
                        className="text-[11px] font-mono text-[#FF3B5C] hover:underline cursor-pointer"
                      >
                        Revoke All
                      </button>
                    )}
                  </div>

                  {pairedDevices.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#71717A] font-mono">
                      No devices currently paired. Scan the QR code to pair your phone.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pairedDevices.map((dev) => (
                        <div
                          key={dev.device_id}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                        >
                          <div>
                            <div className="text-xs font-semibold text-[#EDEDF2]">{dev.device_name}</div>
                            <div className="text-[10px] font-mono text-[#71717A]">
                              ID: {dev.device_id} · Last seen{' '}
                              {Math.max(1, Math.floor((Date.now() / 1000 - dev.last_seen) / 60))}m ago
                            </div>
                          </div>

                          <button
                            onClick={() => handleRevokeDevice(dev.device_id)}
                            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-[#FF3B5C]/20 text-[#71717A] hover:text-[#FF3B5C] transition-all cursor-pointer"
                            title="Revoke device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'editor' && <LayoutEditor />}
        {activeTab === 'shortcuts' && <ShortcutsManager />}
        {activeTab === 'rules' && <RulesManager />}
        {activeTab === 'ambient' && <AmbientSettings />}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-4">
            <h3 className="text-sm font-semibold">Agent Preferences</h3>
            <div className="text-xs text-[#71717A] space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>Autostart on Windows Login</span>
                <span className="text-[#00E599] font-mono">Enabled</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>mDNS Service Advertisement</span>
                <span className="text-[#00E599] font-mono">_phonedeck._tcp.local</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                <span>Self-Signed Pinned TLS Server</span>
                <span className="text-[#00E599] font-mono">Port 8766 (Active)</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
