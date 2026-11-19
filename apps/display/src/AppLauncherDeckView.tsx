import React from 'react';
import { useDeckStore } from './deckStore';
import { sendAppAction } from './useDeckBridge';

import antigravityLogo from './assets/logos/antigravity.webp';
import claudeLogo from './assets/logos/claude.webp';
import vscodeLogo from './assets/logos/vscode.webp';
import discordLogo from './assets/logos/discord.webp';
import githubLogo from './assets/logos/github.webp';
import spotifyLogo from './assets/logos/spotify.webp';
import steamLogo from './assets/logos/steam.webp';

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
        <svg className="w-10 h-10 text-white fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
    },
    {
      id: 'spotify',
      label: 'SPOTIFY',
      icon: (
        <img
          src={spotifyLogo}
          alt="Spotify"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'steam',
      label: 'STEAM',
      icon: (
        <img
          src={steamLogo}
          alt="Steam"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'opera',
      label: 'OPERA',
      icon: (
        <svg className="w-10 h-10 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.5">
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
        <img
          src={antigravityLogo}
          alt="Antigravity"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'claude',
      label: 'CLAUDE CLI',
      icon: (
        <div className="flex items-center gap-1.5">
          <img
            src={claudeLogo}
            alt="Claude"
            className="w-8 h-8 object-contain"
          />
          <span className="text-base font-bold text-white font-mono">&gt;_</span>
        </div>
      ),
    },
    {
      id: 'vscode',
      label: 'VS CODE',
      icon: (
        <img
          src={vscodeLogo}
          alt="VS Code"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'terminal',
      label: 'TERMINAL',
      icon: (
        <div className="w-10 h-9 border-2 border-white rounded-lg flex items-center justify-center font-mono font-bold text-xs text-white shadow-inner bg-white/5">
          &gt;_
        </div>
      ),
    },

    // Row 3
    {
      id: 'discord',
      label: 'DISCORD',
      icon: (
        <img
          src={discordLogo}
          alt="Discord"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'chrome',
      label: 'CHROME',
      icon: (
        <svg className="w-10 h-10 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
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
        <img
          src={githubLogo}
          alt="GitHub"
          className="w-10 h-10 object-contain drop-shadow"
        />
      ),
    },
    {
      id: 'settings',
      label: 'SETTINGS',
      icon: (
        <svg className="w-10 h-10 text-white fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            className="bg-[#0D0D10] border border-white/[0.08] hover:border-white/30 active:scale-95 transition-all rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-lg group relative overflow-hidden"
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
