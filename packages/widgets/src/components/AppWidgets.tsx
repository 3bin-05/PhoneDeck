import React, { useState, useRef } from 'react';
import {
  Code,
  Compass,
  Flame,
  Globe,
  Music,
  MessageSquare,
  Terminal,
  Folder,
  Sparkles,
  ExternalLink,
  Plus,
  X,
  Power,
  Volume2,
  Lock,
} from 'lucide-react';

export interface AppQuickLaunch {
  id: string;
  label: string;
  value: string;
}

export interface AppRuntimeData {
  id: string;
  name: string;
  running?: boolean;
  instances?: number;
  focused?: boolean;
  cpu_pct?: number;
  ram_bytes?: number;
  window_titles?: string[];
  project?: string;
  file?: string;
  unsaved?: boolean;
  tab_title?: string;
  audio_active?: boolean;
  icon?: string;
  icon_url?: string;
  quick_launches?: AppQuickLaunch[];
  actions?: string[];
}

export interface AppWidgetProps {
  app: AppRuntimeData;
  accentColor?: string;
  onAction?: (appId: string, action: string, quickLaunchId?: string) => void;
}

export interface AppDockProps {
  apps: AppRuntimeData[];
  sortRunningFirst?: boolean;
  accentColor?: string;
  onAction?: (appId: string, action: string, quickLaunchId?: string) => void;
}

export function renderAppIcon(iconName?: string, className = 'w-5 h-5') {
  switch (iconName?.toLowerCase()) {
    case 'code':
    case 'vscode':
      return <Code className={className} />;
    case 'compass':
    case 'opera':
      return <Compass className={className} />;
    case 'flame':
    case 'operagx':
      return <Flame className={className} />;
    case 'globe':
    case 'chrome':
      return <Globe className={className} />;
    case 'music':
    case 'spotify':
      return <Music className={className} />;
    case 'messagesquare':
    case 'discord':
      return <MessageSquare className={className} />;
    case 'terminal':
      return <Terminal className={className} />;
    case 'folder':
    case 'explorer':
      return <Folder className={className} />;
    case 'sparkles':
    case 'antigravity':
      return <Sparkles className={className} />;
    default:
      return <ExternalLink className={className} />;
  }
}

/**
 * 1. App Tile Widget (Small)
 * Icon, running dot, focused ring. Tap = focus or launch, long press = action sheet.
 */
