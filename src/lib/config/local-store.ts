// --- Types ---
export interface JiraConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiToken: string;
  email: string;
  projectKeys: string;
  isActive: boolean;
}

export interface PgConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
  schemaName: string;
  tableName: string;
  isActive: boolean;
}


export interface KpiPlugin {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  formula: string | any;
  pluginType: 'custom' | 'builtin';
  language?: 'dsl' | 'javascript';
  isActive: boolean;
}

export interface AppSettings {
  rateLimit: {
    delayMs: number;
    maxRequestsPerMinute: number;
    batchSize: number;
    backoffStrategy: string;
  };
  general: {
    defaultHolidayState: string;
    workStartHour: number;
    workEndHour: number;
    defaultSlaTargetHours: number;
    listMaxHeight: number;
  };
  persistence: {
    autoSave: boolean;
    autoRestore: boolean;
    retentionDays: number | string;
  };
  sla: {
    statusTargets: Record<string, number>;
  };
  alerts: {
    thresholds: Record<string, { warning: number; critical: number; operator: '>' | '<' }>;
  };
  webhooks: {
    enabled: boolean;
    secret: string;
  };
}

export interface StorageConfig {
  provider: 'sqlite' | 'postgresql';
  url: string;
  directUrl?: string;
  isCustom: boolean;
  /** ID of the saved PgConnection used as primary storage, if any */
  connectionId?: string;
}

// --- Implementation ---

export interface SavedJql {
  id: string;
  name: string;
  query: string;
}

export interface DashboardState {
  globalFilters?: Record<string, string[]>;
  hiddenDimensions?: string[];
  charts?: any[];
  dashboardJql?: string;
}

export interface DashboardPreset {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  globalFilters: Record<string, string[]>;
  charts: any[];
  dashboardJql: string;
  hiddenDimensions: string[];
}

const KEYS = {
  jira: 'cfg_jira_connections',
  pg: 'cfg_pg_connections',
  plugins: 'cfg_kpi_plugins',
  settings: 'cfg_app_settings',
  activeConnection: 'cfg_active_connection_id',
  storage: 'cfg_storage_config',
  jql: 'cfg_saved_jqls',
  dashboardJql: 'cfg_dashboard_jqls',
  etlUpdateOnly: 'cfg_etl_update_only',
  dashboardState: 'cfg_dashboard_state',
  presets: 'cfg_dashboard_presets',
};

const DEFAULT_SETTINGS: AppSettings = {
  rateLimit: {
    delayMs: 0,
    maxRequestsPerMinute: 60,
    batchSize: 50,
    backoffStrategy: 'none',
  },
  general: {
    defaultHolidayState: 'national',
    workStartHour: 9,
    workEndHour: 17,
    defaultSlaTargetHours: 40,
    listMaxHeight: 400,
  },
  persistence: {
    autoSave: true,
    autoRestore: true,
    retentionDays: 30,
  },
  sla: {
    statusTargets: {},
  },
  alerts: {
    thresholds: {
      'sla_compliance': { warning: 95, critical: 90, operator: '<' },
      'resolution_rate': { warning: 80, critical: 60, operator: '<' },
      'reassignment_count': { warning: 2, critical: 4, operator: '>' },
      'avg_processing_hours': { warning: 40, critical: 80, operator: '>' },
    },
  },
  webhooks: {
    enabled: false,
    secret: 'jira-etl-secret-' + Math.random().toString(36).substring(7),
  },
};

const isBrowser = typeof window !== 'undefined';

