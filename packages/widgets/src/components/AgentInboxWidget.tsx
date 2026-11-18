import React, { useState } from 'react';

export interface AgentTaskEvent {
  id: string;
  agent: string; // e.g. "claude-code", "codex", "gemini"
  project: string;
  durationSec: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  status: 'done' | 'needs_input' | 'error';
  timestamp: string;
}

export interface AgentInboxProps {
  events?: AgentTaskEvent[];
  onOpenInEditor?: (id: string) => void;
  onMarkReviewed?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export const AgentInboxWidget: React.FC<AgentInboxProps> = React.memo(
  ({
    events: initialEvents = [
      {
        id: 'task-1',
        agent: 'claude-code',
        project: 'phone-deck',
        durationSec: 252,
        filesChanged: 6,
        insertions: 142,
        deletions: 38,
        status: 'done' as const,
        timestamp: 'Just now',
      },
    ],
    onOpenInEditor,
    onMarkReviewed,
    onDismiss,
  }) => {
    const [events, setEvents] = useState<AgentTaskEvent[]>(initialEvents);

    const handleReview = (id: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      onMarkReviewed?.(id);
    };

    const handleDismiss = (id: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      onDismiss?.(id);
    };

    const latest = events[0];

    const formatDuration = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}m ${s}s`;
    };

    return (
      <div className="w-full h-full rounded-xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none relative overflow-hidden">
        {/* Header with Unreviewed Badge */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
          <div className="flex items-center space-x-2">
            <span>AI AGENT INBOX</span>
            {events.length > 0 && (
              <span className="px-1.5 py-0.2 bg-[#7C5CFF] text-[#EDEDF2] text-[9px] font-bold rounded-full">
                {events.length} NEW
              </span>
            )}
          </div>
          <span className="text-[#00E599] font-mono">STANDBY</span>
        </div>

        {/* Content body */}
        {latest ? (
          <div className="my-auto space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[#EDEDF2] text-[10px] font-mono font-medium">
                {latest.agent}
              </span>
              <span className="text-xs font-mono text-[#EDEDF2] font-semibold truncate">
                {latest.project}
              </span>
              <span className="text-[10px] font-mono text-[#71717A] ml-auto">
                {formatDuration(latest.durationSec)}
              </span>
            </div>

            {/* Git change summary badges */}
            <div className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-[#EDEDF2]">{latest.filesChanged} files</span>
              <span className="text-[#71717A]">·</span>
              <span className="text-[#00E599]">+{latest.insertions}</span>
              <span className="text-[#FF3B5C]">−{latest.deletions}</span>
            </div>

            {/* Interactive Actions */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={() => onOpenInEditor?.(latest.id)}
                className="px-2 py-1 rounded bg-[#7C5CFF] text-white text-[10px] font-mono hover:bg-[#6847ED] transition-colors active:scale-95"
              >
                Open in Editor
              </button>
              <button
                onClick={() => handleReview(latest.id)}
                className="px-2 py-1 rounded bg-white/[0.08] text-[#EDEDF2] text-[10px] font-mono hover:bg-white/[0.12] transition-colors active:scale-95"
              >
                Mark Reviewed
              </button>
              <button
                onClick={() => handleDismiss(latest.id)}
                className="px-2 py-1 rounded text-[#71717A] hover:text-[#EDEDF2] text-[10px] font-mono transition-colors ml-auto"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center my-auto py-2 text-[#71717A] text-xs font-mono">
            <span>No unreviewed agent tasks</span>
            <span className="text-[9px] text-[#4B4B55] mt-1">
              ALL SYSTEMS CURRENT
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <span>BRIDGE: /API/NOTIFY</span>
          <span className="text-[#00E599]">AUTOSYNC</span>
        </div>
      </div>
    );
  }
);
AgentInboxWidget.displayName = 'AgentInboxWidget';
