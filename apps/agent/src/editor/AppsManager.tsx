import { useState, useEffect } from 'react';
import {
  AppCardWidget,
  AppTileWidget,
  type AppRuntimeData,
  type AppQuickLaunch,
} from '@phone-deck/widgets';
import {
  Plus,
  Trash2,
  Save,
  Search,
  ExternalLink,
  Code,
  Compass,
  Flame,
  Globe,
  Music,
  Terminal,
  Folder,
  Sparkles,
  RefreshCw,
  X,
  Check,
} from 'lucide-react';

export interface AppDefinitionData {
  id: string;
  name: string;
  match_rules: {
    exe_names: string[];
    window_class?: string;
    title_regex?: string;
  };
  launch: {
    path: string;
    args: string[];
  };
  quick_launches: AppQuickLaunch[];
  actions: string[];
  title_parser?: {
    parser_type: string;
    template?: string;
    strip_suffix?: string;
  };
  icon: string;
}

export interface RunningProcessItem {
  pid: number;
  name: string;
  exe_path?: string;
  window_title?: string;
}

const DEFAULT_PRESETS: AppDefinitionData[] = [
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    match_rules: { exe_names: ['code.exe', 'code'] },
    launch: { path: 'code', args: ['.'] },
    quick_launches: [
      { id: 'proj', label: 'Project', value: '.' },
      { id: 'new-win', label: '+ Win', value: '-n' },
    ],
    actions: ['focus', 'new_window', 'close_window', 'quit'],
    title_parser: {
      parser_type: 'vscode',
      template: '{file} - {project} - Visual Studio Code',
      strip_suffix: ' - Visual Studio Code',
    },
    icon: 'Code',
  },
  {
    id: 'opera',
    name: 'Opera',
    match_rules: { exe_names: ['opera.exe'] },
    launch: { path: 'opera', args: [] },
    quick_launches: [
      { id: 'google', label: 'Search', value: 'https://google.com' },
      { id: 'github', label: 'GitHub', value: 'https://github.com' },
    ],
    actions: ['focus', 'new_window', 'private_window', 'close_window', 'quit'],
    title_parser: {
      parser_type: 'browser',
      strip_suffix: ' - Opera',
    },
    icon: 'Compass',
  },
  {
    id: 'operagx',
    name: 'Opera GX',
    match_rules: { exe_names: ['opera.exe'] },
    launch: { path: 'opera', args: [] },
    quick_launches: [
      { id: 'twitch', label: 'Twitch', value: 'https://twitch.tv' },
      { id: 'ytm', label: 'YTM', value: 'https://music.youtube.com' },
    ],
    actions: ['focus', 'new_window', 'private_window', 'close_window', 'quit'],
    title_parser: {
      parser_type: 'browser',
      strip_suffix: ' - Opera GX',
    },
    icon: 'Flame',
  },
  {
    id: 'chrome',
    name: 'Google Chrome',
    match_rules: { exe_names: ['chrome.exe'] },
    launch: { path: 'chrome', args: [] },
    quick_launches: [{ id: 'newtab', label: 'New Tab', value: 'chrome://newtab' }],
    actions: ['focus', 'new_window', 'private_window', 'close_window', 'quit'],
    title_parser: {
      parser_type: 'browser',
      strip_suffix: ' - Google Chrome',
    },
    icon: 'Globe',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    match_rules: { exe_names: ['spotify.exe'] },
    launch: { path: 'spotify', args: [] },
    quick_launches: [],
    actions: ['focus', 'close_window', 'quit'],
    icon: 'Music',
  },
  {
    id: 'terminal',
    name: 'Windows Terminal',
    match_rules: { exe_names: ['wt.exe', 'windowsterminal.exe'] },
    launch: { path: 'wt', args: [] },
    quick_launches: [{ id: 'pwsh', label: 'PowerShell', value: 'pwsh' }],
    actions: ['focus', 'new_window', 'close_window', 'quit'],
    icon: 'Terminal',
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    match_rules: { exe_names: ['explorer.exe'] },
    launch: { path: 'explorer', args: ['.'] },
    quick_launches: [{ id: 'dl', label: 'Downloads', value: 'shell:Downloads' }],
    actions: ['focus', 'new_window'],
    icon: 'Folder',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    match_rules: { exe_names: ['antigravity.exe', 'agent.exe'] },
    launch: { path: 'antigravity', args: [] },
    quick_launches: [],
    actions: ['focus'],
    icon: 'Sparkles',
  },
];

