import catalog from './widgets.json';

export interface WidgetCatalogEntry {
  id: string;
  name: string;
  category: 'time' | 'computer' | 'ai' | 'personal' | 'data';
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  needs: string[];
}

export interface WidgetInstance {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  options?: Record<string, unknown>;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = catalog.widgets as WidgetCatalogEntry[];
