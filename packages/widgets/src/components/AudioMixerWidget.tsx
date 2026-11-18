import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Sliders,
  Flame,
  Music,
  Code,
  ShieldAlert,
} from 'lucide-react';

export interface AudioChannel {
  id: string;
  name: string;
  volumePct: number;
  isMuted: boolean;
  peakDb?: number; // -60 to 0 dB
  icon?: string;
}

export const AudioMixerWidget: React.FC<{
  channels?: AudioChannel[];
  onChannelVolume?: (id: string, vol: number) => void;
  onChannelMute?: (id: string, muted: boolean) => void;
  onPanicMute?: () => void;
}> = React.memo(({ channels: initialChannels, onChannelVolume, onChannelMute, onPanicMute }) => {
  const defaultChannels: AudioChannel[] = [
    { id: 'master', name: 'Master', volumePct: 75, isMuted: false, icon: 'Volume2' },
    { id: 'spotify', name: 'Spotify', volumePct: 65, isMuted: false, icon: 'Music' },
    { id: 'opera', name: 'Opera GX', volumePct: 40, isMuted: false, icon: 'Flame' },
    { id: 'vscode', name: 'VS Code', volumePct: 90, isMuted: false, icon: 'Code' },
    { id: 'discord', name: 'Discord', volumePct: 80, isMuted: false, icon: 'Globe' },
  ];

  const [channels, setChannels] = useState<AudioChannel[]>(initialChannels || defaultChannels);
  const [panicActive, setPanicActive] = useState(false);

  const handleSliderChange = (id: string, val: number) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, volumePct: val } : c))
    );
    onChannelVolume?.(id, val);
  };

  const handleToggleMute = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isMuted: !c.isMuted } : c))
    );
    const target = channels.find((c) => c.id === id);
    if (target) {
      onChannelMute?.(id, !target.isMuted);
    }
  };

  const handleTriggerPanic = () => {
    const nextState = !panicActive;
    setPanicActive(nextState);
    setChannels((prev) => prev.map((c) => ({ ...c, isMuted: nextState })));
    onPanicMute?.();
  };

  const getChannelIcon = (name: string, icon?: string) => {
    switch (icon || name.toLowerCase()) {
      case 'flame':
      case 'opera':
        return <Flame className="w-3.5 h-3.5 text-[#FF3B5C]" />;
      case 'music':
      case 'spotify':
        return <Music className="w-3.5 h-3.5 text-[#00E599]" />;
      case 'code':
      case 'vscode':
        return <Code className="w-3.5 h-3.5 text-[#7C5CFF]" />;
      default:
        return <Volume2 className="w-3.5 h-3.5 text-zinc-300" />;
    }
  };

  return (
    <div className="w-full h-full rounded-2xl bg-[#09090D] border border-white/[0.08] p-3 flex flex-col justify-between select-none relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span className="text-[11px] font-mono font-semibold tracking-wider text-[#EDEDF2] uppercase">
            Application Audio Mixer
          </span>
        </div>

        {/* Panic Mute Button */}
        <button
          onClick={handleTriggerPanic}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
            panicActive
              ? 'bg-[#FF3B5C] text-white shadow-[0_0_12px_#FF3B5C]'
              : 'bg-white/[0.06] hover:bg-[#FF3B5C]/20 text-[#FF3B5C] border border-[#FF3B5C]/30'
          }`}
          title="Emergency Panic Mute: Immediately mute all outputs"
        >
          <ShieldAlert className="w-3 h-3" />
          <span>{panicActive ? 'MUTED' : 'PANIC MUTE'}</span>
        </button>
      </div>

      {/* Channel Faders */}
      <div className="grid grid-cols-5 gap-2 my-2 flex-1">
        {channels.map((ch) => {
          return (
            <div
              key={ch.id}
              className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col items-center justify-between text-center"
            >
              <div className="flex flex-col items-center gap-1">
                {getChannelIcon(ch.name, ch.icon)}
                <span className="text-[10px] font-mono font-semibold text-[#EDEDF2] truncate max-w-[55px]">
                  {ch.name}
                </span>
              </div>

              {/* Vertical Slider */}
              <div className="my-auto py-2 flex flex-col items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={ch.isMuted ? 0 : ch.volumePct}
                  disabled={ch.isMuted}
                  onChange={(e) => handleSliderChange(ch.id, Number(e.target.value))}
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    width: '6px',
                    height: '80px',
                    accentColor: '#7C5CFF',
                  }}
                  className="cursor-pointer"
                />
              </div>

              {/* Value & Mute Toggle */}
              <div className="w-full flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono text-zinc-400">
                  {ch.isMuted ? 'MUTE' : `${ch.volumePct}%`}
                </span>
                <button
                  onClick={() => handleToggleMute(ch.id)}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    ch.isMuted
                      ? 'bg-[#FF3B5C]/20 text-[#FF3B5C]'
                      : 'bg-white/[0.04] text-[#71717A] hover:text-[#EDEDF2]'
                  }`}
                >
                  {ch.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-[#71717A]">
        <span>WINDOWS CORE AUDIO APIS</span>
        <span className="text-[#00E599]">HARDWARE DIRECT</span>
      </div>
    </div>
  );
});
AudioMixerWidget.displayName = 'AudioMixerWidget';
