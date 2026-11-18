import React, { useState } from 'react';
import {
  Lock,
  Play,
  Pause,
  Code,
  Folder,
  Terminal,
  Crop,
  Volume2,
  VolumeX,
  ExternalLink,
  Power,
  Sparkles,
  Command,
} from 'lucide-react';

export interface ShortcutItemModel {
  id: string;
  name: string;
  icon: string;
  color?: string;
  confirm?: boolean;
  cooldown_ms?: number;
  process_match?: string;
}

export interface ShortcutGridWidgetProps {
  shortcuts?: ShortcutItemModel[];
  runningProcesses?: Record<string, boolean>;
  onExecuteShortcut?: (id: string) => void | Promise<void>;
  accentColor?: string;
}

const DEFAULT_STARTER_SHORTCUTS: ShortcutItemModel[] = [
  {
    id: 'open-vscode',
    name: 'VS Code',
    icon: 'Code',
    color: '#3B82F6',
    process_match: 'code.exe',
  },
  {
    id: 'open-repo',
    name: 'Project Dir',
    icon: 'Folder',
    color: '#F59E0B',
  },
  {
    id: 'media-play',
    name: 'Play / Pause',
    icon: 'Play',
    color: '#7C5CFF',
  },
  {
    id: 'screenshot',
    name: 'Snippet',
    icon: 'Crop',
    color: '#00E599',
  },
  {
    id: 'lock-pc',
    name: 'Lock PC',
    icon: 'Lock',
    color: '#EF4444',
    confirm: true,
  },
];

export const ShortcutGridWidget: React.FC<ShortcutGridWidgetProps> = ({
  shortcuts = DEFAULT_STARTER_SHORTCUTS,
  runningProcesses = { 'code.exe': true },
  onExecuteShortcut,
  accentColor = '#7C5CFF',
}) => {
  const [cooldowns, setCooldowns] = useState<Record<string, boolean>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const getIcon = (name: string) => {
    switch (name.toLowerCase()) {
      case 'lock': return <Lock className="w-4 h-4" />;
      case 'play': return <Play className="w-4 h-4" />;
      case 'pause': return <Pause className="w-4 h-4" />;
      case 'code': return <Code className="w-4 h-4" />;
      case 'folder': return <Folder className="w-4 h-4" />;
      case 'terminal': return <Terminal className="w-4 h-4" />;
      case 'crop': return <Crop className="w-4 h-4" />;
      case 'volumex': return <VolumeX className="w-4 h-4" />;
      case 'volume2': return <Volume2 className="w-4 h-4" />;
      case 'power': return <Power className="w-4 h-4" />;
      case 'external-link': return <ExternalLink className="w-4 h-4" />;
      default: return <Command className="w-4 h-4" />;
    }
  };

  const handleTileClick = (shortcut: ShortcutItemModel) => {
    if (cooldowns[shortcut.id]) return;

    // Check confirmation requirement
    if (shortcut.confirm && confirmingId !== shortcut.id) {
      setConfirmingId(shortcut.id);
      setTimeout(() => setConfirmingId(null), 3500); // 3.5s auto dismiss
      return;
    }

    setConfirmingId(null);

    // Apply cooldown UI state
    const cdMs = shortcut.cooldown_ms || 1000;
    setCooldowns((prev) => ({ ...prev, [shortcut.id]: true }));
    setTimeout(() => {
      setCooldowns((prev) => ({ ...prev, [shortcut.id]: false }));
    }, cdMs);

    // Trigger execution
    if (onExecuteShortcut) {
      onExecuteShortcut(shortcut.id);
    }
  };

  return (
    <div className="w-full h-full bg-[#08080C]/80 border border-white/[0.08] rounded-xl p-2.5 flex flex-col justify-between font-mono select-none overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06] text-[10px] text-[#71717A]">
        <span className="flex items-center space-x-1.5 uppercase font-medium">
          <Sparkles className="w-3 h-3" style={{ color: accentColor }} />
          <span>Quick Shortcuts & Controls</span>
        </span>
        <span className="text-[9px] bg-white/[0.04] px-1.5 py-0.5 rounded text-zinc-400">
          PC ACTIONS
        </span>
      </div>

      {/* Grid of Shortcut Tiles */}
      <div className="flex-1 grid grid-cols-3 gap-2 mt-2 items-center">
        {shortcuts.slice(0, 6).map((item) => {
          const isConfirming = confirmingId === item.id;
          const isOnCooldown = !!cooldowns[item.id];
          const tileColor = item.color || accentColor;
          const isRunning =
            item.process_match && runningProcesses[item.process_match.toLowerCase()];

          return (
            <button
              key={item.id}
              disabled={isOnCooldown}
              onClick={() => handleTileClick(item)}
              style={{
                borderColor: isConfirming ? '#EF4444' : `${tileColor}30`,
                backgroundColor: isConfirming
                  ? '#EF444420'
                  : isOnCooldown
                  ? '#18181B50'
                  : `${tileColor}10`,
              }}
              className={`h-full min-h-[48px] rounded-lg border p-1.5 flex flex-col items-center justify-center relative transition-all duration-150 active:scale-95 group ${
                isOnCooldown
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:brightness-125 cursor-pointer'
              }`}
            >
              {/* "Is Running" Process Indicator */}
              {item.process_match && (
                <div
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: isRunning ? '#00E599' : '#52525B',
                    boxShadow: isRunning ? '0 0 6px #00E599' : undefined,
                  }}
                  title={isRunning ? `${item.process_match} is running` : `${item.process_match} inactive`}
                />
              )}

              {/* Icon */}
              <div
                style={{ color: isConfirming ? '#EF4444' : tileColor }}
                className="mb-1"
              >
                {getIcon(item.icon)}
              </div>

              {/* Label / Confirm prompt */}
              <span
                className={`text-[10px] font-semibold tracking-tight text-center truncate max-w-full ${
                  isConfirming ? 'text-[#EF4444] animate-pulse' : 'text-[#EDEDF2]'
                }`}
              >
                {isConfirming ? 'Confirm?' : item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
