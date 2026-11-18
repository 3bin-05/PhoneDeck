import React, { useState, useRef } from 'react';
import type { AgentEvent } from '@phone-deck/ui-kit';
import { AlertTriangle, ShieldCheck, X, Check, Lock } from 'lucide-react';

export interface ApprovalDialogProps {
  event: AgentEvent;
  onResolve: (approved: boolean) => void;
  onClose: () => void;
}

export const ApprovalDialog: React.FC<ApprovalDialogProps> = ({
  event,
  onResolve,
  onClose,
}) => {
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<number | null>(null);

  // Extract command from summary if present
  const summaryParts = event.summary.split('| Command: ');
  const promptText = summaryParts[0].trim();
  const commandText = summaryParts.length > 1 ? summaryParts[1].trim() : '';

  // Check for dangerous / risky commands per plan.md section 6.5
  const isRisky =
    /rm\s+-rf|git\s+push\s+.*--force|drop\s+table|delete\s+from|format|mkfs|del\s+\/s/i.test(
      commandText || promptText
    );

  const startHold = () => {
    setHolding(true);
    const start = performance.now();
    const duration = 1500; // 1.5 seconds hold duration

    const step = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        onResolve(true);
      } else {
        holdTimerRef.current = requestAnimationFrame(step);
      }
    };

    holdTimerRef.current = requestAnimationFrame(step);
  };

  const cancelHold = () => {
    setHolding(false);
    setHoldProgress(0);
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md font-mono select-none">
      <div className="bg-[#09090D] border border-white/[0.12] rounded-2xl w-full max-w-lg p-6 relative shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2">
            {isRisky ? (
              <AlertTriangle className="w-5 h-5 text-[#FFB800] animate-pulse" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-[#7C5CFF]" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-[#EDEDF2] uppercase">
                {isRisky ? 'High-Risk Action Approval' : 'Action Approval Required'}
              </h3>
              <div className="text-[10px] text-[#71717A] flex items-center space-x-1.5">
                <span className="text-[#7C5CFF]">{event.agent}</span>
                <span>·</span>
                <span>{event.project}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#EDEDF2] p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Prompt description */}
        <div className="text-xs text-[#EDEDF2] leading-relaxed">
          {promptText}
        </div>

        {/* Command code block */}
        {commandText && (
          <div className="space-y-1">
            <span className="text-[10px] text-[#71717A] uppercase">
              Target Command
            </span>
            <div className="p-3 rounded-lg bg-black/60 border border-white/[0.08] text-xs font-mono text-[#00E599] overflow-x-auto break-all">
              {commandText}
            </div>
          </div>
        )}

        {/* Risky warning banner */}
        {isRisky && (
          <div className="p-2.5 rounded-lg bg-[#FFB800]/10 border border-[#FFB800]/30 text-[11px] text-[#FFB800] flex items-center space-x-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>
              Destructive pattern detected. Hold button for 1.5s to confirm.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          {/* Deny Button */}
          <button
            onClick={() => onResolve(false)}
            className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#FF3B5C]/20 text-[#EDEDF2] hover:text-[#FF3B5C] border border-white/[0.08] transition-colors text-xs font-semibold flex items-center justify-center space-x-1.5"
          >
            <X className="w-4 h-4" />
            <span>Deny Request</span>
          </button>

          {/* Approve Button (or Hold-to-Confirm) */}
          {isRisky ? (
            <button
              onMouseDown={startHold}
              onMouseUp={cancelHold}
              onMouseLeave={cancelHold}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              className="flex-1 py-2.5 rounded-xl bg-[#FFB800] text-black font-semibold text-xs relative overflow-hidden flex items-center justify-center space-x-1.5 shadow-lg active:scale-95 transition-transform"
            >
              {/* Hold progress bar */}
              <div
                className="absolute inset-0 bg-[#E5A600] transition-all"
                style={{ width: `${holdProgress}%` }}
              />
              <span className="relative z-10 flex items-center space-x-1">
                <Check className="w-4 h-4" />
                <span>
                  {holding
                    ? `Holding... ${Math.round(holdProgress)}%`
                    : 'Hold to Confirm'}
                </span>
              </span>
            </button>
          ) : (
            <button
              onClick={() => onResolve(true)}
              className="flex-1 py-2.5 rounded-xl bg-[#7C5CFF] hover:bg-[#6847ED] text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-lg active:scale-95 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Approve Action</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
