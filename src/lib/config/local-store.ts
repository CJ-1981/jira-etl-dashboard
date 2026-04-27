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

const KEYS = {
  jira: 'cfg_jira_connections',
  pg: 'cfg_pg_connections',
  plugins: 'cfg_kpi_plugins',
  settings: 'cfg_app_settings',
  activeConnection: 'cfg_active_connection_id',
  storage: 'cfg_storage_config',
  jql: 'cfg_saved_jqls',
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
