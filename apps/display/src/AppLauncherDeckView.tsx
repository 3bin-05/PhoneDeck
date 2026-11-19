import React from 'react';
import { useDeckStore } from './deckStore';
import { sendAppAction } from './useDeckBridge';

interface AppButtonDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export function AppLauncherDeckView() {
  const connected = useDeckStore((s) => s.connected);

  const handleLaunchApp = (appId: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
    sendAppAction(appId, 'focus');
  };

  const appButtons: AppButtonDef[] = [
    // Row 1
    {
      id: 'youtube',
      label: 'YOUTUBE',
      icon: (
        <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
    {
      id: 'spotify',
      label: 'SPOTIFY',
      icon: (
        <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M7 9.2c3.6-1 7.8-.7 11 .9M7.5 12.3c3-.8 6.5-.5 9.2.9M8 15.5c2.3-.6 5-.4 7.2.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: 'steam',
      label: 'STEAM',
      icon: (
        <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
          <path d="M11.979 0C5.64 0 .463 4.908.026 11.157l6.637 2.744a3.784 3.784 0 0 1 2.378-.838c.35 0 .685.05 1.006.143l3.056-4.427a4.938 4.938 0 0 1-.02-.45c0-2.73 2.222-4.952 4.952-4.952 2.73 0 4.952 2.222 4.952 4.952 0 2.73-2.222 4.952-4.952 4.952-.16 0-.317-.008-.473-.023l-4.372 3.093c.078.29.122.593.122.906 0 2.052-1.67 3.722-3.722 3.722-1.804 0-3.308-1.291-3.64-2.996L.883 15.852C2.176 20.61 6.643 24 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm6.056 10.925a2.528 2.528 0 1 0 0-5.056 2.528 2.528 0 0 0 0 5.056zm-8.435 6.075a2.222 2.222 0 1 0 0-4.444 2.222 2.222 0 0 0 0 4.444z" />
        </svg>
      ),
    },
    {
      id: 'opera',
      label: 'OPERA',
      icon: (
        <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.5">
          <ellipse cx="12" cy="12" rx="9" ry="9" strokeWidth="2.5" />
          <ellipse cx="12" cy="12" rx="4.5" ry="7.5" fill="currentColor" fillOpacity="0.15" />
        </svg>
      ),
    },

    // Row 2
    {
      id: 'antigravity',
      label: 'ANTIGRAVITY',
      icon: (
        <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
          <path d="M12 2L2 20h20L12 2zm0 5.2L17.5 17h-11L12 7.2z" />
        </svg>
      ),
    },
    {
      id: 'claude',
      label: 'CLAUDE CLI',
      icon: (
        <div className="flex items-center gap-1">
          <svg className="w-5 h-5 text-white fill-current" viewBox="0 0 24 24">
            <path d="M12 0l2.5 8.5L23 11l-8.5 2.5L12 22l-2.5-8.5L1 11l8.5-2.5z" />
          </svg>
          <span className="text-base font-bold text-white font-mono">&gt;_</span>
        </div>
      ),
    },
    {
      id: 'vscode',
      label: 'VS CODE',
      icon: (
        <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
          <line x1="14" y1="4" x2="10" y2="20" strokeWidth="1.5" opacity="0.6" />
        </svg>
      ),
    },
    {
      id: 'terminal',
      label: 'TERMINAL',
      icon: (
        <div className="w-9 h-8 border-2 border-white rounded-lg flex items-center justify-center font-mono font-bold text-xs text-white shadow-inner bg-white/5">
          &gt;_
        </div>
      ),
    },

    // Row 3
    {
      id: 'discord',
      label: 'DISCORD',
      icon: (
        <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      ),
    },
    {
      id: 'chrome',
      label: 'CHROME',
      icon: (
        <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.2" />
          <line x1="21.17" y1="8" x2="12" y2="8" />
          <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
          <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
        </svg>
      ),
    },
    {
      id: 'github',
      label: 'GITHUB',
      icon: (
        <svg className="w-9 h-9 text-white fill-current" viewBox="0 0 24 24">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'SETTINGS',
      icon: (
        <svg className="w-9 h-9 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="w-full h-full min-h-screen bg-[#070709] text-white p-3 sm:p-4 md:p-5 flex flex-col justify-between select-none overflow-hidden font-mono antialiased">
      {/* Top Header Pill Row */}
      <div className="w-full flex items-center justify-end mb-2.5 shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.12] bg-[#121216] text-[11px] font-mono tracking-wider text-zinc-300 shadow-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-white shadow-[0_0_8px_#ffffff]' : 'bg-zinc-600'
            }`}
          />
          <span className="font-semibold uppercase">
            {connected ? 'CONNECTED · HOME-PC' : 'CONNECTED · HOME-PC'}
          </span>
        </div>
      </div>

      {/* 4x3 Grid of 12 App Buttons */}
      <div className="w-full flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 items-stretch">
        {appButtons.map((app) => (
          <button
            key={app.id}
            onClick={() => handleLaunchApp(app.id)}
            className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-3 cursor-pointer shadow-lg group relative overflow-hidden"
            title={`Launch ${app.label} on Laptop`}
          >
            {/* Subtle glow hover effect */}
            <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            {/* Icon */}
            <div className="transform group-hover:scale-110 transition-transform duration-200">
              {app.icon}
            </div>

            {/* Label */}
            <span className="text-[11px] sm:text-xs font-mono tracking-widest text-zinc-300 font-semibold uppercase group-hover:text-white transition-colors">
              {app.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
