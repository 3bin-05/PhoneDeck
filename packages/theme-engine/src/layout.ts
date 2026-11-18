import { type ThemeConfig, VOID_THEME, computeConfigHash } from './theme';

export interface PlacedWidget {
  instanceId: string;
  widgetId: string; // e.g. "clock-digital", "metric-cpu", etc.
  x: number; // 0..11 (12 columns)
  y: number; // 0..5 (6 rows)
  w: number; // width in grid columns
  h: number; // height in grid rows
  titleOverride?: string;
  accentOverride?: string;
  options?: Record<string, any>;
}

export interface DeckPage {
  id: string;
  title: string;
  hidden: boolean;
  widgets: PlacedWidget[];
}

export interface DeckConfiguration {
  version: string;
  activeThemeName: string;
  theme: ThemeConfig;
  pages: DeckPage[];
  activePageIndex: number;
  contentHash: string;
}

export const STARTER_TEMPLATES: Record<string, DeckPage> = {
  systemOverview: {
    id: 'page-system',
    title: 'System Overview',
    hidden: false,
    widgets: [
      {
        instanceId: 'widget-clock',
        widgetId: 'clock-digital',
        x: 0,
        y: 0,
        w: 4,
        h: 2,
      },
      {
        instanceId: 'widget-gauge',
        widgetId: 'gauge-radial',
        x: 4,
        y: 0,
        w: 3,
        h: 4,
      },
      {
        instanceId: 'widget-cpu-tile',
        widgetId: 'metric-cpu',
        x: 7,
        y: 0,
        w: 3,
        h: 2,
      },
      {
        instanceId: 'widget-ram-tile',
        widgetId: 'metric-ram',
        x: 10,
        y: 0,
        w: 2,
        h: 2,
      },
      {
        instanceId: 'widget-chart',
        widgetId: 'chart-history',
        x: 7,
        y: 2,
        w: 5,
        h: 4,
      },
      {
        instanceId: 'widget-mem-disks',
        widgetId: 'memory-disks',
        x: 0,
        y: 2,
        w: 4,
        h: 2,
      },
      {
        instanceId: 'widget-net',
        widgetId: 'network-io',
        x: 0,
        y: 4,
        w: 4,
        h: 2,
      },
      {
        instanceId: 'widget-uptime',
        widgetId: 'system-uptime',
        x: 4,
        y: 4,
        w: 3,
        h: 2,
      },
    ],
  },

  developerHub: {
    id: 'page-dev',
    title: 'Developer Hub',
    hidden: false,
    widgets: [
      {
        instanceId: 'widget-inbox',
        widgetId: 'agent-inbox',
        x: 0,
        y: 0,
        w: 6,
        h: 3,
      },
      {
        instanceId: 'widget-procs',
        widgetId: 'top-processes',
        x: 6,
        y: 0,
        w: 6,
        h: 3,
      },
      {
        instanceId: 'widget-flip',
        widgetId: 'clock-flip',
        x: 0,
        y: 3,
        w: 4,
        h: 3,
      },
      {
        instanceId: 'widget-cpu-hist',
        widgetId: 'chart-history',
        x: 4,
        y: 3,
        w: 5,
        h: 3,
      },
      {
        instanceId: 'widget-phone',
        widgetId: 'phone-status',
        x: 9,
        y: 3,
        w: 3,
        h: 3,
      },
    ],
  },

  ambientMinimal: {
    id: 'page-ambient',
    title: 'Ambient & Minimal',
    hidden: false,
    widgets: [
      {
        instanceId: 'widget-analog',
        widgetId: 'clock-analog',
        x: 0,
        y: 0,
        w: 4,
        h: 6,
      },
      {
        instanceId: 'widget-gpu',
        widgetId: 'metric-cpu',
        x: 4,
        y: 0,
        w: 4,
        h: 3,
        titleOverride: 'GPU LOAD',
      },
      {
        instanceId: 'widget-phone-amb',
        widgetId: 'phone-status',
        x: 8,
        y: 0,
        w: 4,
        h: 3,
      },
      {
        instanceId: 'widget-net-amb',
        widgetId: 'network-io',
        x: 4,
        y: 3,
        w: 4,
        h: 3,
      },
      {
        instanceId: 'widget-up-amb',
        widgetId: 'system-uptime',
        x: 8,
        y: 3,
        w: 4,
        h: 3,
      },
    ],
  },
};

export const DEFAULT_DECK_CONFIG: DeckConfiguration = {
  version: '1.0',
  activeThemeName: 'void',
  theme: VOID_THEME,
  pages: [
    STARTER_TEMPLATES.systemOverview,
    STARTER_TEMPLATES.developerHub,
    STARTER_TEMPLATES.ambientMinimal,
  ],
  activePageIndex: 0,
  contentHash: computeConfigHash({
    theme: VOID_THEME,
    pages: [
      STARTER_TEMPLATES.systemOverview,
      STARTER_TEMPLATES.developerHub,
      STARTER_TEMPLATES.ambientMinimal,
    ],
  }),
};

/**
 * Creates a fresh DeckConfiguration with updated content hash.
 */
export function createDeckConfig(
  theme: ThemeConfig,
  pages: DeckPage[],
  activePageIndex: number = 0
): DeckConfiguration {
  const hash = computeConfigHash({ theme, pages });
  return {
    version: '1.0',
    activeThemeName: theme.name,
    theme,
    pages,
    activePageIndex,
    contentHash: hash,
  };
}
