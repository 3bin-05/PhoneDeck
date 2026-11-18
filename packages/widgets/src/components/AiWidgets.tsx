import React, { useState } from 'react';
import {
  Bot,
  Terminal,
  FileCode,
  Search,
  Clock,
  Zap,
} from 'lucide-react';

export interface AiSessionItem {
  id: string;
  agent: 'claude' | 'codex' | 'antigravity';
  project: string;
  status: 'working' | 'waiting' | 'idle';
  model?: string;
  currentTool?: string;
  currentAction?: string;
  tokensTotal?: number;
  tokensCached?: number;
  durationSec?: number;
  startedAt?: string;
}

export interface AiQuotaItem {
  provider: 'claude' | 'codex' | 'antigravity';
  name: string;
  limitLabel: string;
  usedPct: number;
  resetEta: string;
  burnRate?: string;
  onPace: boolean;
  modelTier?: string;
}

/**
 * AI Coding Sessions Dashboard Widget (Steam Deck / Desk Panel style)
 */
export const AiSessionsWidget: React.FC<{
  sessions?: AiSessionItem[];
  onSelectSession?: (id: string) => void;
}> = React.memo(({ sessions = [], onSelectSession }) => {
  const defaultSessions: AiSessionItem[] = [
    {
      id: 'claude-1',
      agent: 'claude',
      project: 'PhoneDeck',
      status: 'working',
      model: 'claude-3-7-sonnet',
      currentTool: 'Bash',
      currentAction: 'pnpm build && tauri build',
      tokensTotal: 124500,
      tokensCached: 86000,
      durationSec: 340,
    },
    {
      id: 'agy-1',
      agent: 'antigravity',
      project: 'Core Architecture',
      status: 'waiting',
      model: 'gemini-2.5-pro',
      currentTool: 'Edit',
      currentAction: 'WidgetContainers.tsx: line 420',
      tokensTotal: 68000,
      tokensCached: 45000,
      durationSec: 185,
    },
    {
      id: 'codex-1',
      agent: 'codex',
      project: 'Rust Kernel',
      status: 'idle',
      model: 'o3-mini',
      currentTool: 'Read',
      currentAction: 'client.rs',
      tokensTotal: 34200,
      durationSec: 820,
    },
  ];

  const items = sessions.length > 0 ? sessions : defaultSessions;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const getAgentColor = (agent: string) => {
    switch (agent) {
      case 'claude':
        return '#D97706'; // warm amber/orange
      case 'antigravity':
        return '#7C5CFF'; // vibrant purple
      case 'codex':
        return '#00E599'; // tech emerald
      default:
        return '#A78BFA';
    }
  };

  const getToolIcon = (tool?: string) => {
    switch (tool?.toLowerCase()) {
      case 'bash':
        return <Terminal className="w-3 h-3 text-[#00E599]" />;
      case 'edit':
      case 'multiedit':
      case 'write':
        return <FileCode className="w-3 h-3 text-[#7C5CFF]" />;
      case 'websearch':
      case 'read':
        return <Search className="w-3 h-3 text-[#38BDF8]" />;
      default:
        return <Bot className="w-3 h-3 text-[#EDEDF2]" />;
    }
  };

  const formatTokens = (t?: number) => {
    if (!t) return '0';
    if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
    if (t >= 1000) return `${(t / 1000).toFixed(0)}k`;
    return t.toString();
  };

  return (
    <div className="w-full h-full rounded-2xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#7C5CFF] shadow-[0_0_8px_#7C5CFF]" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-[#EDEDF2] uppercase">
            AI Coding Sessions
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-[#A78BFA]">
            {items.filter((s) => s.status === 'working').length} ACTIVE
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#71717A] flex items-center gap-1">
          <Bot className="w-3 h-3" />
          <span>AUTONOMOUS AGENTS</span>
        </span>
      </div>

      {/* Session Cards List */}
      <div className="flex-1 my-2 space-y-2 overflow-y-auto pr-1">
        {items.map((s) => {
          const isSelected = selectedId === s.id;
          const color = getAgentColor(s.agent);

          return (
            <div
              key={s.id}
              onClick={() => {
                setSelectedId(isSelected ? null : s.id);
                onSelectSession?.(s.id);
              }}
              style={{
                borderColor: isSelected ? color : 'rgba(255, 255, 255, 0.08)',
                boxShadow: isSelected ? `0 0 12px ${color}30` : undefined,
              }}
              className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        s.status === 'working'
                          ? '#00E599'
                          : s.status === 'waiting'
                          ? '#F59E0B'
                          : '#71717A',
                      boxShadow:
                        s.status === 'working' ? '0 0 6px #00E599' : undefined,
                    }}
                  />
                  <span className="text-xs font-mono font-bold text-[#EDEDF2] truncate max-w-[120px]">
                    {s.project}
                  </span>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase"
                    style={{
                      backgroundColor: `${color}18`,
                      color: color,
                      border: `1px solid ${color}35`,
                    }}
                  >
                    {s.agent}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono text-[#71717A]">
                  {s.model && <span className="text-zinc-400">{s.model}</span>}
                  {s.durationSec && (
                    <span>
                      {Math.floor(s.durationSec / 60)}m {s.durationSec % 60}s
                    </span>
                  )}
                </div>
              </div>

              {/* Current Action / Tool */}
              <div className="flex items-center justify-between mt-1.5 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-zinc-300 truncate max-w-[280px]">
                  {getToolIcon(s.currentTool)}
                  <span className="font-semibold text-white">
                    {s.currentTool}:
                  </span>
                  <span className="truncate text-zinc-400">
                    {s.currentAction || 'Running task...'}
                  </span>
                </div>

                {s.tokensTotal && (
                  <div className="text-[10px] text-[#A78BFA] font-mono shrink-0">
                    {formatTokens(s.tokensTotal)} tok
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-[#71717A]">
        <span>LOCAL PROCESS & LOG WATCHER</span>
        <span className="text-[#00E599]">AUTOSYNC 1.5S</span>
      </div>
    </div>
  );
});
AiSessionsWidget.displayName = 'AiSessionsWidget';

/**
 * AI Service Quota & Burn-Rate Tracker Widget
 */
export const AiQuotasWidget: React.FC<{
  quotas?: AiQuotaItem[];
}> = React.memo(({ quotas }) => {
  const defaultQuotas: AiQuotaItem[] = [
    {
      provider: 'claude',
      name: 'Claude 3.7 Sonnet',
      limitLabel: '5-Hour Rolling Limit',
      usedPct: 42,
      resetEta: '2h 18m',
      burnRate: '18.4k tok/hr',
      onPace: true,
      modelTier: 'Pro / Max',
    },
    {
      provider: 'claude',
      name: 'Claude Weekly Cap',
      limitLabel: 'Weekly Budget',
      usedPct: 68,
      resetEta: '3d 14h',
      burnRate: '$1.40 / hr',
      onPace: true,
    },
    {
      provider: 'antigravity',
      name: 'Antigravity IDE',
      limitLabel: 'Fast Quota (Pro)',
      usedPct: 24,
      resetEta: 'Resets daily at 00:00',
      burnRate: 'Normal pace',
      onPace: true,
      modelTier: 'Tier 1 Ultra',
    },
    {
      provider: 'codex',
      name: 'Codex / ChatGPT',
      limitLabel: 'Weekly o3-mini Cap',
      usedPct: 82,
      resetEta: '1d 06h',
      burnRate: 'Heavy usage',
      onPace: false,
    },
  ];

  const items = quotas && quotas.length > 0 ? quotas : defaultQuotas;

  return (
    <div className="w-full h-full rounded-2xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-[#00E599]" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-[#EDEDF2] uppercase">
            AI Quotas & Burn Rate
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#00E599] bg-[#00E599]/10 px-2 py-0.5 rounded border border-[#00E599]/20">
          ALL SERVICES HEALTHY
        </span>
      </div>

      {/* Quota Grid */}
      <div className="grid grid-cols-2 gap-2 my-2 flex-1">
        {items.map((q, idx) => {
          const accentColor =
            q.usedPct > 85 ? '#FF3B5C' : q.usedPct > 60 ? '#F59E0B' : '#00E599';

          return (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono font-bold text-[#EDEDF2]">
                    {q.name}
                  </div>
                  <div className="text-[10px] font-mono text-[#71717A]">
                    {q.limitLabel}
                  </div>
                </div>

                {/* Circular Percentage Mini */}
                <div
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-bold"
                  style={{
                    backgroundColor: `${accentColor}18`,
                    color: accentColor,
                    border: `1px solid ${accentColor}35`,
                  }}
                >
                  {q.usedPct}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="my-1.5">
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, q.usedPct)}%`,
                      backgroundColor: accentColor,
                      boxShadow: `0 0 8px ${accentColor}`,
                    }}
                  />
                </div>
              </div>

              {/* Footer info: Reset timer & burn rate */}
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-[#71717A]" />
                  <span>{q.resetEta}</span>
                </span>
                {q.burnRate && (
                  <span className="text-zinc-400 font-medium">
                    {q.burnRate}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-[#71717A]">
        <span>AUTO-RESET NOTIFIERS ACTIVE</span>
        <span className="text-[#A78BFA]">PRO & CLI PROVIDERS</span>
      </div>
    </div>
  );
});
AiQuotasWidget.displayName = 'AiQuotasWidget';

/**
 * Single Quota Ring Widget (Compact 2x2 / 3x3)
 */
export const QuotaRingWidget: React.FC<{
  title?: string;
  provider?: string;
  usedPct?: number;
  resetEta?: string;
  accentColor?: string;
}> = React.memo(
  ({
    title = 'Claude 3.7',
    provider = '5H SESSION',
    usedPct = 38,
    resetEta = '2h 45m',
    accentColor = '#7C5CFF',
  }) => {
    const radius = 38;
    const circ = 2 * Math.PI * radius;
    const strokeDash = (usedPct / 100) * circ;

    return (
      <div className="w-full h-full rounded-2xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col items-center justify-between select-none relative overflow-hidden text-center">
        <div className="w-full flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase">
          <span>{title}</span>
          <span style={{ color: accentColor }}>{provider}</span>
        </div>

        {/* SVG Ring Gauge */}
        <div className="relative w-24 h-24 my-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={accentColor}
              strokeWidth="8"
              strokeDasharray={circ}
              strokeDashoffset={circ - strokeDash}
              strokeLinecap="round"
              className="transition-all duration-500"
              style={{
                filter: `drop-shadow(0 0 6px ${accentColor}80)`,
              }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-mono font-bold text-[#EDEDF2]">
              {usedPct}%
            </span>
            <span className="text-[9px] font-mono text-[#71717A]">USED</span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-zinc-400">
          Resets in <span className="text-[#EDEDF2] font-semibold">{resetEta}</span>
        </div>
      </div>
    );
  }
);
QuotaRingWidget.displayName = 'QuotaRingWidget';
