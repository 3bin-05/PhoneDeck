import React, { useRef, useState, useCallback } from 'react';
import type { PlacedWidget, ThemeConfig } from '@phone-deck/theme-engine';
import { WIDGET_CATALOG } from '@phone-deck/widgets';
import { Trash2, Move, Maximize2 } from 'lucide-react';

export interface PhoneCanvasProps {
  widgets: PlacedWidget[];
  selectedWidgetId: string | null;
  theme: ThemeConfig;
  onSelectWidget: (instanceId: string | null) => void;
  onUpdateWidget: (updated: PlacedWidget) => void;
  onRemoveWidget: (instanceId: string) => void;
}

export const PhoneCanvas: React.FC<PhoneCanvasProps> = ({
  widgets,
  selectedWidgetId,
  theme,
  onSelectWidget,
  onUpdateWidget,
  onRemoveWidget,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);

  // Drag to Move handler
  const handleMouseDownMove = useCallback(
    (e: React.MouseEvent, widget: PlacedWidget) => {
      e.stopPropagation();
      onSelectWidget(widget.instanceId);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cellW = rect.width / 12;
      const cellH = rect.height / 6;

      const startX = e.clientX;
      const startY = e.clientY;
      const initialGridX = widget.x;
      const initialGridY = widget.y;

      setDraggingId(widget.instanceId);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const gridDx = Math.round(dx / cellW);
        const gridDy = Math.round(dy / cellH);

        const newX = Math.max(0, Math.min(12 - widget.w, initialGridX + gridDx));
        const newY = Math.max(0, Math.min(6 - widget.h, initialGridY + gridDy));

        if (newX !== widget.x || newY !== widget.y) {
          onUpdateWidget({ ...widget, x: newX, y: newY });
        }
      };

      const onMouseUp = () => {
        setDraggingId(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onSelectWidget, onUpdateWidget]
  );

  // Drag Corner to Resize handler
  const handleMouseDownResize = useCallback(
    (e: React.MouseEvent, widget: PlacedWidget) => {
      e.stopPropagation();
      onSelectWidget(widget.instanceId);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cellW = rect.width / 12;
      const cellH = rect.height / 6;

      const startX = e.clientX;
      const startY = e.clientY;
      const initialW = widget.w;
      const initialH = widget.h;

      const catalogEntry = WIDGET_CATALOG.find((w) => w.id === widget.widgetId);
      const minW = catalogEntry?.minSize.w || 2;
      const minH = catalogEntry?.minSize.h || 1;

      setResizingId(widget.instanceId);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const gridDw = Math.round(dx / cellW);
        const gridDh = Math.round(dy / cellH);

        const newW = Math.max(minW, Math.min(12 - widget.x, initialW + gridDw));
        const newH = Math.max(minH, Math.min(6 - widget.y, initialH + gridDh));

        if (newW !== widget.w || newH !== widget.h) {
          onUpdateWidget({ ...widget, w: newW, h: newH });
        }
      };

      const onMouseUp = () => {
        setResizingId(null);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onSelectWidget, onUpdateWidget]
  );

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Outer Phone Bezel Container */}
      <div className="relative p-3 bg-[#111116] rounded-[28px] border-2 border-white/[0.12] shadow-2xl">
        {/* Subtle camera / speaker dot */}
        <div className="absolute top-1/2 -left-2 transform -translate-y-1/2 w-1.5 h-6 bg-white/[0.2] rounded-full" />
        <div className="absolute top-1/2 -right-2 transform -translate-y-1/2 w-1.5 h-6 bg-white/[0.2] rounded-full" />

        {/* 12x6 Grid Screen Viewport (~780x360 CSS px landscape) */}
        <div
          ref={canvasRef}
          onClick={() => onSelectWidget(null)}
          style={{
            backgroundColor: theme.palette.surface,
            borderColor: theme.palette.border,
            fontFamily: theme.type.mono,
          }}
          className="relative w-[780px] h-[360px] rounded-[18px] border overflow-hidden select-none"
        >
          {/* Hairline Grid Background */}
          <div className="absolute inset-0 grid grid-cols-12 grid-rows-6 pointer-events-none">
            {Array.from({ length: 72 }).map((_, i) => (
              <div
                key={i}
                className="border-r border-b border-white/[0.03] last:border-r-0"
              />
            ))}
          </div>

          {/* Render Placed Widgets */}
          {widgets.map((widget) => {
            const isSelected = selectedWidgetId === widget.instanceId;
            const isDragging = draggingId === widget.instanceId;
            const isResizing = resizingId === widget.instanceId;

            const catalogEntry = WIDGET_CATALOG.find(
              (w) => w.id === widget.widgetId
            );
            const displayName =
              widget.titleOverride || catalogEntry?.name || widget.widgetId;
            const accent = widget.accentOverride || theme.palette.accent;

            // Compute exact grid position (using % to adapt cleanly)
            const left = `${(widget.x / 12) * 100}%`;
            const top = `${(widget.y / 6) * 100}%`;
            const width = `${(widget.w / 12) * 100}%`;
            const height = `${(widget.h / 6) * 100}%`;

            return (
              <div
                key={widget.instanceId}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWidget(widget.instanceId);
                }}
                style={{
                  left,
                  top,
                  width,
                  height,
                  backgroundColor: theme.palette.surfaceSubtle,
                  borderColor: isSelected ? accent : theme.palette.border,
                  borderRadius: `${theme.shape.radius}px`,
                  boxShadow: isSelected
                    ? `0 0 16px ${accent}66, inset 0 0 0 1px ${accent}`
                    : 'none',
                }}
                className={`absolute p-2.5 flex flex-col justify-between transition-shadow cursor-pointer ${
                  isDragging || isResizing ? 'opacity-90 z-30' : 'z-10'
                }`}
              >
                {/* Header with Title and Move Handle */}
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#71717A]">
                  <span className="truncate max-w-[120px] font-semibold text-[#EDEDF2]">
                    {displayName}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onMouseDown={(e) => handleMouseDownMove(e, widget)}
                      className="p-1 rounded hover:bg-white/[0.08] text-[#71717A] hover:text-[#EDEDF2] cursor-grab active:cursor-grabbing"
                      title="Drag to Move"
                    >
                      <Move className="w-3 h-3" />
                    </button>
                    {isSelected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveWidget(widget.instanceId);
                        }}
                        className="p-1 rounded hover:bg-[#FF3B5C]/20 text-[#71717A] hover:text-[#FF3B5C]"
                        title="Remove Widget"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Widget Center Placeholder Representation */}
                <div className="flex-1 flex flex-col items-center justify-center pointer-events-none">
                  <div
                    className="w-2.5 h-2.5 rounded-full mb-1"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="text-[10px] font-mono text-[#71717A]">
                    {widget.w} × {widget.h}
                  </span>
                </div>

                {/* Footer status */}
                <div className="flex items-center justify-between text-[9px] text-[#4B4B55] pointer-events-none">
                  <span>
                    X:{widget.x} Y:{widget.y}
                  </span>
                  <span style={{ color: accent }}>{widget.widgetId}</span>
                </div>

                {/* Resize Handle at Bottom-Right */}
                {isSelected && (
                  <div
                    onMouseDown={(e) => handleMouseDownResize(e, widget)}
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#7C5CFF] text-white flex items-center justify-center cursor-nwse-resize shadow-md hover:scale-110 transition-transform z-20"
                    title="Drag to Resize"
                  >
                    <Maximize2 className="w-2.5 h-2.5 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
