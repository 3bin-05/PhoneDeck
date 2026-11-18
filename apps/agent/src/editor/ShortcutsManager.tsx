import React, { useState, useEffect } from 'react';
import {
  Command,
  Plus,
  Play,
  Trash2,
  FolderSearch,
  Sparkles,
} from 'lucide-react';

export interface ShortcutItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  action: {
    type: string;
    payload?: any;
  };
  confirm: boolean;
  cooldown_ms: number;
  process_match?: string;
}

export interface InstalledApp {
  name: string;
  path: string;
}

export const ShortcutsManager: React.FC = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [scanning, setScanning] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [execStatus, setExecStatus] = useState<string | null>(null);

  // New shortcut form modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('Terminal');
  const [newColor, setNewColor] = useState('#7C5CFF');
  const [newActionType, setNewActionType] = useState('open_url');
  const [newActionParam, setNewActionParam] = useState('https://github.com');
  const [newConfirm, setNewConfirm] = useState(false);
  const [newCooldown, setNewCooldown] = useState(1000);
  const [newProcessMatch, setNewProcessMatch] = useState('');

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const fetchShortcuts = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<ShortcutItem[]>('get_shortcuts');
        setShortcuts(res);
      } catch (err) {
        console.error('Failed to get shortcuts from Tauri:', err);
      }
    } else {
      // Browser preview fallback
      setShortcuts([
        {
          id: 'open-vscode',
          name: 'VS Code',
          icon: 'Code',
          color: '#3B82F6',
          action: { type: 'run_command', payload: { cmd: 'code', args: ['.'] } },
          confirm: false,
          cooldown_ms: 1500,
          process_match: 'code.exe',
        },
        {
          id: 'open-repo',
          name: 'Project Dir',
          icon: 'Folder',
          color: '#F59E0B',
          action: { type: 'open_folder', payload: { path: '.' } },
          confirm: false,
          cooldown_ms: 1000,
        },
        {
          id: 'media-play',
          name: 'Play / Pause',
          icon: 'Play',
          color: '#7C5CFF',
          action: { type: 'quick_action', payload: { kind: 'media_play_pause' } },
          confirm: false,
          cooldown_ms: 300,
        },
        {
          id: 'screenshot',
          name: 'Snippet Tool',
          icon: 'Crop',
          color: '#00E599',
          action: { type: 'quick_action', payload: { kind: 'screenshot' } },
          confirm: false,
          cooldown_ms: 1000,
        },
        {
          id: 'lock-pc',
          name: 'Lock PC',
          icon: 'Lock',
          color: '#EF4444',
          action: { type: 'quick_action', payload: { kind: 'lock_pc' } },
          confirm: true,
          cooldown_ms: 2000,
        },
      ]);
    }
  };

  const handleScanApps = async () => {
    setScanning(true);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const apps = await invoke<InstalledApp[]>('scan_installed_apps');
        setInstalledApps(apps);
      } catch (err) {
        console.error('Failed to scan apps:', err);
      }
    } else {
      // Simulated scan results
      setInstalledApps([
        { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
        { name: 'Visual Studio Code', path: 'C:\\Program Files\\Microsoft VS Code\\Code.exe' },
        { name: 'Spotify', path: 'C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe' },
        { name: 'Discord', path: 'C:\\Users\\User\\AppData\\Local\\Discord\\Update.exe' },
        { name: 'Windows Terminal', path: 'wt.exe' },
      ]);
    }
    setScanning(false);
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<string>('execute_shortcut', { id });
        setExecStatus(`Success: ${res}`);
      } catch (err: any) {
        setExecStatus(`Error: ${err}`);
      }
    } else {
      setExecStatus(`Simulated execution of shortcut '${id}'`);
    }
    setTimeout(() => {
      setExecutingId(null);
      setExecStatus(null);
    }, 2500);
  };

  const handleAddFromApp = async (app: InstalledApp) => {
    const newShortcut: ShortcutItem = {
      id: `app-${app.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: app.name,
      icon: 'Command',
      color: '#7C5CFF',
      action: {
        type: 'launch_app',
        payload: { path: app.path, args: [] },
      },
      confirm: false,
      cooldown_ms: 1500,
      process_match: `${app.name.toLowerCase()}.exe`,
    };

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_shortcut', { shortcut: newShortcut });
      await fetchShortcuts();
    } else {
      setShortcuts((prev) => [...prev, newShortcut]);
    }
  };

  const handleSaveCustom = async () => {
    if (!newName.trim()) return;

    let action: any = { type: newActionType };
    if (newActionType === 'open_url') {
      action = { type: 'open_url', payload: { url: newActionParam } };
    } else if (newActionType === 'open_folder') {
      action = { type: 'open_folder', payload: { path: newActionParam } };
    } else if (newActionType === 'run_command') {
      action = { type: 'run_command', payload: { cmd: newActionParam, args: [] } };
    } else if (newActionType === 'quick_action') {
      action = { type: 'quick_action', payload: { kind: newActionParam } };
    }

    const item: ShortcutItem = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      icon: newIcon,
      color: newColor,
      action,
      confirm: newConfirm,
      cooldown_ms: newCooldown,
      process_match: newProcessMatch.trim() || undefined,
    };

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_shortcut', { shortcut: item });
      await fetchShortcuts();
    } else {
      setShortcuts((prev) => [...prev, item]);
    }

    setShowAddModal(false);
    setNewName('');
  };

  const handleDelete = async (id: string) => {
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_shortcut', { id });
      await fetchShortcuts();
    } else {
      setShortcuts((prev) => prev.filter((s) => s.id !== id));
    }
  };

  useEffect(() => {
    fetchShortcuts();
  }, []);

  return (
    <div className="w-full h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-white flex items-center space-x-2">
            <Command className="w-4 h-4 text-[#7C5CFF]" />
            <span>CUSTOM SHORTCUTS & ACTIONS</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Build and trigger PC actions from phone deck tiles. Phone sends only shortcut ID; commands live strictly on PC.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleScanApps}
            disabled={scanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-zinc-300 border border-white/[0.08] transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5 text-[#00E599]" />
            <span>{scanning ? 'Scanning...' : 'Scan Start Menu Apps'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#6847ED] text-xs font-mono text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Shortcut</span>
          </button>
        </div>
      </div>

      {execStatus && (
        <div className="p-3 bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 rounded-lg text-xs font-mono text-[#EDEDF2] flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-[#7C5CFF]" />
          <span>{execStatus}</span>
        </div>
      )}

      {/* Installed Apps Quick-Add Tray */}
      {installedApps.length > 0 && (
        <div className="p-4 bg-[#09090D] border border-white/[0.08] rounded-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="font-semibold text-zinc-200">
              Detected Installed Applications ({installedApps.length})
            </span>
            <span>Click to add shortcut in 1 tap</span>
          </div>

          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
            {installedApps.map((app, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.12] text-xs font-mono"
              >
                <span className="truncate text-zinc-200 mr-2">{app.name}</span>
                <button
                  onClick={() => handleAddFromApp(app)}
                  className="px-2 py-0.5 rounded bg-[#7C5CFF]/20 text-[#7C5CFF] hover:bg-[#7C5CFF] hover:text-white text-[10px] font-semibold transition-colors shrink-0"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configured Shortcuts Table */}
      <div className="grid grid-cols-2 gap-3">
        {shortcuts.map((sc) => {
          const isBusy = executingId === sc.id;
          return (
            <div
              key={sc.id}
              className="p-3.5 bg-[#09090D] border border-white/[0.08] rounded-xl flex items-center justify-between hover:border-white/[0.16] transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: `${sc.color}20`,
                    color: sc.color,
                    border: `1px solid ${sc.color}40`,
                  }}
                >
                  <Command className="w-4 h-4" />
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-white">
                      {sc.name}
                    </span>
                    {sc.confirm && (
                      <span className="text-[9px] px-1 rounded bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30">
                        CONFIRM
                      </span>
                    )}
                    {sc.process_match && (
                      <span className="text-[9px] px-1 rounded bg-white/[0.05] text-zinc-400 font-mono">
                        {sc.process_match}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    ID: {sc.id} · CD: {sc.cooldown_ms}ms · Action: {sc.action.type}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleExecute(sc.id)}
                  disabled={isBusy}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white/[0.04] hover:bg-[#7C5CFF] hover:text-white text-zinc-300 text-xs font-mono transition-colors"
                  title="Test execute on PC"
                >
                  <Play className="w-3 h-3" />
                  <span>{isBusy ? 'Running...' : 'Test Run'}</span>
                </button>

                <button
                  onClick={() => handleDelete(sc.id)}
                  className="p-1 rounded text-zinc-500 hover:text-[#EF4444] transition-colors"
                  title="Delete shortcut"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Shortcut Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111116] border border-white/[0.12] rounded-2xl w-full max-w-md p-5 space-y-4 font-mono text-xs shadow-2xl">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-[#7C5CFF]" />
              <span>Create New Shortcut</span>
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Open Figma"
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Icon</label>
                  <select
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none cursor-pointer"
                  >
                    <option value="Terminal">Terminal</option>
                    <option value="Code">Code (Editor)</option>
                    <option value="Folder">Folder</option>
                    <option value="Play">Play / Pause</option>
                    <option value="Crop">Snippet</option>
                    <option value="Lock">Lock</option>
                    <option value="Command">Command</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Color</label>
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full h-8 bg-transparent cursor-pointer rounded"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Cooldown (ms)</label>
                  <input
                    type="number"
                    value={newCooldown}
                    onChange={(e) => setNewCooldown(Number(e.target.value))}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Process Match (for 'Is Running' dot)</label>
                <input
                  type="text"
                  value={newProcessMatch}
                  onChange={(e) => setNewProcessMatch(e.target.value)}
                  placeholder="e.g. code.exe or spotify.exe (optional)"
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Action Type</label>
                <select
                  value={newActionType}
                  onChange={(e) => setNewActionType(e.target.value)}
                  className="w-full bg-[#1A1A22] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none cursor-pointer"
                >
                  <option value="open_url">Open URL (Browser)</option>
                  <option value="open_folder">Open Directory Folder</option>
                  <option value="run_command">Execute CLI Command</option>
                  <option value="quick_action">Quick Action (Lock/Mute/Media/Snippet)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Target Path / Param</label>
                <input
                  type="text"
                  value={newActionParam}
                  onChange={(e) => setNewActionParam(e.target.value)}
                  placeholder="e.g. https://... or C:\... or lock_pc"
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="confirm-cb"
                  checked={newConfirm}
                  onChange={(e) => setNewConfirm(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="confirm-cb" className="text-zinc-300 cursor-pointer">
                  Require Confirm-Before-Run on Phone
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/[0.08]">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustom}
                className="px-4 py-1.5 rounded bg-[#7C5CFF] hover:bg-[#6847ED] text-white font-medium"
              >
                Save Shortcut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
