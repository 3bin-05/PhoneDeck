import React, { useState } from 'react';
import {
  type DeckConfiguration,
  type DeckPage,
  type PlacedWidget,
  type ThemeConfig,
  DEFAULT_DECK_CONFIG,
  STARTER_TEMPLATES,
  computeConfigHash,
} from '@phone-deck/theme-engine';
import { type WidgetCatalogEntry } from '@phone-deck/widgets';
import { PhoneCanvas } from './PhoneCanvas';
import { WidgetPalette } from './WidgetPalette';
import { WidgetInspector } from './WidgetInspector';
import { ThemeManager } from './ThemeManager';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const LayoutEditor: React.FC = () => {
  const [config, setConfig] = useState<DeckConfiguration>(DEFAULT_DECK_CONFIG);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);

  const activePage = config.pages[activePageIndex] || config.pages[0];

  // Helper to update config and automatically recompute content hash
  const updateConfig = (
    updater: (prev: DeckConfiguration) => DeckConfiguration
  ) => {
    setConfig((prev) => {
      const updated = updater(prev);
      const hash = computeConfigHash({
        theme: updated.theme,
        pages: updated.pages,
      });
      return { ...updated, contentHash: hash };
    });
  };

  // Widget updates on active page
  const handleUpdateWidget = (updatedWidget: PlacedWidget) => {
    updateConfig((prev) => {
      const newPages = prev.pages.map((p, idx) => {
        if (idx !== activePageIndex) return p;
        return {
          ...p,
          widgets: p.widgets.map((w) =>
            w.instanceId === updatedWidget.instanceId ? updatedWidget : w
          ),
        };
      });
      return { ...prev, pages: newPages };
    });
  };

  const handleRemoveWidget = (instanceId: string) => {
    updateConfig((prev) => {
      const newPages = prev.pages.map((p, idx) => {
        if (idx !== activePageIndex) return p;
        return {
          ...p,
          widgets: p.widgets.filter((w) => w.instanceId !== instanceId),
        };
      });
      return { ...prev, pages: newPages };
    });
    if (selectedWidgetId === instanceId) {
      setSelectedWidgetId(null);
    }
  };

  const handleAddWidget = (entry: WidgetCatalogEntry) => {
    // Find next open coordinate or default to (0, 0)
    let bestX = 0;
    let bestY = 0;
    const w = entry.defaultSize.w;
    const h = entry.defaultSize.h;

    // Check if space fits
    if (activePage.widgets.length > 0) {
      const last = activePage.widgets[activePage.widgets.length - 1];
      if (last.x + last.w + w <= 12) {
        bestX = last.x + last.w;
        bestY = last.y;
      } else if (last.y + h <= 6 - h) {
        bestX = 0;
        bestY = last.y + last.h;
      }
    }

    const newWidget: PlacedWidget = {
      instanceId: `widget-${Date.now()}`,
      widgetId: entry.id,
      x: Math.min(12 - w, bestX),
      y: Math.min(6 - h, bestY),
      w,
      h,
    };

    updateConfig((prev) => {
      const newPages = prev.pages.map((p, idx) => {
        if (idx !== activePageIndex) return p;
        return {
          ...p,
          widgets: [...p.widgets, newWidget],
        };
      });
      return { ...prev, pages: newPages };
    });

    setSelectedWidgetId(newWidget.instanceId);
  };

  // Page management
  const handleAddPage = (templateKey?: string) => {
    const template = templateKey
      ? STARTER_TEMPLATES[templateKey]
      : {
          id: `page-${Date.now()}`,
          title: `Page ${config.pages.length + 1}`,
          hidden: false,
          widgets: [],
        };

    const newPage: DeckPage = {
      ...template,
      id: `page-${Date.now()}`,
      title: templateKey
        ? template.title
        : `Page ${config.pages.length + 1}`,
    };

    updateConfig((prev) => ({
      ...prev,
      pages: [...prev.pages, newPage],
    }));
    setActivePageIndex(config.pages.length);
    setShowTemplateModal(false);
  };

  const handleDeletePage = (pageIdx: number) => {
    if (config.pages.length <= 1) return; // Keep at least 1 page
    updateConfig((prev) => ({
      ...prev,
      pages: prev.pages.filter((_, idx) => idx !== pageIdx),
    }));
    setActivePageIndex((prev) => Math.max(0, prev - 1));
  };

  const handleToggleHidePage = (pageIdx: number) => {
    updateConfig((prev) => ({
      ...prev,
      pages: prev.pages.map((p, idx) =>
        idx === pageIdx ? { ...p, hidden: !p.hidden } : p
      ),
    }));
  };

  const handleMovePage = (pageIdx: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? pageIdx - 1 : pageIdx + 1;
    if (targetIdx < 0 || targetIdx >= config.pages.length) return;

    updateConfig((prev) => {
      const copy = [...prev.pages];
      const temp = copy[pageIdx];
      copy[pageIdx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return { ...prev, pages: copy };
    });
    setActivePageIndex(targetIdx);
  };

  // Theme updates
  const handleSelectTheme = (theme: ThemeConfig) => {
    updateConfig((prev) => ({
      ...prev,
      activeThemeName: theme.name,
      theme,
    }));
  };

  const handleUpdateTheme = (theme: ThemeConfig) => {
    updateConfig((prev) => ({
      ...prev,
      theme,
    }));
  };

  const handleSyncToPhone = () => {
    // Save to localStorage or invoke Tauri IPC
    try {
      localStorage.setItem('phonedeck_layout_config', JSON.stringify(config));
      console.log('Phone Deck layout synced! Content Hash:', config.contentHash);
    } catch (e) {
      console.error('Failed to sync layout:', e);
    }
  };

  const selectedWidget =
    activePage.widgets.find((w) => w.instanceId === selectedWidgetId) || null;

  return (
    <div className="w-full h-full flex flex-col bg-[#050508] text-[#EDEDF2] select-none">
      {/* 1. Theme and Sync Header Bar */}
      <ThemeManager
        currentTheme={config.theme}
        configHash={config.contentHash}
        onSelectTheme={handleSelectTheme}
        onUpdateTheme={handleUpdateTheme}
        onSyncToPhone={handleSyncToPhone}
      />

      {/* 2. Page Navigation Bar */}
      <div className="h-10 bg-[#08080C] border-b border-white/[0.06] px-4 flex items-center justify-between text-xs font-mono">
        {/* Page Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto">
          {config.pages.map((page, idx) => {
            const isActive = activePageIndex === idx;
            return (
              <div
                key={page.id}
                onClick={() => {
                  setActivePageIndex(idx);
                  setSelectedWidgetId(null);
                }}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-[#7C5CFF]/20 text-[#EDEDF2] border border-[#7C5CFF]/50 font-medium'
                    : 'bg-white/[0.02] text-[#71717A] hover:text-[#EDEDF2] hover:bg-white/[0.05]'
                }`}
              >
                <span>{page.title}</span>
                {page.hidden && <EyeOff className="w-3 h-3 text-[#FFB800]" />}

                {/* Page Action Controls when active */}
                {isActive && (
                  <div className="flex items-center space-x-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePage(idx, 'left');
                      }}
                      disabled={idx === 0}
                      className="hover:text-white disabled:opacity-30"
                      title="Move Left"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMovePage(idx, 'right');
                      }}
                      disabled={idx === config.pages.length - 1}
                      className="hover:text-white disabled:opacity-30"
                      title="Move Right"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleHidePage(idx);
                      }}
                      className="hover:text-white"
                      title={page.hidden ? 'Show Page' : 'Hide Page'}
                    >
                      {page.hidden ? (
                        <Eye className="w-3 h-3" />
                      ) : (
                        <EyeOff className="w-3 h-3" />
                      )}
                    </button>
                    {config.pages.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePage(idx);
                        }}
                        className="hover:text-[#FF3B5C]"
                        title="Delete Page"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Page Button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowTemplateModal(true)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#EDEDF2] transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span>Add Page</span>
          </button>
        </div>
      </div>

      {/* 3. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Searchable Widget Palette */}
        <WidgetPalette onAddWidget={handleAddWidget} />

        {/* Center: Interactive Phone Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto bg-[#050508]">
          <PhoneCanvas
            widgets={activePage.widgets}
            selectedWidgetId={selectedWidgetId}
            theme={config.theme}
            onSelectWidget={setSelectedWidgetId}
            onUpdateWidget={handleUpdateWidget}
            onRemoveWidget={handleRemoveWidget}
          />
        </div>

        {/* Right: Per-Widget Options Inspector */}
        <WidgetInspector
          widget={selectedWidget}
          onUpdate={handleUpdateWidget}
          onRemove={handleRemoveWidget}
        />
      </div>

      {/* Starter Templates Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#09090D] border border-white/[0.12] rounded-2xl w-full max-w-md p-5 text-sm font-mono relative shadow-2xl">
            <h3 className="text-base font-semibold text-[#EDEDF2] mb-1 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#7C5CFF]" />
              <span>Choose Page Template</span>
            </h3>
            <p className="text-xs text-[#71717A] mb-4">
              Start with a pre-configured 12x6 layout or an empty canvas.
            </p>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => handleAddPage('systemOverview')}
                className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-[#EDEDF2]">
                    System Overview
                  </div>
                  <div className="text-[10px] text-[#71717A]">
                    Digital Clock, CPU Radial Gauge, Metrics &amp; History Sparkline
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#71717A]" />
              </button>

              <button
                onClick={() => handleAddPage('developerHub')}
                className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-[#EDEDF2]">
                    Developer Hub
                  </div>
                  <div className="text-[10px] text-[#71717A]">
                    AI Agent Inbox, Top Processes, Flip Clock &amp; Load History
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#71717A]" />
              </button>

              <button
                onClick={() => handleAddPage('ambientMinimal')}
                className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-[#EDEDF2]">
                    Ambient &amp; Minimal
                  </div>
                  <div className="text-[10px] text-[#71717A]">
                    Analog Clock, GPU Tile, Phone Status &amp; System Uptime
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#71717A]" />
              </button>

              <button
                onClick={() => handleAddPage()}
                className="w-full text-left p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors flex items-center justify-between text-[#71717A]"
              >
                <div>
                  <div className="text-xs font-medium text-[#EDEDF2]">
                    Blank Canvas
                  </div>
                  <div className="text-[10px]">
                    Empty 12x6 grid ready for custom widgets
                  </div>
                </div>
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setShowTemplateModal(false)}
              className="w-full py-2 rounded-lg bg-white/[0.04] text-[#71717A] hover:text-[#EDEDF2] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
