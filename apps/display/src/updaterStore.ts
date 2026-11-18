import { create } from 'zustand';
import {
  canRequestPackageInstalls,
  openInstallPermissionSettings,
  installApkSession,
  launchPendingUserAction,
  onInstallStatus,
  type InstallStatusEvent,
} from '@phone-deck/android-plugin';

export interface ApkArtifact {
  abi: string;
  url: string;
  size: number;
  sha256: string;
}

export interface AndroidReleaseManifest {
  version_name: string;
  version_code: number;
  min_protocol: number;
  protocol: number;
  released_at: string;
  changelog: string;
  signing_cert_sha256: string;
  apks: ApkArtifact[];
}

export interface DisplayUpdaterConfig {
  auto_update: boolean;
  wifi_only: boolean;
  check_interval_secs: number;
  channel: string;
  last_checked: number | null;
  last_etag: string | null;
  installed_version_code: number;
  installed_version_name: string;
}

export interface DisplayUpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready_to_install' | 'installing' | 'error';
  manifest: AndroidReleaseManifest | null;
  selected_apk: ApkArtifact | null;
  downloaded_bytes: number;
  total_bytes: number;
  progress_pct: number;
  error: string | null;
  cached_apk_path: string | null;
  pending_user_action: boolean;
  protocol_incompatible: boolean;
}

interface UpdaterState {
  status: DisplayUpdateStatus;
  config: DisplayUpdaterConfig;
  isPcUpdating: boolean;
  pcUpdatingEtaSec: number;
  whatsNewDismissed: boolean;
  canInstallUnknown: boolean;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  saveConfig: (cfg: Partial<DisplayUpdaterConfig>) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installStagedUpdate: () => Promise<void>;
  launchPendingAction: () => Promise<void>;
  setPcUpdating: (updating: boolean, etaSec?: number) => void;
  dismissWhatsNew: () => void;
  initUpdater: () => () => void;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: {
    state: 'idle',
    manifest: null,
    selected_apk: null,
    downloaded_bytes: 0,
    total_bytes: 0,
    progress_pct: 0,
    error: null,
    cached_apk_path: null,
    pending_user_action: false,
    protocol_incompatible: false,
  },
  config: {
    auto_update: true,
    wifi_only: true,
    check_interval_secs: 21600,
    channel: 'stable',
    last_checked: null,
    last_etag: null,
    installed_version_code: 100,
    installed_version_name: '0.1.0',
  },
  isPcUpdating: false,
  pcUpdatingEtaSec: 30,
  whatsNewDismissed: false,
  canInstallUnknown: true,

  fetchStatus: async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const st = await invoke<DisplayUpdateStatus>('get_display_updater_status');
      set({ status: st });
    } catch (e) {
      console.warn('Failed to fetch display updater status:', e);
    }
  },

  fetchConfig: async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg = await invoke<DisplayUpdaterConfig>('get_display_updater_config');
      set({ config: cfg });
    } catch (e) {
      console.warn('Failed to fetch display updater config:', e);
    }
  },

  saveConfig: async (cfgUpdates) => {
    const updated = { ...get().config, ...cfgUpdates };
    set({ config: updated });
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_display_updater_config', { config: updated });
    } catch (e) {
      console.warn('Failed to save display updater config:', e);
    }
  },

  checkForUpdates: async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('check_display_updates');
      await get().fetchStatus();
    } catch (e) {
      console.warn('Failed to check display updates:', e);
    }
  },

  downloadUpdate: async () => {
    if (!isTauri) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('download_display_update');
      await get().fetchStatus();
    } catch (e) {
      console.error('Download update error:', e);
      await get().fetchStatus();
    }
  },

  installStagedUpdate: async () => {
    const st = get().status;
    if (!st.cached_apk_path) return;

    // Check unknown sources permission first
    const allowed = await canRequestPackageInstalls();
    if (!allowed) {
      set({ canInstallUnknown: false });
      await openInstallPermissionSettings();
      return;
    }

    try {
      await installApkSession(st.cached_apk_path, true);
    } catch (e) {
      console.error('Failed to trigger installApkSession:', e);
    }
  },

  launchPendingAction: async () => {
    try {
      await launchPendingUserAction();
    } catch (e) {
      console.error('Failed to launch pending user action:', e);
    }
  },

  setPcUpdating: (updating: boolean, etaSec: number = 30) => {
    set({ isPcUpdating: updating, pcUpdatingEtaSec: etaSec });
  },

  dismissWhatsNew: () => {
    set({ whatsNewDismissed: true });
    try {
      localStorage.setItem('phone_deck_whats_new_dismissed', 'true');
    } catch {}
  },

  initUpdater: () => {
    let unlistenStatus: (() => void) | null = null;

    // 1. Listen for install status events from Android Kotlin plugin
    onInstallStatus((event: InstallStatusEvent) => {
      console.log('[DisplayUpdater] Plugin event:', event);
      if (event.state === 'pending_user_action') {
        set((prev) => ({
          status: { ...prev.status, pending_user_action: true },
        }));
      } else if (event.state === 'failure') {
        set((prev) => ({
          status: {
            ...prev.status,
            state: 'error',
            error: event.message,
            pending_user_action: false,
          },
        }));
      }
    }).then((unlisten: any) => {
      unlistenStatus = unlisten;
    });

    // 2. Initial status and config load
    get().fetchConfig();
    get().fetchStatus();

    // 3. Poll status during download every 500ms
    const interval = setInterval(() => {
      if (get().status.state === 'downloading' || get().status.state === 'checking') {
        get().fetchStatus();
      }
    }, 500);

    return () => {
      if (unlistenStatus) unlistenStatus();
      clearInterval(interval);
    };
  },
}));
