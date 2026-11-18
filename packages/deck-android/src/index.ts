export interface ThermalStatusResponse {
  status: number; // 0 = None, 1 = Light, 2 = Moderate, 3 = Severe, 4 = Critical
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function keepScreenOn(enabled: boolean = true): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|keepScreenOn', { enabled });
    } catch (e) {
      console.warn('keepScreenOn invoke failed:', e);
    }
  }
}

export async function acquireWifiLock(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|acquireWifiLock');
    } catch (e) {
      console.warn('acquireWifiLock invoke failed:', e);
    }
  }
}

export async function releaseWifiLock(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|releaseWifiLock');
    } catch (e) {
      console.warn('releaseWifiLock invoke failed:', e);
    }
  }
}

export async function startForegroundService(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|startForegroundService');
    } catch (e) {
      console.warn('startForegroundService invoke failed:', e);
    }
  }
}

export async function stopForegroundService(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|stopForegroundService');
    } catch (e) {
      console.warn('stopForegroundService invoke failed:', e);
    }
  }
}

export async function vibrate(kind: 'done' | 'needs_input' | 'approval' | 'error' | 'alert' = 'done'): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|vibrate', { kind });
      return;
    } catch {}
  }

  // Fallback to Web Vibration API if in browser / mobile webview
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    if (kind === 'done') navigator.vibrate([100, 50, 150]);
    else if (kind === 'needs_input' || kind === 'approval') navigator.vibrate([200, 100, 200]);
    else if (kind === 'error') navigator.vibrate([300, 100, 300]);
    else navigator.vibrate(80);
  }
}

export async function getThermalStatus(): Promise<number> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<ThermalStatusResponse>('plugin:deck-android|getThermalStatus');
      return res.status;
    } catch {}
  }
  return 0; // Normal
}

export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:deck-android|requestBatteryOptimizationExemption');
    } catch (e) {
      console.warn('requestBatteryOptimizationExemption failed:', e);
    }
  }
}

export async function installApk(path: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:deck-android|installApk', { path });
  }
}