export const AppTileWidget: React.FC<AppWidgetProps> = React.memo((props) => {
  const { app, accentColor = '#7C5CFF', onAction } = props;
  const [showSheet, setShowSheet] = useState(false);
  const [holdConfirmAction, setHoldConfirmAction] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = Boolean(app.running);
  const isFocused = Boolean(app.focused);

  const handlePointerDown = () => {
    // 600ms long press opens action sheet
    holdTimerRef.current = setTimeout(() => {
      setShowSheet(true);
    }, 600);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showSheet) {
      onAction?.(app.id, isRunning ? 'focus' : 'launch');
    }
  };

  const startHoldConfirm = (action: string) => {
    setHoldConfirmAction(action);
    setHoldProgress(0);

    const startTime = Date.now();
    const duration = 1200; // 1.2s hold to confirm destructive action

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(pct);

      if (pct >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        onAction?.(app.id, action);
        setHoldConfirmAction(null);
        setHoldProgress(0);
        setShowSheet(false);
      }
    }, 30);
  };

  const cancelHoldConfirm = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldConfirmAction(null);
    setHoldProgress(0);
  };

  return (
    <div className="relative w-full h-full select-none">
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        className={`w-full h-full p-2.5 rounded-xl bg-[#09090D] border transition-all cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group active:scale-95 ${
          isFocused
            ? 'border-[#7C5CFF] shadow-[0_0_12px_rgba(124,92,255,0.35)]'
            : isRunning
            ? 'border-white/[0.14] hover:border-white/[0.25]'
            : 'border-white/[0.06] opacity-70 hover:opacity-100 hover:border-white/[0.12]'
        }`}
      >
        {/* Focused Ring Indicator */}
        {isFocused && (
          <div className="absolute inset-0 rounded-xl border border-[#7C5CFF] pointer-events-none animate-pulse" />
        )}

        {/* Icon & Running Dot */}
        <div className="relative flex items-center justify-center mb-1">
          <div
            style={{ color: isRunning ? '#EDEDF2' : '#71717A' }}
            className="transition-colors"
          >
            {renderAppIcon(app.icon || app.id, 'w-6 h-6')}
          </div>

          {/* Running Dot */}
          {isRunning && (
            <span
              style={{ backgroundColor: isFocused ? accentColor : '#00E599' }}
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full shadow-sm"
            />
          )}
        </div>

        {/* Name */}
        <span className="text-[10px] font-medium text-white truncate max-w-full text-center tracking-tight leading-tight">
          {app.name}
        </span>

        {/* Instances or Audio badge */}
        {isRunning && app.audio_active && (
          <div className="flex items-center space-x-1 mt-0.5 text-[8px] font-mono text-[#00E599]">
            <Volume2 className="w-2.5 h-2.5 animate-pulse" />
            <span>AUDIO</span>
          </div>
        )}
      </div>

      {/* Action Sheet Popover */}
      {showSheet && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowSheet(false);
          }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-[#09090D] border border-white/[0.12] rounded-2xl p-4 shadow-2xl font-mono text-xs space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center space-x-2">
                <div style={{ color: accentColor }}>
                  {renderAppIcon(app.icon || app.id, 'w-4 h-4')}
                </div>
                <span className="font-semibold text-white">{app.name}</span>
              </div>
              <button
                onClick={() => setShowSheet(false)}
                className="text-zinc-500 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => {
                  onAction?.(app.id, isRunning ? 'focus' : 'launch');
                  setShowSheet(false);
                }}
                className="w-full py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-left text-white text-[11px] flex items-center justify-between"
              >
                <span>{isRunning ? 'Bring to Foreground' : 'Launch Application'}</span>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              <button
                onClick={() => {
                  onAction?.(app.id, 'new_window');
                  setShowSheet(false);
                }}
                className="w-full py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-left text-white text-[11px] flex items-center justify-between"
              >
                <span>New Window</span>
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {app.actions?.includes('private_window') && (
                <button
                  onClick={() => {
                    onAction?.(app.id, 'private_window');
                    setShowSheet(false);
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-left text-white text-[11px] flex items-center justify-between"
                >
                  <span>Private / Incognito</span>
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                </button>
              )}

              {/* Hold to Confirm Close Window */}
              {isRunning && (
                <div className="pt-2 border-t border-white/[0.08] space-y-2">
                  <button
                    onPointerDown={() => startHoldConfirm('close_window')}
                    onPointerUp={cancelHoldConfirm}
                    onPointerCancel={cancelHoldConfirm}
                    className="w-full py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-left text-[11px] relative overflow-hidden flex items-center justify-between"
                  >
                    {holdConfirmAction === 'close_window' && (
                      <div
                        style={{ width: `${holdProgress}%` }}
                        className="absolute inset-y-0 left-0 bg-amber-500/30 transition-all pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">
                      {holdConfirmAction === 'close_window'
                        ? 'Holding... Release to Cancel'
                        : 'Close Window (Hold to Confirm)'}
                    </span>
                    <X className="w-3.5 h-3.5 text-amber-300 relative z-10" />
                  </button>

                  <button
                    onPointerDown={() => startHoldConfirm('quit')}
                    onPointerUp={cancelHoldConfirm}
                    onPointerCancel={cancelHoldConfirm}
                    className="w-full py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-left text-[11px] relative overflow-hidden flex items-center justify-between"
                  >
                    {holdConfirmAction === 'quit' && (
                      <div
                        style={{ width: `${holdProgress}%` }}
                        className="absolute inset-y-0 left-0 bg-red-500/30 transition-all pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">
                      {holdConfirmAction === 'quit'
                        ? 'Terminating... Release to Cancel'
                        : 'Quit App (Hold to Confirm)'}
                    </span>
                    <Power className="w-3.5 h-3.5 text-red-400 relative z-10" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
AppTileWidget.displayName = 'AppTileWidget';

/**
 * 2. App Card Widget (Large)
 * Icon, name, project/file or tab title, CPU/RAM mini bars, quick-launch chips, action buttons.
 */
export const AppCardWidget: React.FC<AppWidgetProps> = React.memo((props) => {
  const { app, accentColor = '#7C5CFF', onAction } = props;
  const [holdConfirmAction, setHoldConfirmAction] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = Boolean(app.running);
  const isFocused = Boolean(app.focused);

  // Formatted RAM readout
  const ramMb = app.ram_bytes ? (app.ram_bytes / (1024 * 1024)).toFixed(0) : '0';
  const cpuVal = (app.cpu_pct || 0).toFixed(1);

  // Formatted subline (VS Code file/project or browser tab title)
  let subline = 'Not running';
  if (isRunning) {
    if (app.file && app.project) {
      subline = `${app.unsaved ? '● ' : ''}${app.file} — ${app.project}`;
    } else if (app.project) {
      subline = `Project: ${app.project}`;
    } else if (app.tab_title) {
      subline = app.tab_title;
    } else if (app.window_titles && app.window_titles.length > 0) {
      subline = app.window_titles[0];
    } else {
      subline = 'Active session';
    }
  }

  const startHoldConfirm = (action: string) => {
    setHoldConfirmAction(action);
    setHoldProgress(0);

    const startTime = Date.now();
    const duration = 1200;

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(pct);

      if (pct >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        onAction?.(app.id, action);
        setHoldConfirmAction(null);
        setHoldProgress(0);
      }
    }, 30);
  };

  const cancelHoldConfirm = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldConfirmAction(null);
    setHoldProgress(0);
  };

  return (
    <div
      className={`w-full h-full p-4 rounded-2xl bg-[#08080C] border transition-all flex flex-col justify-between select-none relative overflow-hidden ${
        isFocused
          ? 'border-[#7C5CFF]/60 shadow-[0_0_20px_rgba(124,92,255,0.2)]'
          : isRunning
          ? 'border-white/[0.12]'
          : 'border-white/[0.06] opacity-80'
      }`}
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div
            style={{ color: isRunning ? accentColor : '#71717A' }}
            className="p-1.5 rounded-lg bg-white/[0.04] shrink-0"
          >
            {renderAppIcon(app.icon || app.id, 'w-5 h-5')}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate leading-tight">
              {app.name}
            </div>
            <div className="flex items-center space-x-1.5 text-[9px] font-mono text-zinc-500 mt-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isFocused
                    ? 'bg-[#7C5CFF] shadow-[0_0_6px_#7C5CFF]'
                    : isRunning
                    ? 'bg-[#00E599]'
                    : 'bg-zinc-600'
                }`}
              />
              <span className="uppercase">
                {isFocused ? 'FOCUSED' : isRunning ? 'RUNNING' : 'STOPPED'}
              </span>
              {isRunning && app.instances ? (
                <span>· {app.instances} WIN</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Audio Badge if active */}
        {isRunning && app.audio_active && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#00E599]/15 border border-[#00E599]/30 text-[9px] font-mono text-[#00E599]">
            <Volume2 className="w-3 h-3 animate-pulse" />
            <span>PLAYING</span>
          </div>
        )}
      </div>

      {/* Center Subline / Project / Tab Title */}
      <div className="my-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <div className="text-[11px] font-mono text-zinc-300 truncate" title={subline}>
          {subline}
        </div>
      </div>

      {/* Mini CPU & RAM Meters (while running) */}
      {isRunning ? (
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-2">
          <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] flex items-center justify-between">
            <span className="text-zinc-500">CPU</span>
            <span className="text-white font-semibold tabular-nums">{cpuVal}%</span>
          </div>
          <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04] flex items-center justify-between">
            <span className="text-zinc-500">RAM</span>
            <span className="text-white font-semibold tabular-nums">{ramMb} MB</span>
          </div>
        </div>
      ) : null}

      {/* Quick Launch Chips */}
      {app.quick_launches && app.quick_launches.length > 0 && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 mb-2 no-scrollbar">
          {app.quick_launches.map((ql) => (
            <button
              key={ql.id}
              onClick={() => onAction?.(app.id, 'quick_launch', ql.id)}
              className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[9px] font-mono text-zinc-300 border border-white/[0.06] shrink-0 cursor-pointer transition-all"
            >
              {ql.label}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/[0.06]">
        <button
          onClick={() => onAction?.(app.id, isRunning ? 'focus' : 'launch')}
          className="py-1.5 px-2 rounded-lg bg-[#7C5CFF]/15 hover:bg-[#7C5CFF]/25 text-[#7C5CFF] text-[10px] font-mono font-medium cursor-pointer transition-all text-center"
        >
          {isRunning ? 'FOCUS' : 'LAUNCH'}
        </button>

        <button
          onClick={() => onAction?.(app.id, 'new_window')}
          className="py-1.5 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white text-[10px] font-mono cursor-pointer transition-all text-center"
        >
          + WIN
        </button>

        {/* Hold to Confirm Close Button */}
        {isRunning ? (
          <button
            onPointerDown={() => startHoldConfirm('close_window')}
            onPointerUp={cancelHoldConfirm}
            onPointerCancel={cancelHoldConfirm}
            className="py-1.5 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-mono cursor-pointer transition-all relative overflow-hidden text-center"
          >
            {holdConfirmAction === 'close_window' && (
              <div
                style={{ width: `${holdProgress}%` }}
                className="absolute inset-y-0 left-0 bg-red-500/30 transition-all pointer-events-none"
              />
            )}
            <span className="relative z-10">
              {holdConfirmAction === 'close_window' ? `${Math.round(holdProgress)}%` : 'CLOSE'}
            </span>
          </button>
        ) : (
          <button
            disabled
            className="py-1.5 px-2 rounded-lg bg-white/[0.02] text-zinc-600 text-[10px] font-mono text-center cursor-not-allowed"
          >
            IDLE
          </button>
        )}
      </div>
    </div>
  );
});
AppCardWidget.displayName = 'AppCardWidget';

/**
 * 3. App Dock Widget
 * Horizontal row of app tiles with option to sort running apps first.
 */
export const AppDockWidget: React.FC<AppDockProps> = React.memo((props) => {
  const { apps, sortRunningFirst = true, accentColor = '#7C5CFF', onAction } = props;

  const sortedApps = [...apps].sort((a, b) => {
    if (sortRunningFirst) {
      if (a.running && !b.running) return -1;
      if (!a.running && b.running) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-full h-full p-2.5 rounded-2xl bg-[#08080C] border border-white/[0.08] flex items-center space-x-2 select-none overflow-x-auto no-scrollbar">
      {sortedApps.map((app) => (
        <div key={app.id} className="w-20 h-full shrink-0">
          <AppTileWidget app={app} accentColor={accentColor} onAction={onAction} />
        </div>
      ))}
    </div>
  );
});
AppDockWidget.displayName = 'AppDockWidget';
