import React, { useState, useMemo } from 'react';
import { WIDGET_CATALOG, type WidgetCatalogEntry } from '@phone-deck/widgets';
import { Search, Plus, Clock, Cpu, Bot, User, Layers } from 'lucide-react';

export interface WidgetPaletteProps {
  onAddWidget: (entry: WidgetCatalogEntry) => void;
}

export const WidgetPalette: React.FC<WidgetPaletteProps> = ({ onAddWidget }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filtered = useMemo(() => {
    return WIDGET_CATALOG.filter((w) => {
      const matchSearch =
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.id.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === 'all' || w.category === category;
      return matchSearch && matchCat;
    });
  }, [search, category]);

  const categories = [
    { id: 'all', label: 'All', icon: Layers },
    { id: 'time', label: 'Time', icon: Clock },
    { id: 'computer', label: 'System', icon: Cpu },
    { id: 'ai', label: 'AI Hub', icon: Bot },
    { id: 'personal', label: 'Device', icon: User },
  ];

  return (
    <div className="w-80 h-full bg-[#08080C] border-r border-white/[0.08] flex flex-col p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#EDEDF2] flex items-center space-x-1.5">
          <Layers className="w-4 h-4 text-[#7C5CFF]" />
          <span>Widget Palette</span>
        </h3>
        <span className="text-[10px] font-mono text-[#71717A]">
          {filtered.length} AVAILABLE
        </span>
      </div>

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#71717A]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search widgets..."
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-[#EDEDF2] placeholder-[#4B4B55] focus:outline-none focus:border-[#7C5CFF]"
        />
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                isActive
                  ? 'bg-[#7C5CFF] text-white'
                  : 'bg-white/[0.03] text-[#71717A] hover:text-[#EDEDF2] hover:bg-white/[0.06]'
              }`}
            >
              <Icon className="w-2.5 h-2.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Widget Cards List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-center justify-between group"
          >
            <div className="space-y-0.5 max-w-[190px]">
              <div className="text-xs font-medium text-[#EDEDF2] truncate">
                {item.name}
              </div>
              <div className="text-[10px] font-mono text-[#71717A] flex items-center space-x-2">
                <span className="uppercase text-[#7C5CFF]">{item.category}</span>
                <span>·</span>
                <span>
                  {item.defaultSize.w}×{item.defaultSize.h} (MIN {item.minSize.w}×{item.minSize.h})
                </span>
              </div>
            </div>

            <button
              onClick={() => onAddWidget(item)}
              className="p-1.5 rounded-lg bg-white/[0.04] group-hover:bg-[#7C5CFF] text-[#EDEDF2] group-hover:text-white transition-colors"
              title="Add widget to active page"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
