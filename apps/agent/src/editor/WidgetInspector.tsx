import React from 'react';
import type { PlacedWidget } from '@phone-deck/theme-engine';
import { WIDGET_CATALOG } from '@phone-deck/widgets';
import { Sliders, Trash2 } from 'lucide-react';

export interface WidgetInspectorProps {
  widget: PlacedWidget | null;
  onUpdate: (updated: PlacedWidget) => void;
  onRemove: (instanceId: string) => void;
}

export const WidgetInspector: React.FC<WidgetInspectorProps> = ({
  widget,
  onUpdate,
  onRemove,
}) => {
  if (!widget) {
    return (
      <div className="w-72 h-full bg-[#08080C] border-l border-white/[0.08] p-4 flex flex-col items-center justify-center text-center text-[#71717A] text-xs font-mono select-none">
        <Sliders className="w-6 h-6 mb-2 text-[#4B4B55]" />
        <span>No widget selected</span>
        <span className="text-[10px] text-[#4B4B55] mt-1">
          Click any widget on the canvas to edit its properties
        </span>
      </div>
    );
  }

  const catalogEntry = WIDGET_CATALOG.find((w) => w.id === widget.widgetId);
  const colorPresets = ['#7C5CFF', '#00E599', '#00F0FF', '#FFB800', '#FF3B5C'];

  return (
    <div className="w-72 h-full bg-[#08080C] border-l border-white/[0.08] flex flex-col p-4 select-none font-mono text-xs overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3">
        <div>
          <h4 className="font-semibold text-[#EDEDF2] uppercase text-[11px]">
            {catalogEntry?.name || widget.widgetId}
          </h4>
          <span className="text-[10px] text-[#71717A]">{widget.widgetId}</span>
        </div>
        <button
          onClick={() => onRemove(widget.instanceId)}
          className="p-1.5 rounded-lg bg-[#FF3B5C]/10 text-[#FF3B5C] hover:bg-[#FF3B5C]/20 transition-colors"
          title="Delete Widget"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Title Override */}
        <div>
          <label className="text-[10px] text-[#71717A] uppercase block mb-1">
            Display Title Override
          </label>
          <input
            type="text"
            value={widget.titleOverride || ''}
            onChange={(e) =>
              onUpdate({
                ...widget,
                titleOverride: e.target.value || undefined,
              })
            }
            placeholder={catalogEntry?.name || 'Default Title'}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-[#EDEDF2] placeholder-[#4B4B55] focus:outline-none focus:border-[#7C5CFF]"
          />
        </div>

        {/* Accent Color Preset Swatches */}
        <div>
          <label className="text-[10px] text-[#71717A] uppercase block mb-1">
            Accent Color
          </label>
          <div className="flex items-center space-x-2">
            {colorPresets.map((c) => (
              <button
                key={c}
                onClick={() => onUpdate({ ...widget, accentOverride: c })}
                className={`w-5 h-5 rounded-full transition-transform ${
                  widget.accentOverride === c ? 'scale-125 ring-2 ring-white' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="text"
              value={widget.accentOverride || ''}
              onChange={(e) =>
                onUpdate({
                  ...widget,
                  accentOverride: e.target.value || undefined,
                })
              }
              placeholder="Theme default"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] text-[#EDEDF2] focus:outline-none focus:border-[#7C5CFF]"
            />
          </div>
        </div>

        {/* Coordinates (X, Y) */}
        <div>
          <label className="text-[10px] text-[#71717A] uppercase block mb-1">
            Grid Position (X, Y)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[9px] text-[#4B4B55]">COLUMN X (0-11)</span>
              <input
                type="number"
                min={0}
                max={12 - widget.w}
                value={widget.x}
                onChange={(e) =>
                  onUpdate({
                    ...widget,
                    x: Math.max(0, Math.min(12 - widget.w, Number(e.target.value))),
                  })
                }
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#EDEDF2] focus:outline-none focus:border-[#7C5CFF]"
              />
            </div>
            <div>
              <span className="text-[9px] text-[#4B4B55]">ROW Y (0-5)</span>
              <input
                type="number"
                min={0}
                max={6 - widget.h}
                value={widget.y}
                onChange={(e) =>
                  onUpdate({
                    ...widget,
                    y: Math.max(0, Math.min(6 - widget.h, Number(e.target.value))),
                  })
                }
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#EDEDF2] focus:outline-none focus:border-[#7C5CFF]"
              />
            </div>
          </div>
        </div>

        {/* Dimensions (W, H) */}
        <div>
          <label className="text-[10px] text-[#71717A] uppercase block mb-1">
            Grid Size (W × H)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[9px] text-[#4B4B55]">WIDTH (COLUMNS)</span>
              <input
                type="number"
                min={catalogEntry?.minSize.w || 1}
                max={12 - widget.x}
                value={widget.w}
                onChange={(e) =>
                  onUpdate({
                    ...widget,
                    w: Math.max(
                      catalogEntry?.minSize.w || 1,
                      Math.min(12 - widget.x, Number(e.target.value))
                    ),
                  })
                }
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#EDEDF2] focus:outline-none focus:border-[#7C5CFF]"
              />
            </div>
            <div>
              <span className="text-[9px] text-[#4B4B55]">HEIGHT (ROWS)</span>
              <input
                type="number"
                min={catalogEntry?.minSize.h || 1}
                max={6 - widget.y}
                value={widget.h}
                onChange={(e) =>
                  onUpdate({
                    ...widget,
                    h: Math.max(
                      catalogEntry?.minSize.h || 1,
                      Math.min(6 - widget.y, Number(e.target.value))
                    ),
                  })
                }
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#EDEDF2] focus:outline-none focus:border-[#7C5CFF]"
              />
            </div>
          </div>
        </div>

        {/* Sensor Needs Information */}
        {catalogEntry && catalogEntry.needs.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06]">
            <span className="text-[10px] text-[#71717A] uppercase block mb-1">
              Required Field IDs
            </span>
            <div className="flex flex-wrap gap-1">
              {catalogEntry.needs.map((fid) => (
                <span
                  key={fid}
                  className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px] text-[#EDEDF2]"
                >
                  FIELD #{fid}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
