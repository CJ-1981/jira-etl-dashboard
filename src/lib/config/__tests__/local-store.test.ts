/**
 * Tests for local-store.ts — the localStorage-backed configuration wrapper
 * (`localConfig`), plus the pure helpers `buildPgConnectionUrl` and
 * `isSupabaseUrl`. jsdom provides a real-enough `window.localStorage`; each
 * test gets a fresh store via beforeEach(localStorage.clear).
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  localConfig,
  KEYS,
  DEFAULT_SETTINGS,
  buildPgConnectionUrl,
  isSupabaseUrl,
  activeViewKey,
  type JiraConnection,
  type PgConnection,
  type KpiPlugin,
  type StorageConfig,
  type DashboardState,
  type DashboardPreset,
  type CustomExtractField,
} from '../local-store';

// jsdom rejects `storageArea` that isn't a real Storage instance, but the
// real local-store passes the (mock) localStorage as storageArea when dispatching
// the storage event in saveActivePlugins. Stub a lenient StorageEvent ctor so
// that dispatch path works under jsdom; tests still assert key/newValue/type.
class LenientStorageEvent extends Event {
  key: string | null;
  newValue: string | null;
  storageArea: Storage | null;
  url: string;
  oldValue: string | null;
  constructor(type: string, init: any = {}) {
    super(type);
    this.key = init.key ?? null;
    this.newValue = init.newValue ?? null;
    this.oldValue = init.oldValue ?? null;
    this.storageArea = init.storageArea ?? null;
    this.url = init.url ?? '';
  }
}

beforeAll(() => {
  vi.stubGlobal('StorageEvent', LenientStorageEvent);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  localStorage.clear();
});

describe('KEYS / DEFAULT_SETTINGS', () => {
  it('exposes stable storage keys', () => {
    expect(KEYS.jira).toBe('cfg_jira_connections');
    expect(KEYS.activePlugins).toBe('cfg_active_plugins');
    expect(KEYS.theme).toBe('jira-etl-theme');
    expect(KEYS.widgetOrder).toBe('widget_display_order');
    expect(KEYS.activeView).toBe('activeView_');
  });

  it('ships sensible default settings', () => {
    expect(DEFAULT_SETTINGS.rateLimit.maxRequestsPerMinute).toBe(60);
    expect(DEFAULT_SETTINGS.general.workStartHour).toBe(9);
    expect(DEFAULT_SETTINGS.persistence.autoSave).toBe(true);
    expect(DEFAULT_SETTINGS.alerts.thresholds).toHaveProperty('sla_compliance');
  });
});

describe('Jira connections', () => {
  const conn: JiraConnection = {
    id: 'j1',
    name: 'Prod',
    baseUrl: 'https://jira.example.com',
    apiToken: 'tok',
    email: 'user@example.com',
    projectKeys: 'PROJ',
    isActive: true,
  };

  it('defaults to an empty array', () => {
    expect(localConfig.getJiraConnections()).toEqual([]);
    expect(localStorage.getItem(KEYS.jira)).toBeNull();
  });

  it('round-trips and writes the localStorage key', () => {
    localConfig.saveJiraConnections([conn]);
    expect(localConfig.getJiraConnections()).toEqual([conn]);
    expect(JSON.parse(localStorage.getItem(KEYS.jira)!)).toEqual([conn]);
  });

  it('overwrites previous values on re-save', () => {
    localConfig.saveJiraConnections([conn]);
    localConfig.saveJiraConnections([]);
    expect(localConfig.getJiraConnections()).toEqual([]);
  });
});

describe('Postgres connections', () => {
  const conn: PgConnection = {
    id: 'p1',
    name: 'PG',
    host: 'db.example.com',
    port: 5432,
    database: 'app',
    username: 'u',
    password: 'pw',
    sslMode: 'require',
    schemaName: 'public',
    tableName: 'issues',
    isActive: true,
  };

  it('defaults to [] and round-trips', () => {
    expect(localConfig.getPgConnections()).toEqual([]);
    localConfig.savePgConnections([conn]);
    expect(localConfig.getPgConnections()).toEqual([conn]);
    expect(JSON.parse(localStorage.getItem(KEYS.pg)!)).toEqual([conn]);
  });
});

describe('KPI plugins', () => {
  const plugin: KpiPlugin = {
    id: 'cp1',
    name: 'Custom',
    description: 'desc',
    category: 'custom',
    unit: 'count',
    formula: '1 + 1',
    pluginType: 'custom',
    isActive: true,
  };

  it('defaults to [] and round-trips', () => {
    expect(localConfig.getKpiPlugins()).toEqual([]);
    localConfig.saveKpiPlugins([plugin]);
    expect(localConfig.getKpiPlugins()).toEqual([plugin]);
    expect(JSON.parse(localStorage.getItem(KEYS.plugins)!)).toEqual([plugin]);
  });
});

describe('Active connection id', () => {
  it('defaults to null', () => {
    expect(localConfig.getActiveConnectionId()).toBeNull();
  });

  it('round-trips a string and null', () => {
    localConfig.setActiveConnectionId('c1');
    expect(localConfig.getActiveConnectionId()).toBe('c1');
    expect(localStorage.getItem(KEYS.activeConnection)).toBe(JSON.stringify('c1'));

    localConfig.setActiveConnectionId(null);
    expect(localConfig.getActiveConnectionId()).toBeNull();
    expect(localStorage.getItem(KEYS.activeConnection)).toBe(JSON.stringify(null));
  });
});

describe('Storage config', () => {
  it('defaults to a sqlite config', () => {
    expect(localConfig.getStorageConfig()).toEqual({
      provider: 'sqlite',
      url: '',
      isCustom: false,
    });
  });

  it('round-trips a custom config', () => {
    const cfg: StorageConfig = {
      provider: 'postgresql',
      url: 'postgresql://u@h/d',
      isCustom: true,
      connectionId: 'p1',
    };
    localConfig.saveStorageConfig(cfg);
    expect(localConfig.getStorageConfig()).toEqual(cfg);
  });
});

describe('Settings (deep-merge with DEFAULT_SETTINGS)', () => {
  it('returns DEFAULT_SETTINGS when nothing is stored', () => {
    const s = localConfig.getSettings();
    expect(s.rateLimit.maxRequestsPerMinute).toBe(60);
    expect(s.general.workStartHour).toBe(9);
    expect(s.persistence.retentionDays).toBe(30);
    expect(s.alerts.thresholds).toHaveProperty('sla_compliance');
  });

  it('merges a partial settings update section-by-section', () => {
    localConfig.saveSettings({ general: { workStartHour: 8 } } as any);
    const s = localConfig.getSettings();
    expect(s.general.workStartHour).toBe(8); // override
    expect(s.general.workEndHour).toBe(17); // default preserved
    expect(s.general.defaultHolidayState).toBe('national');
    // Untouched sections keep defaults
    expect(s.rateLimit.batchSize).toBe(50);
  });

  it('writes the merged settings under the settings key', () => {
    localConfig.saveSettings({ general: { workStartHour: 8 } } as any);
    const raw = JSON.parse(localStorage.getItem(KEYS.settings)!);
    expect(raw.general.workStartHour).toBe(8);
  });
});

describe('Dashboard state', () => {
  it('returns null when no state is stored for a connection', () => {
    expect(localConfig.getDashboardState('c1')).toBeNull();
  });

  it('round-trips per-connection state', () => {
    const state: DashboardState = { dashboardJql: 'project = X', collapsedWidgets: ['w1'] };
    localConfig.saveDashboardState('c1', state);
    expect(localConfig.getDashboardState('c1')).toEqual(state);

    localConfig.saveDashboardState('c2', { dashboardJql: 'project = Y' });
    expect(localConfig.getDashboardState('c1')).toEqual(state);
    expect(localConfig.getDashboardState('c2')?.dashboardJql).toBe('project = Y');
  });

  it('no-ops when connectionId is empty', () => {
    localConfig.saveDashboardState('', { dashboardJql: 'x' });
    expect(localStorage.getItem(KEYS.dashboardState)).toBeNull();
    expect(localConfig.getDashboardState('')).toBeNull();
  });
});

describe('Dashboard presets', () => {
  const preset: DashboardPreset = {
    id: 'ps1',
    name: 'Default',
    dateFrom: '2026-01-01',
    dateTo: '2026-02-01',
    globalFilters: { status: ['Open'] },
    charts: [],
    dashboardJql: '',
    hiddenDimensions: [],
  };

  it('returns [] when nothing is stored', () => {
    expect(localConfig.getDashboardPresets('c1')).toEqual([]);
  });

  it('round-trips per-connection presets', () => {
    localConfig.saveDashboardPresets('c1', [preset]);
    expect(localConfig.getDashboardPresets('c1')).toEqual([preset]);
    expect(localConfig.getDashboardPresets('c2')).toEqual([]);
  });

  it('no-ops when connectionId is empty', () => {
    localConfig.saveDashboardPresets('', [preset]);
    expect(localStorage.getItem(KEYS.presets)).toBeNull();
  });
});

describe('Custom extract fields', () => {
  it('pre-seeds defaults on first read (null in storage)', () => {
    const fields = localConfig.getCustomExtractFields();
    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      id: 'default-sp',
      fieldId: 'customfield_10002',
      label: 'Story Points',
      role: 'storyPoints',
    });
    expect(fields[1]).toMatchObject({
      id: 'default-team',
      fieldId: 'customfield_10132',
      label: 'Issue Owner Team',
      role: 'issueOwnerTeam',
    });
    // Does not write to storage on read
    expect(localStorage.getItem(KEYS.customExtractFields)).toBeNull();
  });

  it('round-trips saved custom fields', () => {
    const fields: CustomExtractField[] = [
      { id: 'f1', fieldId: 'customfield_99999', label: 'My Field', role: 'custom' },
    ];
    localConfig.saveCustomExtractFields(fields);
    expect(localConfig.getCustomExtractFields()).toEqual(fields);
  });
});

describe('Active plugins (with StorageEvent dispatch)', () => {
  it('defaults to []', () => {
    expect(localConfig.getActivePlugins()).toEqual([]);
  });

  it('writes the value and dispatches a storage event', () => {
    const handler = vi.fn();
    window.addEventListener('storage', handler);

    localConfig.saveActivePlugins(['p1', 'p2']);

    expect(localConfig.getActivePlugins()).toEqual(['p1', 'p2']);
    expect(localStorage.getItem(KEYS.activePlugins)).toBe(JSON.stringify(['p1', 'p2']));
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as StorageEvent;
    expect(event.type).toBe('storage');
    expect(event.key).toBe(KEYS.activePlugins);
    expect(event.newValue).toBe(JSON.stringify(['p1', 'p2']));

    window.removeEventListener('storage', handler);
  });
});

describe('Submenu visibility', () => {
  it.each([
    ['DataCenter', 'getShowDataCenterSubmenu', 'setShowDataCenterSubmenu', KEYS.showDataCenterSubmenu],
    ['KpiAnalytics', 'getShowKpiAnalyticsSubmenu', 'setShowKpiAnalyticsSubmenu', KEYS.showKpiAnalyticsSubmenu],
    ['Settings', 'getShowSettingsSubmenu', 'setShowSettingsSubmenu', KEYS.showSettingsSubmenu],
  ] as const)('defaults %s submenu to true and round-trips false', (_label, getter, setter, key) => {
    expect((localConfig as any)[getter]()).toBe(true);
    (localConfig as any)[setter](false);
    expect((localConfig as any)[getter]()).toBe(false);
    expect(JSON.parse(localStorage.getItem(key)!)).toBe(false);
  });
});

describe('exportConfig / importConfig', () => {
  it('exports a versioned snapshot of the current (empty) state', () => {
    const data = localConfig.exportConfig();
    expect(data.version).toBe('1.2');
    expect(typeof data.exportedAt).toBe('string');
    expect(new Date(data.exportedAt).getTime()).not.toBeNaN();
    expect(data.jiraConnections).toEqual([]);
    expect(data.settings.rateLimit.maxRequestsPerMinute).toBe(60);
    expect(data.storage).toEqual({ provider: 'sqlite', url: '', isCustom: false });
    expect(data.ui).toEqual({
      showDataCenterSubmenu: true,
      showKpiAnalyticsSubmenu: true,
      showSettingsSubmenu: true,
    });
  });

  it('reflects saved data in the export', () => {
    const conn: JiraConnection = {
      id: 'j1', name: 'J', baseUrl: 'b', apiToken: 't', email: 'e', projectKeys: 'p', isActive: true,
    };
    localConfig.saveJiraConnections([conn]);
    localConfig.saveTheme('dark');
    const data = localConfig.exportConfig();
    expect(data.jiraConnections).toEqual([conn]);
    expect(data.theme).toBe('dark');
  });

  it('imports a full config payload and returns { success: true }', () => {
    const conn: JiraConnection = {
      id: 'j1', name: 'J', baseUrl: 'b', apiToken: 't', email: 'e', projectKeys: 'p', isActive: true,
    };
    const pg: PgConnection = {
      id: 'p1', name: 'P', host: 'h', port: 5432, database: 'd', username: 'u', password: 'p',
      sslMode: 'disable', schemaName: 'public', tableName: 't', isActive: true,
    };
    const plugin: KpiPlugin = {
      id: 'cp1', name: 'C', description: 'd', category: 'custom', unit: 'count', formula: '1',
      pluginType: 'custom', isActive: true,
    };
    const payload = {
      jiraConnections: [conn],
      pgConnections: [pg],
      customPlugins: [plugin],
      settings: { general: { workStartHour: 10 } },
      storage: { provider: 'postgresql' as const, url: 'postgresql://u@h/d', isCustom: true },
      savedJqls: [{ id: 'j1', name: 'JQL', query: 'q' }],
      dashboardJqls: [{ id: 'd1', name: 'DQL', query: 'q' }],
      etlUpdateOnly: true,
      customExtractFields: [{ id: 'f1', fieldId: 'cf_1', label: 'F' }],
      activeConnectionId: 'j1',
      favoritePlugins: ['fp1'],
      activePlugins: ['ap1'],
      collapsedGroups: ['g1'],
      widgetOrder: ['w1'],
      theme: 'dark',
      dashboardStates: { c1: { dashboardJql: 'x' } },
      presets: {
        c1: [{
          id: 'ps1', name: 'PS', dateFrom: '', dateTo: '', globalFilters: {}, charts: [],
          dashboardJql: '', hiddenDimensions: [],
        }],
      },
      ui: { showDataCenterSubmenu: false, showKpiAnalyticsSubmenu: false, showSettingsSubmenu: false },
    };

    const result = localConfig.importConfig(payload);
    expect(result).toEqual({ success: true });

    expect(localConfig.getJiraConnections()).toEqual([conn]);
    expect(localConfig.getPgConnections()).toEqual([pg]);
    expect(localConfig.getKpiPlugins()).toEqual([plugin]);
    expect(localConfig.getSettings().general.workStartHour).toBe(10);
    expect(localConfig.getStorageConfig()).toEqual(payload.storage);
    expect(localConfig.getSavedJqls()).toEqual([{ id: 'j1', name: 'JQL', query: 'q' }]);
    expect(localConfig.getDashboardJqls()).toEqual([{ id: 'd1', name: 'DQL', query: 'q' }]);
    expect(localConfig.getEtlUpdateOnly()).toBe(true);
    expect(localConfig.getCustomExtractFields()).toEqual([{ id: 'f1', fieldId: 'cf_1', label: 'F' }]);
    expect(localConfig.getActiveConnectionId()).toBe('j1');
    expect(localConfig.getFavoritePlugins()).toEqual(['fp1']);
    expect(localConfig.getActivePlugins()).toEqual(['ap1']);
    expect(localConfig.getCollapsedGroups()).toEqual(['g1']);
    expect(localConfig.getWidgetOrder()).toEqual(['w1']);
    expect(localConfig.getTheme()).toBe('dark');
    expect(localConfig.getDashboardState('c1')?.dashboardJql).toBe('x');
    expect(localConfig.getDashboardPresets('c1')).toHaveLength(1);
    expect(localConfig.getShowDataCenterSubmenu()).toBe(false);
    expect(localConfig.getShowKpiAnalyticsSubmenu()).toBe(false);
    expect(localConfig.getShowSettingsSubmenu()).toBe(false);
  });

  it('imports a partial payload (only jiraConnections) successfully', () => {
    const result = localConfig.importConfig({
      jiraConnections: [{
        id: 'j1', name: 'J', baseUrl: 'b', apiToken: 't', email: 'e', projectKeys: 'p', isActive: true,
      }],
    });
    expect(result).toEqual({ success: true });
    expect(localConfig.getJiraConnections()).toHaveLength(1);
    // Untouched keys stay at defaults
    expect(localConfig.getTheme()).toBe('light');
  });

  it('treats etlUpdateOnly:false as a value to save', () => {
    localConfig.saveEtlUpdateOnly(true);
    const result = localConfig.importConfig({ etlUpdateOnly: false });
    expect(result).toEqual({ success: true });
    expect(localConfig.getEtlUpdateOnly()).toBe(false);
  });

  it('returns { success: false, error } when serialization fails (circular)', () => {
    const circular: any = {};
    circular.self = circular;
    const result = localConfig.importConfig({ jiraConnections: circular });
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('returns { success: true } for an empty object', () => {
    expect(localConfig.importConfig({})).toEqual({ success: true });
  });

  it('handles a ui object with undefined submenu values (skips them)', () => {
    // Only showDataCenterSubmenu is set; the other two stay at their defaults.
    const result = localConfig.importConfig({
      ui: { showDataCenterSubmenu: false },
    });
    expect(result).toEqual({ success: true });
    expect(localConfig.getShowDataCenterSubmenu()).toBe(false);
    expect(localConfig.getShowKpiAnalyticsSubmenu()).toBe(true);
    expect(localConfig.getShowSettingsSubmenu()).toBe(true);
  });
});

describe('clear', () => {
  it('removes all config keys but leaves unrelated keys', () => {
    localConfig.saveJiraConnections([{
      id: 'j1', name: 'J', baseUrl: 'b', apiToken: 't', email: 'e', projectKeys: 'p', isActive: true,
    }]);
    localConfig.saveSettings({ general: { workStartHour: 8 } } as any);
    localStorage.setItem('unrelated-key', 'keep-me');

    localConfig.clear();

    expect(localStorage.getItem(KEYS.jira)).toBeNull();
    expect(localStorage.getItem(KEYS.settings)).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
    // Reads fall back to defaults
    expect(localConfig.getJiraConnections()).toEqual([]);
    expect(localConfig.getSettings().general.workStartHour).toBe(9);
  });
});

describe('get() error path', () => {
  it('returns the default when localStorage holds invalid JSON', () => {
    localStorage.setItem(KEYS.jira, '{not valid json');
    expect(localConfig.getJiraConnections()).toEqual([]);
  });
});

describe('buildPgConnectionUrl', () => {
  it('builds a host-based URL without password or ssl', () => {
    const conn: PgConnection = {
      id: 'p1', name: 'P', host: 'db.example.com', port: 5432, database: 'app',
      username: 'user', password: '', sslMode: '', schemaName: 'public', tableName: 't', isActive: true,
    };
    expect(buildPgConnectionUrl(conn)).toBe('postgresql://user@db.example.com:5432/app');
  });

  it('embeds an encoded password when present', () => {
    const conn: PgConnection = {
      id: 'p1', name: 'P', host: 'db.example.com', port: 5432, database: 'app',
      username: 'user', password: 'p@ss/w:ord', sslMode: 'disable', schemaName: 'public', tableName: 't', isActive: true,
    };
    expect(buildPgConnectionUrl(conn)).toBe(
      `postgresql://user:${encodeURIComponent('p@ss/w:ord')}@db.example.com:5432/app`,
    );
  });

  it('appends sslmode when sslMode is set and not disable', () => {
    const conn: PgConnection = {
      id: 'p1', name: 'P', host: 'db.example.com', port: 5432, database: 'app',
      username: 'user', password: '', sslMode: 'require', schemaName: 'public', tableName: 't', isActive: true,
    };
    expect(buildPgConnectionUrl(conn)).toBe('postgresql://user@db.example.com:5432/app?sslmode=require');
  });

  it('omits sslmode when sslMode is disable', () => {
    const conn: PgConnection = {
      id: 'p1', name: 'P', host: 'db.example.com', port: 5432, database: 'app',
      username: 'user', password: '', sslMode: 'disable', schemaName: 'public', tableName: 't', isActive: true,
    };
    expect(buildPgConnectionUrl(conn)).toBe('postgresql://user@db.example.com:5432/app');
  });
});

describe('isSupabaseUrl', () => {
  it('returns true for supabase URLs', () => {
    expect(isSupabaseUrl('postgresql://u@db.supabase.com:5432/postgres')).toBe(true);
    expect(isSupabaseUrl('https://api.supabase.com/v1')).toBe(true);
  });

  it('returns false for non-supabase URLs', () => {
    expect(isSupabaseUrl('postgresql://u@db.example.com:5432/app')).toBe(false);
    expect(isSupabaseUrl('')).toBe(false);
  });
});

describe('activeViewKey', () => {
  it('builds a per-connection key with the activeView_ prefix', () => {
    expect(activeViewKey('conn-1')).toBe('activeView_conn-1');
    expect(activeViewKey('abc')).toBe(`${KEYS.activeView}abc`);
  });
});

describe('Remaining scalar accessors (round-trip + defaults)', () => {
  it('saved JQLs', () => {
    expect(localConfig.getSavedJqls()).toEqual([]);
    localConfig.saveJqls([{ id: 'j1', name: 'N', query: 'q' }]);
    expect(localConfig.getSavedJqls()).toEqual([{ id: 'j1', name: 'N', query: 'q' }]);
  });

  it('dashboard JQLs', () => {
    expect(localConfig.getDashboardJqls()).toEqual([]);
    localConfig.saveDashboardJqls([{ id: 'd1', name: 'N', query: 'q' }]);
    expect(localConfig.getDashboardJqls()).toHaveLength(1);
  });

  it('etlUpdateOnly', () => {
    expect(localConfig.getEtlUpdateOnly()).toBe(false);
    localConfig.saveEtlUpdateOnly(true);
    expect(localConfig.getEtlUpdateOnly()).toBe(true);
  });

  it('extract dates', () => {
    expect(localConfig.getExtractDates()).toEqual({ dateFrom: '', dateTo: '' });
    localConfig.saveExtractDates({ dateFrom: '2026-01-01', dateTo: '2026-02-01' });
    expect(localConfig.getExtractDates()).toEqual({ dateFrom: '2026-01-01', dateTo: '2026-02-01' });
  });

  it('extract JQL', () => {
    expect(localConfig.getExtractJql()).toBe('');
    localConfig.saveExtractJql('project = X');
    expect(localConfig.getExtractJql()).toBe('project = X');
  });

  it('quick pull days (defaults to 1, not null)', () => {
    expect(localConfig.getQuickPullDays()).toBe(1);
    localConfig.saveQuickPullDays(7);
    expect(localConfig.getQuickPullDays()).toBe(7);
    localConfig.saveQuickPullDays(null);
    expect(localConfig.getQuickPullDays()).toBeNull();
  });

  it('favorite plugins', () => {
    expect(localConfig.getFavoritePlugins()).toEqual([]);
    localConfig.saveFavoritePlugins(['fp1']);
    expect(localConfig.getFavoritePlugins()).toEqual(['fp1']);
  });

  it('collapsed groups', () => {
    expect(localConfig.getCollapsedGroups()).toEqual([]);
    localConfig.saveCollapsedGroups(['g1']);
    expect(localConfig.getCollapsedGroups()).toEqual(['g1']);
  });

  it('widget order', () => {
    expect(localConfig.getWidgetOrder()).toEqual([]);
    localConfig.saveWidgetOrder(['w1', 'w2']);
    expect(localConfig.getWidgetOrder()).toEqual(['w1', 'w2']);
  });

  it('theme (stored as a raw string, not JSON)', () => {
    expect(localConfig.getTheme()).toBe('light');
    localConfig.saveTheme('dark');
    expect(localConfig.getTheme()).toBe('dark');
    expect(localStorage.getItem(KEYS.theme)).toBe('dark'); // not JSON-encoded
  });
});
