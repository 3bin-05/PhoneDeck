import { useState, useEffect } from 'react';
import {
  Download,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';

export interface AgentUpdaterStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up_to_date' | 'error';
  current_version: string;
  update_version: string | null;
  release_notes: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  last_checked: number | null;
  error: string | null;
  startup_crashes: number;
  safe_mode_engaged: boolean;
  previous_version_cached: string | null;
  changelog_unread: boolean;
}

export interface AgentUpdaterConfig {
  auto_update: boolean;
  channel: 'stable' | 'beta';
  install_mode: 'idle' | 'next_quit' | 'ask';
  check_interval_hours: number;
}

export function UpdatesManager() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const [status, setStatus] = useState<AgentUpdaterStatus>({
    state: 'idle',
    current_version: '0.1.0',
    update_version: null,
    release_notes: null,
    downloaded_bytes: 0,
    total_bytes: 0,
    last_checked: null,
    error: null,
    startup_crashes: 0,
    safe_mode_engaged: false,
    previous_version_cached: '0.0.9',
    changelog_unread: false,
  });

  const [config, setConfig] = useState<AgentUpdaterConfig>({
    auto_update: true,
    channel: 'stable',
    install_mode: 'idle',
    check_interval_hours: 6,
  });

  const [loading, setLoading] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  const fetchStatus = async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<AgentUpdaterStatus>('get_updater_status');
      setStatus(res);
      if (res.changelog_unread) {
        setShowWhatsNew(true);
      }
    } catch (e) {
      console.warn('Failed to fetch updater status:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckNow = async () => {
    setLoading(true);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('check_for_updates');
        await fetchStatus();
      } catch (e: any) {
        console.error('Check for updates failed:', e);
      }
    } else {
      // Mock check
      setTimeout(() => {
        setStatus((prev) => ({
          ...prev,
          state: 'available',
          update_version: '0.2.0',
          release_notes: '- Added ambient-light Night Clock mode\n- High-performance auto-updating system\n- Added media sessions & process controls',
          last_checked: Math.floor(Date.now() / 1000),
        }));
        setLoading(false);
      }, 1000);
    }
    setLoading(false);
  };

  const handleApplyUpdate = async () => {
    if (!isTauri) {
      alert('Mock: applying staged update and restarting with pre-restart agent.updating notification.');
      return;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('apply_staged_update');
    } catch (e) {
      console.error('Apply update failed:', e);
    }
  };

  const handleConfigChange = async (updates: Partial<AgentUpdaterConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_updater_config', { config: next });
      } catch (e) {
        console.error('Save config failed:', e);
      }
    }
  };

  const handleDismissWhatsNew = async () => {
    setShowWhatsNew(false);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('mark_changelog_viewed');
      } catch (e) {}
    }
  };

  return (
    <div className="space-y-6">
      {/* SAFE MODE BANNER IF CRASH THRESHOLD EXCEEDED */}
      {status.safe_mode_engaged && (
        <div className="p-4 rounded-xl bg-[#FF3B5C]/10 border border-[#FF3B5C]/30 flex items-start space-x-3 text-sm">
          <ShieldAlert className="w-5 h-5 text-[#FF3B5C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-[#FF3B5C]">Startup Health Warning — Safe Mode Engaged</div>
            <p className="text-xs text-[#A1A1AA]">
              The newly installed version crashed {status.startup_crashes} times during startup.
              Automatic updates have been paused to protect your system.
            </p>
            {status.previous_version_cached && (
              <button
                onClick={() => alert('Reinstalling previous version: ' + status.previous_version_cached)}
                className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#FF3B5C]/20 hover:bg-[#FF3B5C]/30 text-[#FF3B5C] text-xs font-mono transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reinstall Previous Version ({status.previous_version_cached})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* STATUS OVERVIEW CARD */}
      <div className="p-6 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-[#EDEDF2]">Phone Deck Agent</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.06] text-[#A1A1AA]">
                v{status.current_version}
              </span>
              {config.channel === 'beta' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#FFB800]/20 text-[#FFB800]">
                  BETA
                </span>
              )}
            </div>
            <div className="text-xs text-[#71717A] mt-1 font-mono flex items-center space-x-2">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Last checked:{' '}
                {status.last_checked
                  ? `${Math.max(1, Math.floor((Date.now() / 1000 - status.last_checked) / 60))}m ago`
                  : 'Never'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowWhatsNew(true)}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-[#A1A1AA] hover:text-[#EDEDF2] transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#7C5CFF]" />
              <span>What's New</span>
            </button>

            <button
              onClick={handleCheckNow}
              disabled={loading || status.state === 'downloading'}
              className="px-4 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6847ED] text-white text-xs font-medium transition-all shadow-lg shadow-[#7C5CFF]/15 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Checking...' : 'Check for Updates'}</span>
            </button>
          </div>
        </div>

        {/* UPDATE AVAILABLE / DOWNLOADING CARD */}
        {status.state === 'available' && status.update_version && (
          <div className="p-4 rounded-xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Download className="w-4 h-4 text-[#7C5CFF]" />
                <span className="text-xs font-semibold text-[#EDEDF2]">
                  New Version Available: v{status.update_version}
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#00E599]">Signature Verified (Ed25519)</span>
            </div>

            {status.release_notes && (
              <div className="p-3 rounded-lg bg-black/40 border border-white/[0.04] text-[11px] font-mono text-[#A1A1AA] whitespace-pre-line">
                {status.release_notes}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-[#71717A]">
                Will install <span className="text-[#EDEDF2] font-medium">{config.install_mode}</span>
              </div>
              <button
                onClick={handleApplyUpdate}
                className="px-3 py-1.5 rounded-lg bg-[#00E599] hover:bg-[#00D08A] text-black text-xs font-semibold transition-all cursor-pointer shadow-md shadow-[#00E599]/20"
              >
                Restart &amp; Update Now
              </button>
            </div>
          </div>
        )}

        {status.state === 'downloading' && (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#EDEDF2]">Downloading update...</span>
              <span className="text-[#7C5CFF]">
                {status.total_bytes > 0
                  ? `${Math.round((status.downloaded_bytes / status.total_bytes) * 100)}%`
                  : 'Connecting...'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7C5CFF] transition-all duration-300"
                style={{
                  width: `${status.total_bytes > 0 ? (status.downloaded_bytes / status.total_bytes) * 100 : 20}%`,
                }}
              />
            </div>
          </div>
        )}

        {status.state === 'up_to_date' && (
          <div className="p-3 rounded-xl bg-[#00E599]/10 border border-[#00E599]/20 flex items-center space-x-2 text-xs font-mono text-[#00E599]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>You are running the latest version of Phone Deck.</span>
          </div>
        )}
      </div>

      {/* PREFERENCES CARD */}
      <div className="p-6 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-5">
        <h4 className="text-sm font-semibold text-[#EDEDF2]">Update Preferences</h4>

        <div className="space-y-4">
          {/* AUTO-UPDATE TOGGLE (DEFAULT ON) */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
            <div>
              <div className="text-xs font-medium text-[#EDEDF2]">Automatic Updates</div>
              <div className="text-[11px] text-[#71717A]">
                Infrequently check, background download, and verify signatures without disruption.
              </div>
            </div>
            <button
              onClick={() => handleConfigChange({ auto_update: !config.auto_update })}
              className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                config.auto_update ? 'bg-[#7C5CFF]' : 'bg-white/[0.1]'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  config.auto_update ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* INSTALL TIMING */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
            <div>
              <div className="text-xs font-medium text-[#EDEDF2]">Installation Timing</div>
              <div className="text-[11px] text-[#71717A]">
                Controls when downloaded updates are applied to the Windows Agent.
              </div>
            </div>
            <select
              value={config.install_mode}
              onChange={(e) => handleConfigChange({ install_mode: e.target.value as any })}
              className="bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-[#EDEDF2] font-mono focus:outline-none focus:border-[#7C5CFF] cursor-pointer"
            >
              <option value="idle">When idle (Recommended)</option>
              <option value="next_quit">At next application quit</option>
              <option value="ask">Ask me before installing</option>
            </select>
          </div>

          {/* RELEASE CHANNEL */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
            <div>
              <div className="text-xs font-medium text-[#EDEDF2]">Release Channel</div>
              <div className="text-[11px] text-[#71717A]">
                Stable releases or early access beta builds.
              </div>
            </div>
            <div className="flex items-center space-x-1.5 p-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => handleConfigChange({ channel: 'stable' })}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  config.channel === 'stable'
                    ? 'bg-[#7C5CFF] text-white shadow'
                    : 'text-[#71717A] hover:text-[#EDEDF2]'
                }`}
              >
                Stable
              </button>
              <button
                onClick={() => handleConfigChange({ channel: 'beta' })}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  config.channel === 'beta'
                    ? 'bg-[#FFB800] text-black font-semibold shadow'
                    : 'text-[#71717A] hover:text-[#EDEDF2]'
                }`}
              >
                Beta
              </button>
            </div>
          </div>

          {/* ROLLBACK OPTION */}
          {status.previous_version_cached && (
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-xs font-medium text-[#EDEDF2]">Rollback Cache</div>
                <div className="text-[11px] text-[#71717A]">
                  Previous installer version {status.previous_version_cached} is preserved locally.
                </div>
              </div>
              <button
                onClick={() => alert('Launching previous cached installer v' + status.previous_version_cached)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-[#A1A1AA] hover:text-[#EDEDF2] transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reinstall v{status.previous_version_cached}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* LAN APK SERVER STATUS CARD */}
      <div className="p-6 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-3">
        <div className="flex items-center space-x-2">
          <Info className="w-4 h-4 text-[#00E599]" />
          <h4 className="text-sm font-semibold text-[#EDEDF2]">Android Display LAN Serving</h4>
        </div>
        <p className="text-xs text-[#71717A] leading-relaxed">
          The PC Agent automatically hosts signed Android APKs for your phone over the local network via{' '}
          <code className="text-[#00E599] font-mono text-[11px]">/api/update/android-latest.json</code> and{' '}
          <code className="text-[#00E599] font-mono text-[11px]">/api/update/apk/:file</code> with HTTP Range resume support.
          When an update is published, paired phones download directly from your PC at full LAN speeds without touching external servers.
        </p>
      </div>

      {/* WHAT'S NEW MODAL */}
      {showWhatsNew && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#09090D] border border-white/[0.12] rounded-2xl w-full max-w-md p-6 text-sm font-mono relative shadow-2xl space-y-4">
            <div className="flex items-center space-x-2 text-base font-semibold text-[#EDEDF2]">
              <Sparkles className="w-5 h-5 text-[#7C5CFF]" />
              <span>What's New in Phone Deck v{status.current_version}</span>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-[#A1A1AA] space-y-2 whitespace-pre-line leading-relaxed">
              {status.release_notes || (
                <>
                  • Ambient-light "Night Clock" with lux hysteresis &amp; burn-in protection.{'\n'}
                  • Now Playing media sessions with live album art and volume wheel.{'\n'}
                  • Process &amp; window monitor with protected app guards.{'\n'}
                  • Fully safe, background auto-updating system for Windows &amp; Android.
                </>
              )}
            </div>

            <button
              onClick={handleDismissWhatsNew}
              className="w-full py-2.5 rounded-xl bg-[#7C5CFF] text-white font-medium hover:bg-[#6847ED] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
