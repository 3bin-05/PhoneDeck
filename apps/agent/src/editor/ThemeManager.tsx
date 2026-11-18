import React, { useState } from 'react';
import {
  type ThemeConfig,
  BUILTIN_THEMES,
  exportThemeJson,
  importThemeJson,
} from '@phone-deck/theme-engine';
import { Palette, Download, Upload, RefreshCw, Check, Image } from 'lucide-react';

export interface ThemeManagerProps {
  currentTheme: ThemeConfig;
  configHash: string;
  onSelectTheme: (theme: ThemeConfig) => void;
  onUpdateTheme: (theme: ThemeConfig) => void;
  onSyncToPhone: () => void;
}

export const ThemeManager: React.FC<ThemeManagerProps> = ({
  currentTheme,
  configHash,
  onSelectTheme,
  onUpdateTheme,
  onSyncToPhone,
}) => {
  const [synced, setSynced] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const jsonStr = exportThemeJson(currentTheme);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phonedeck-theme-${currentTheme.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = importThemeJson(content);
        onUpdateTheme(imported);
        setImportError(null);
      } catch (err: any) {
        setImportError(err.message || 'Failed to import theme JSON');
      }
    };
    reader.readAsText(file);
  };

  const handleSync = () => {
    onSyncToPhone();
    setSynced(true);
    setTimeout(() => setSynced(false), 2000);
  };

  return (
    <div className="w-full bg-[#08080C] border-b border-white/[0.08] px-6 py-3 flex items-center justify-between text-xs font-mono select-none">
      {/* Left: Built-in Themes */}
      <div className="flex items-center space-x-3">
        <span className="text-[#71717A] uppercase text-[10px] flex items-center space-x-1">
          <Palette className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>Themes</span>
        </span>
        <div className="flex items-center space-x-1.5">
          {Object.entries(BUILTIN_THEMES).map(([key, theme]) => {
            const isActive = currentTheme.name === key;
            return (
              <button
                key={key}
                onClick={() => onSelectTheme(theme)}
                className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-[#7C5CFF] text-white font-medium shadow-[0_0_10px_#7C5CFF80]'
                    : 'bg-white/[0.04] text-[#71717A] hover:text-[#EDEDF2] hover:bg-white/[0.08]'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: theme.palette.accent }}
                />
                <span>{key}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Skin Slot Quick Config */}
      <div className="flex items-center space-x-4">
        {/* Accent Color Override */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-[#71717A]">ACCENT:</span>
          <input
            type="color"
            value={currentTheme.palette.accent}
            onChange={(e) =>
              onUpdateTheme({
                ...currentTheme,
                palette: { ...currentTheme.palette, accent: e.target.value },
              })
            }
            className="w-5 h-5 rounded cursor-pointer border border-white/[0.1] bg-transparent"
          />
        </div>

        {/* Skin Slot Image Status */}
        <div className="flex items-center space-x-1.5 text-[10px] text-[#71717A]">
          <Image className="w-3.5 h-3.5 text-[#00E599]" />
          <span>SKIN SLOT: ACTIVE</span>
        </div>
      </div>

      {/* Right: Import/Export + Content-Hash Sync */}
      <div className="flex items-center space-x-3">
        {/* Content Hash Pill */}
        <div className="text-[10px] text-[#71717A] flex items-center space-x-1">
          <span>HASH:</span>
          <span className="text-[#EDEDF2] font-mono bg-white/[0.04] px-1.5 py-0.5 rounded">
            {configHash}
          </span>
        </div>

        {/* Import JSON Button */}
        <label className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#EDEDF2] transition-colors cursor-pointer">
          <Upload className="w-3 h-3 text-[#7C5CFF]" />
          <span>Import</span>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </label>

        {/* Export JSON Button */}
        <button
          onClick={handleExport}
          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#EDEDF2] transition-colors"
          title="Export single-file JSON theme"
        >
          <Download className="w-3 h-3 text-[#7C5CFF]" />
          <span>Export</span>
        </button>

        {/* Sync to Phone Button */}
        <button
          onClick={handleSync}
          className={`flex items-center space-x-1 px-3 py-1 rounded-lg transition-colors font-medium ${
            synced
              ? 'bg-[#00E599] text-black'
              : 'bg-[#7C5CFF] text-white hover:bg-[#6847ED]'
          }`}
          title="Sync configuration to phone"
        >
          {synced ? (
            <>
              <Check className="w-3 h-3" />
              <span>Synced!</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              <span>Sync Phone</span>
            </>
          )}
        </button>

        {importError && (
          <span className="text-[10px] text-[#FF3B5C]">{importError}</span>
        )}
      </div>
    </div>
  );
};
