import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Play,
  Trash2,
  Clock,
  Cpu,
  Bot,
  Check,
} from 'lucide-react';

export interface RuleDefinition {
  id: string;
  name: string;
  enabled: boolean;
  when: {
    type: string;
    payload?: any;
  };
  then: {
    type: string;
    payload?: any;
  };
  only_while_it_lasts: boolean;
}

export const RulesManager: React.FC = () => {
  const [rules, setRules] = useState<RuleDefinition[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // New rule modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWhenType, setNewWhenType] = useState('ai_session_done');
  const [newThenType, setNewThenType] = useState('goto_page');
  const [newThenParam, setNewThenParam] = useState('1');
  const [newOnlyWhile, setNewOnlyWhile] = useState(false);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const fetchRules = async () => {
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<RuleDefinition[]>('get_rules');
        setRules(res);
      } catch (err) {
        console.error('Failed to get rules from Tauri:', err);
      }
    } else {
      // Browser preview fallback
      setRules([
        {
          id: 'ai-done-alert',
          name: 'AI Finished -> Switch to Dev Page & Vibrate',
          enabled: true,
          when: { type: 'ai_session_done' },
          then: { type: 'goto_page', payload: { page: 1 } },
          only_while_it_lasts: false,
        },
        {
          id: 'cpu-spike-pulse',
          name: 'CPU > 90% for 15s -> Pulse Alert',
          enabled: true,
          when: {
            type: 'cpu_above_threshold',
            payload: { percent: 90.0, duration_secs: 15 },
          },
          then: { type: 'pulse_alert' },
          only_while_it_lasts: true,
        },
        {
          id: 'night-theme-schedule',
          name: '22:00 to 07:00 -> Void Night Theme',
          enabled: true,
          when: {
            type: 'time_window',
            payload: { start: '22:00', end: '07:00' },
          },
          then: { type: 'set_theme', payload: { theme_name: 'void' } },
          only_while_it_lasts: true,
        },
      ]);
    }
  };

  const handleTestRule = async (ruleId: string) => {
    setTestingId(ruleId);
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const action = await invoke<any>('test_rule', { ruleId });
        setTestResult(`Rule fired: ${JSON.stringify(action)}`);
      } catch (err: any) {
        setTestResult(`Error: ${err}`);
      }
    } else {
      // Browser mock test
      try {
        await fetch('http://127.0.0.1:8767/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: `rule_test:${ruleId}` }),
        });
        setTestResult(`Rule '${ruleId}' executed via HTTP Bridge`);
      } catch {
        setTestResult(`Simulated rule test for '${ruleId}'`);
      }
    }

    setTimeout(() => {
      setTestingId(null);
      setTestResult(null);
    }, 3000);
  };

  const handleToggleRule = async (ruleId: string) => {
    const updated = rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    setRules(updated);

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_rules', { rules: updated });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    setRules(updated);

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_rules', { rules: updated });
    }
  };

  const handleSaveRule = async () => {
    if (!newName.trim()) return;

    let when: any = { type: newWhenType };
    if (newWhenType === 'cpu_above_threshold') {
      when = { type: 'cpu_above_threshold', payload: { percent: 90.0, duration_secs: 15 } };
    } else if (newWhenType === 'time_window') {
      when = { type: 'time_window', payload: { start: '22:00', end: '07:00' } };
    }

    let then: any = { type: newThenType };
    if (newThenType === 'goto_page') {
      then = { type: 'goto_page', payload: { page: Number(newThenParam) } };
    } else if (newThenType === 'set_theme') {
      then = { type: 'set_theme', payload: { theme_name: newThenParam } };
    }

    const newRule: RuleDefinition = {
      id: `rule-${Date.now()}`,
      name: newName.trim(),
      enabled: true,
      when,
      then,
      only_while_it_lasts: newOnlyWhile,
    };

    const updated = [...rules, newRule];
    setRules(updated);

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_rules', { rules: updated });
    }

    setShowAddModal(false);
    setNewName('');
  };

  useEffect(() => {
    fetchRules();
  }, []);

  return (
    <div className="w-full h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-white flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#7C5CFF]" />
            <span>RULES ENGINE (WHEN → THEN)</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Automate page switches, alerts, and themes based on AI agent status, CPU spikes, time windows, or webhooks.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#6847ED] text-xs font-mono text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Rule</span>
        </button>
      </div>

      {testResult && (
        <div className="p-3 bg-[#00E599]/10 border border-[#00E599]/30 rounded-lg text-xs font-mono text-[#00E599] flex items-center space-x-2">
          <Check className="w-4 h-4" />
          <span>{testResult}</span>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule) => {
          const isBusy = testingId === rule.id;

          return (
            <div
              key={rule.id}
              className={`p-4 bg-[#09090D] border rounded-xl flex items-center justify-between transition-colors ${
                rule.enabled ? 'border-white/[0.12]' : 'border-white/[0.04] opacity-50'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                {/* Trigger Icon */}
                <div className="w-9 h-9 rounded-lg bg-[#7C5CFF]/15 border border-[#7C5CFF]/30 flex items-center justify-center text-[#7C5CFF]">
                  {rule.when.type === 'ai_session_done' ? (
                    <Bot className="w-4 h-4" />
                  ) : rule.when.type === 'cpu_above_threshold' ? (
                    <Cpu className="w-4 h-4" />
                  ) : rule.when.type === 'time_window' ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-white">
                      {rule.name}
                    </span>
                    {rule.only_while_it_lasts && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                        ONLY WHILE IT LASTS
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                    <span className="text-[#7C5CFF]">WHEN:</span> {rule.when.type}{' '}
                    <span className="text-zinc-600">→</span>{' '}
                    <span className="text-[#00E599]">THEN:</span> {rule.then.type}
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center space-x-2.5">
                {/* Test Button (Mandatory per acceptance criteria) */}
                <button
                  onClick={() => handleTestRule(rule.id)}
                  disabled={isBusy}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded bg-white/[0.04] hover:bg-[#7C5CFF] hover:text-white text-zinc-300 text-xs font-mono transition-colors border border-white/[0.08]"
                  title="Test rule immediately on Deck"
                >
                  <Play className="w-3 h-3 text-[#00E599]" />
                  <span>{isBusy ? 'Testing...' : 'Test Rule'}</span>
                </button>

                {/* Enable/Disable Toggle */}
                <button
                  onClick={() => handleToggleRule(rule.id)}
                  className={`text-[10px] font-mono px-2 py-1 rounded border font-semibold uppercase ${
                    rule.enabled
                      ? 'bg-[#00E599]/10 border-[#00E599]/30 text-[#00E599]'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-500'
                  }`}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1.5 rounded text-zinc-500 hover:text-[#EF4444] transition-colors"
                  title="Delete rule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#111116] border border-white/[0.12] rounded-2xl w-full max-w-md p-5 space-y-4 font-mono text-xs shadow-2xl">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-[#7C5CFF]" />
              <span>Create New Automation Rule</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-zinc-400 block mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Fullscreen Game -> Switch to Game Layout"
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">When (Trigger Condition)</label>
                <select
                  value={newWhenType}
                  onChange={(e) => setNewWhenType(e.target.value)}
                  className="w-full bg-[#1A1A22] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none cursor-pointer"
                >
                  <option value="ai_session_done">AI Session Completed (Done)</option>
                  <option value="ai_needs_input">AI Needs Approval / Input</option>
                  <option value="cpu_above_threshold">CPU &gt; 90% for 15 Seconds</option>
                  <option value="time_window">Time Window (22:00 to 07:00)</option>
                  <option value="user_idle">User Idle &gt; 10 Minutes</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Then (Action)</label>
                  <select
                    value={newThenType}
                    onChange={(e) => setNewThenType(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none cursor-pointer"
                  >
                    <option value="goto_page">Switch to Page</option>
                    <option value="set_theme">Switch Theme</option>
                    <option value="pulse_alert">Pulse Alert</option>
                    <option value="vibrate">Vibrate Pattern</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Target Page / Theme</label>
                  <input
                    type="text"
                    value={newThenParam}
                    onChange={(e) => setNewThenParam(e.target.value)}
                    placeholder="Page (0, 1, 2) or Theme name"
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded px-3 py-1.5 text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="only-while-cb"
                  checked={newOnlyWhile}
                  onChange={(e) => setNewOnlyWhile(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="only-while-cb" className="text-zinc-300 cursor-pointer">
                  Only while it lasts (restore previous page/theme when condition ends)
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
                onClick={handleSaveRule}
                className="px-4 py-1.5 rounded bg-[#7C5CFF] hover:bg-[#6847ED] text-white font-medium"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