export function AppsManager() {
  const [apps, setApps] = useState<AppDefinitionData[]>(DEFAULT_PRESETS);
  const [selectedAppId, setSelectedAppId] = useState<string>('vscode');
  const [runningProcesses, setRunningProcesses] = useState<RunningProcessItem[]>([]);
  const [showProcessPicker, setShowProcessPicker] = useState(false);
  const [processSearch, setProcessSearch] = useState('');
  const [testTitle, setTestTitle] = useState('● App.tsx - PhoneDeck - Visual Studio Code');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const loadApps = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<AppDefinitionData[]>('get_app_registry');
        if (res && res.length > 0) {
          setApps(res);
        }
      } catch (err) {
        console.error('Failed to load app registry:', err);
      }
    }
  };

  const fetchRunningProcesses = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const list = await invoke<RunningProcessItem[]>('get_running_processes');
        setRunningProcesses(list);
      } catch (err) {
        console.error('Failed to get running processes:', err);
      }
    } else {
      setRunningProcesses([
        { pid: 1420, name: 'code.exe', exe_path: 'C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', window_title: 'App.tsx - PhoneDeck - Visual Studio Code' },
        { pid: 3820, name: 'opera.exe', exe_path: 'C:\\Users\\User\\AppData\\Local\\Programs\\Opera GX\\opera.exe', window_title: 'YouTube Music - Opera GX' },
        { pid: 8192, name: 'antigravity.exe', exe_path: 'C:\\Users\\User\\AppData\\Local\\Antigravity\\antigravity.exe', window_title: 'Antigravity Agent Hub' },
        { pid: 9140, name: 'spotify.exe', exe_path: 'C:\\Users\\User\\AppData\\Roaming\\Spotify\\Spotify.exe', window_title: 'Spotify Free' },
        { pid: 1120, name: 'wt.exe', exe_path: 'C:\\Program Files\\WindowsApps\\wt.exe', window_title: 'PowerShell 7' },
      ]);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const selectedApp = apps.find((a) => a.id === selectedAppId) || apps[0];

  const updateSelectedApp = (patch: Partial<AppDefinitionData>) => {
    setApps((prev) =>
      prev.map((a) => (a.id === selectedApp.id ? { ...a, ...patch } : a))
    );
  };

  const handleSaveApp = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_app_definition', { app: selectedApp });
      } catch (err) {
        console.error('Failed to save app:', err);
      }
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleAddNewApp = () => {
    const newId = `custom-app-${Date.now().toString(36)}`;
    const newApp: AppDefinitionData = {
      id: newId,
      name: 'New Custom App',
      match_rules: { exe_names: ['app.exe'] },
      launch: { path: 'app', args: [] },
      quick_launches: [],
      actions: ['focus', 'close_window'],
      icon: 'ExternalLink',
    };
    setApps([...apps, newApp]);
    setSelectedAppId(newId);
  };

  const handleDeleteApp = async (id: string) => {
    if (apps.length <= 1) return;
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_app_definition', { id });
      } catch (err) {
        console.error('Failed to delete app:', err);
      }
    }
    const remaining = apps.filter((a) => a.id !== id);
    setApps(remaining);
    setSelectedAppId(remaining[0].id);
  };

  // Title parser live test simulation
  const parseTitlePreview = (raw: string, parser?: AppDefinitionData['title_parser']) => {
    if (!raw.trim()) return { project: '-', file: '-', unsaved: false, tab: '-' };
    if (!parser) return { project: '-', file: '-', unsaved: false, tab: raw };

    if (parser.parser_type === 'vscode') {
      const unsaved = raw.includes('●') || raw.startsWith('*');
      const clean = raw.replace('●', '').replace('*', '').replace(' - Visual Studio Code', '').trim();
      const parts = clean.split(' - ');
      return {
        file: parts.length >= 2 ? parts[0].trim() : '-',
        project: parts.length >= 2 ? parts[1].trim() : parts[0].trim(),
        unsaved,
        tab: '-',
      };
    } else if (parser.parser_type === 'browser') {
      let t = raw;
      if (parser.strip_suffix) t = t.replace(parser.strip_suffix, '');
      t = t.replace(' - Opera GX', '').replace(' - Opera', '').replace(' - Google Chrome', '').trim();
      return { project: '-', file: '-', unsaved: false, tab: t };
    }
    return { project: '-', file: '-', unsaved: false, tab: raw };
  };

  const titleTestResult = parseTitlePreview(testTitle, selectedApp?.title_parser);

  // Runtime mock data for live card preview
  const previewRuntimeData: AppRuntimeData = {
    id: selectedApp?.id || 'app',
    name: selectedApp?.name || 'App',
    running: true,
    instances: 1,
    focused: true,
    project: titleTestResult.project !== '-' ? titleTestResult.project : selectedApp?.name,
    file: titleTestResult.file !== '-' ? titleTestResult.file : undefined,
    unsaved: titleTestResult.unsaved,
    tab_title: titleTestResult.tab !== '-' ? titleTestResult.tab : undefined,
    audio_active: selectedApp?.id === 'opera' || selectedApp?.id === 'operagx',
    cpu_pct: 1.4,
    ram_bytes: 420_000_000,
    icon: selectedApp?.icon,
    quick_launches: selectedApp?.quick_launches,
    actions: selectedApp?.actions,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-mono text-xs select-none">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
            <span>App Registry &amp; Widgets</span>
            <span className="text-[10px] text-[#7C5CFF] font-normal px-2 py-0.5 rounded bg-[#7C5CFF]/10 border border-[#7C5CFF]/20">
              Part C
            </span>
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Manage detected applications, window title parsing rules, quick-launch chips, and foreground focusing workarounds.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleAddNewApp}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] flex items-center space-x-1.5 cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-[#00E599]" />
            <span>Add App</span>
          </button>

          <button
            onClick={handleSaveApp}
            className="px-3 py-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#6847ED] text-white font-medium flex items-center space-x-1.5 cursor-pointer transition-all shadow-lg"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Registry</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left App List Sidebar */}
        <div className="col-span-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 font-semibold">
            Registered Applications ({apps.length})
          </div>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {apps.map((app) => {
              const isSelected = app.id === selectedApp?.id;
              return (
                <div
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/40 text-white'
                      : 'bg-[#08080C] border-white/[0.06] hover:bg-white/[0.04] text-zinc-400'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected ? 'bg-[#7C5CFF]/20 text-[#7C5CFF]' : 'bg-white/[0.04] text-zinc-400'
                      }`}
                    >
                      {app.icon === 'Code' && <Code className="w-4 h-4" />}
                      {app.icon === 'Compass' && <Compass className="w-4 h-4" />}
                      {app.icon === 'Flame' && <Flame className="w-4 h-4" />}
                      {app.icon === 'Globe' && <Globe className="w-4 h-4" />}
                      {app.icon === 'Music' && <Music className="w-4 h-4" />}
                      {app.icon === 'Terminal' && <Terminal className="w-4 h-4" />}
                      {app.icon === 'Folder' && <Folder className="w-4 h-4" />}
                      {app.icon === 'Sparkles' && <Sparkles className="w-4 h-4" />}
                      {!['Code', 'Compass', 'Flame', 'Globe', 'Music', 'Terminal', 'Folder', 'Sparkles'].includes(app.icon) && (
                        <ExternalLink className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate leading-tight text-white">
                        {app.name}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate font-mono mt-0.5">
                        {app.match_rules.exe_names.join(', ')}
                      </div>
                    </div>
                  </div>

                  {app.id !== 'vscode' && app.id !== 'opera' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteApp(app.id);
                      }}
                      className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Delete App"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Editor & Preview Pane */}
        {selectedApp && (
          <div className="col-span-8 space-y-5">
            {/* Top Form Box */}
            <div className="p-4 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <span className="font-semibold text-white">App Configuration: {selectedApp.name}</span>
                <button
                  onClick={() => {
                    fetchRunningProcesses();
                    setShowProcessPicker(true);
                  }}
                  className="px-2.5 py-1 rounded bg-[#7C5CFF]/15 hover:bg-[#7C5CFF]/25 text-[#7C5CFF] border border-[#7C5CFF]/30 text-[10px] font-medium flex items-center space-x-1.5 cursor-pointer"
                >
                  <Search className="w-3 h-3" />
                  <span>Detect from running processes</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={selectedApp.name}
                    onChange={(e) => updateSelectedApp({ name: e.target.value })}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#7C5CFF]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500 uppercase block mb-1">Executable Match List (comma-separated)</label>
                  <input
                    type="text"
                    value={selectedApp.match_rules.exe_names.join(', ')}
                    onChange={(e) =>
                      updateSelectedApp({
                        match_rules: {
                          ...selectedApp.match_rules,
                          exe_names: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                        },
                      })
                    }
                    placeholder="code.exe, code"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#7C5CFF]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500 uppercase block mb-1">Launch Path / Command</label>
                  <input
                    type="text"
                    value={selectedApp.launch.path}
                    onChange={(e) =>
                      updateSelectedApp({
                        launch: { ...selectedApp.launch, path: e.target.value },
                      })
                    }
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#7C5CFF]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500 uppercase block mb-1">Icon Style</label>
                  <select
                    value={selectedApp.icon}
                    onChange={(e) => updateSelectedApp({ icon: e.target.value })}
                    className="w-full bg-[#121218] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#7C5CFF]"
                  >
                    <option value="Code">Code (VS Code)</option>
                    <option value="Compass">Compass (Opera)</option>
                    <option value="Flame">Flame (Opera GX)</option>
                    <option value="Globe">Globe (Chrome)</option>
                    <option value="Music">Music (Spotify)</option>
                    <option value="Terminal">Terminal</option>
                    <option value="Folder">Folder (Explorer)</option>
                    <option value="Sparkles">Sparkles (Antigravity)</option>
                    <option value="ExternalLink">Generic App</option>
                  </select>
                </div>
              </div>

              {/* Title Parser Configuration Box */}
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#7C5CFF] uppercase font-semibold">
                    Title Parser (Server-side Parsing)
                  </span>
                  <div className="flex items-center space-x-2">
                    {['none', 'vscode', 'browser'].map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          updateSelectedApp({
                            title_parser:
                              type === 'none'
                                ? undefined
                                : {
                                    parser_type: type,
                                    strip_suffix:
                                      type === 'vscode'
                                        ? ' - Visual Studio Code'
                                        : ' - Opera GX',
                                  },
                          })
                        }
                        className={`px-2 py-0.5 rounded text-[9px] font-mono cursor-pointer uppercase ${
                          (selectedApp.title_parser?.parser_type || 'none') === type
                            ? 'bg-[#7C5CFF] text-white'
                            : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedApp.title_parser && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-500 text-[9px] uppercase block mb-0.5">Strip Suffix</span>
                      <input
                        type="text"
                        value={selectedApp.title_parser.strip_suffix || ''}
                        onChange={(e) =>
                          updateSelectedApp({
                            title_parser: {
                              ...selectedApp.title_parser!,
                              strip_suffix: e.target.value,
                            },
                          })
                        }
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-white"
                      />
                    </div>

                    <div>
                      <span className="text-zinc-500 text-[9px] uppercase block mb-0.5">Live Title Tester</span>
                      <input
                        type="text"
                        value={testTitle}
                        onChange={(e) => setTestTitle(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-white text-[10px]"
                      />
                    </div>
                  </div>
                )}

                {/* Parser Live Output */}
                <div className="p-2 rounded bg-white/[0.02] border border-white/[0.04] flex items-center justify-between text-[10px] font-mono">
                  <span>Project: <strong className="text-white">{titleTestResult.project}</strong></span>
                  <span>File: <strong className="text-white">{titleTestResult.file}</strong></span>
                  <span>Unsaved: <strong className={titleTestResult.unsaved ? 'text-amber-400' : 'text-zinc-500'}>{titleTestResult.unsaved ? 'YES (●)' : 'NO'}</strong></span>
                  <span>Tab: <strong className="text-[#00E599]">{titleTestResult.tab}</strong></span>
                </div>
              </div>
            </div>

            {/* Quick Launches Section */}
            <div className="p-4 rounded-2xl bg-[#08080C] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
                <span className="font-semibold text-white">Quick Launch Chips</span>
                <button
                  onClick={() => {
                    const newQl: AppQuickLaunch = {
                      id: `ql-${Date.now().toString(36)}`,
                      label: 'New Chip',
                      value: '.',
                    };
                    updateSelectedApp({
                      quick_launches: [...(selectedApp.quick_launches || []), newQl],
                    });
                  }}
                  className="px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-white text-[10px] flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3 text-[#00E599]" />
                  <span>Add Chip</span>
                </button>
              </div>

              <div className="space-y-2">
                {selectedApp.quick_launches?.map((ql, idx) => (
                  <div key={ql.id} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={ql.label}
                      onChange={(e) => {
                        const updated = [...(selectedApp.quick_launches || [])];
                        updated[idx].label = e.target.value;
                        updateSelectedApp({ quick_launches: updated });
                      }}
                      placeholder="Label"
                      className="w-1/3 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-white"
                    />
                    <input
                      type="text"
                      value={ql.value}
                      onChange={(e) => {
                        const updated = [...(selectedApp.quick_launches || [])];
                        updated[idx].value = e.target.value;
                        updateSelectedApp({ quick_launches: updated });
                      }}
                      placeholder="Folder Path or URL argument"
                      className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-white"
                    />
                    <button
                      onClick={() => {
                        const updated = selectedApp.quick_launches?.filter((q) => q.id !== ql.id);
                        updateSelectedApp({ quick_launches: updated });
                      }}
                      className="p-1 text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Phone Widget Preview */}
            <div className="p-4 rounded-2xl bg-[#050508] border border-white/[0.08] space-y-3">
              <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                Live Phone Widget Preview (Phone Deck UI)
              </div>

              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-8 h-44">
                  <AppCardWidget app={previewRuntimeData} />
                </div>
                <div className="col-span-4 h-44 flex items-center justify-center">
                  <div className="w-24 h-24">
                    <AppTileWidget app={previewRuntimeData} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Process Detection Modal Picker */}
      {showProcessPicker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#09090D] border border-white/[0.12] rounded-2xl p-5 shadow-2xl font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2 text-white font-semibold">
                <Search className="w-4 h-4 text-[#7C5CFF]" />
                <span>Running Processes Picker</span>
              </div>
              <button
                onClick={() => setShowProcessPicker(false)}
                className="text-zinc-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Filter by process name or window title..."
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C5CFF]"
              />
              <button
                onClick={fetchRunningProcesses}
                className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300"
                title="Refresh processes"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {runningProcesses
                .filter(
                  (p) =>
                    p.name.toLowerCase().includes(processSearch.toLowerCase()) ||
                    (p.window_title && p.window_title.toLowerCase().includes(processSearch.toLowerCase()))
                )
                .map((proc) => (
                  <div
                    key={`${proc.pid}-${proc.name}`}
                    onClick={() => {
                      updateSelectedApp({
                        name: proc.window_title ? proc.window_title.split('-')[0].trim() : proc.name.replace('.exe', ''),
                        match_rules: {
                          ...selectedApp?.match_rules,
                          exe_names: [proc.name.toLowerCase()],
                        },
                        launch: {
                          path: proc.exe_path || proc.name,
                          args: selectedApp?.launch.args || [],
                        },
                      });
                      setShowProcessPicker(false);
                    }}
                    className="p-2 rounded-lg bg-white/[0.02] hover:bg-[#7C5CFF]/15 border border-white/[0.04] hover:border-[#7C5CFF]/30 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-white font-semibold truncate">{proc.name}</div>
                      <div className="text-[10px] text-zinc-500 truncate font-mono">
                        {proc.window_title || proc.exe_path || `PID ${proc.pid}`}
                      </div>
                    </div>
                    <span className="text-[10px] text-[#7C5CFF] shrink-0 font-mono ml-2">SELECT</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