function get<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function set<T>(key: string, value: T): void {
  if (!isBrowser) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const localConfig = {
  getJiraConnections: () => get<JiraConnection[]>(KEYS.jira, []),
  saveJiraConnections: (conns: JiraConnection[]) => set(KEYS.jira, conns),

  getPgConnections: () => get<PgConnection[]>(KEYS.pg, []),
  savePgConnections: (conns: PgConnection[]) => set(KEYS.pg, conns),


  getKpiPlugins: () => get<KpiPlugin[]>(KEYS.plugins, []),
  saveKpiPlugins: (plugins: KpiPlugin[]) => set(KEYS.plugins, plugins),

  getSettings: () => {
    const s = get<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      rateLimit: { ...DEFAULT_SETTINGS.rateLimit, ...(s.rateLimit || {}) },
      general: { ...DEFAULT_SETTINGS.general, ...(s.general || {}) },
      persistence: { ...DEFAULT_SETTINGS.persistence, ...(s.persistence || {}) },
      sla: { ...DEFAULT_SETTINGS.sla, ...(s.sla || {}) },
      alerts: { ...DEFAULT_SETTINGS.alerts, ...(s.alerts || {}) },
      webhooks: { ...DEFAULT_SETTINGS.webhooks, ...(s.webhooks || {}) },
    };
  },
  saveSettings: (s: Partial<AppSettings>) => {
    const current = localConfig.getSettings();
    set(KEYS.settings, { ...current, ...s });
  },

  getActiveConnectionId: () => get<string | null>(KEYS.activeConnection, null),
  setActiveConnectionId: (id: string | null) => set(KEYS.activeConnection, id),

  getStorageConfig: () => get<StorageConfig>(KEYS.storage, { provider: 'sqlite', url: '', isCustom: false }),
  saveStorageConfig: (c: StorageConfig) => set(KEYS.storage, c),

  getSavedJqls: () => get<SavedJql[]>(KEYS.jql, []),
  saveJqls: (jqls: SavedJql[]) => set(KEYS.jql, jqls),

  getDashboardJqls: () => get<SavedJql[]>(KEYS.dashboardJql, []),
  saveDashboardJqls: (jqls: SavedJql[]) => set(KEYS.dashboardJql, jqls),

  getEtlUpdateOnly: () => get<boolean>(KEYS.etlUpdateOnly, false),
  saveEtlUpdateOnly: (val: boolean) => set(KEYS.etlUpdateOnly, val),

  getDashboardState: (connectionId: string) => {
    const states = get<Record<string, DashboardState>>(KEYS.dashboardState, {});
    return states[connectionId] || null;
  },
  saveDashboardState: (connectionId: string, state: DashboardState) => {
    if (!connectionId) return;
    const states = get<Record<string, DashboardState>>(KEYS.dashboardState, {});
    states[connectionId] = state;
    set(KEYS.dashboardState, states);
  },
  
  getDashboardPresets: (connectionId: string) => {
    const allPresets = get<Record<string, DashboardPreset[]>>(KEYS.presets, {});
    return allPresets[connectionId] || [];
  },
  saveDashboardPresets: (connectionId: string, presets: DashboardPreset[]) => {
    if (!connectionId) return;
    const allPresets = get<Record<string, DashboardPreset[]>>(KEYS.presets, {});
    allPresets[connectionId] = presets;
    set(KEYS.presets, allPresets);
  },

  exportConfig: () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      jiraConnections: localConfig.getJiraConnections(),
      pgConnections: localConfig.getPgConnections(),
      customPlugins: localConfig.getKpiPlugins(),
      settings: localConfig.getSettings(),
      savedJqls: localConfig.getSavedJqls(),
    };
    return data;
  },

  importConfig: (data: any) => {
    try {
      if (data.jiraConnections) localConfig.saveJiraConnections(data.jiraConnections);
      if (data.pgConnections) localConfig.savePgConnections(data.pgConnections);
      if (data.customPlugins) localConfig.saveKpiPlugins(data.customPlugins);
      if (data.settings) localConfig.saveSettings(data.settings);
      if (data.savedJqls) localConfig.saveJqls(data.savedJqls);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  clear: () => {
    if (!isBrowser) return;
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }
};

/** Builds a postgresql:// URL from a PgConnection (host-based form). */
export function buildPgConnectionUrl(conn: PgConnection): string {
  const ssl = conn.sslMode && conn.sslMode !== 'disable' ? `?sslmode=${conn.sslMode}` : '';
  const pw = conn.password ? `:${encodeURIComponent(conn.password)}` : '';
  return `postgresql://${conn.username}${pw}@${conn.host}:${conn.port}/${conn.database}${ssl}`;
}

/** Returns true when a PostgreSQL URL belongs to Supabase. */
export function isSupabaseUrl(url: string): boolean {
  return url.includes('supabase.com');
}
