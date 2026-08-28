/**
 * DataSource seam — the dual-mode contract.
 *
 * @MX:NOTE: Every data operation that BOTH build modes support goes through
 * this interface. ServerDataSource keeps the exact fetch calls the app used
 * before the seam existed (server/exe behavior unchanged); RelayDataSource
 * backs the same operations with the local Python relay (jira_relay.py) plus
 * client-side computation for the static GitHub Pages build.
 *
 * Server-only features (polling scheduler, PG export, storage panel, custom
 * plugin file CRUD, webhook) stay as direct fetches and are hidden in relay
 * mode via runtimeFeatures — they deliberately have no place here.
 */

import type {
  AppSettings,
  CustomExtractField,
  JiraConnection,
  KpiPlugin,
  StorageConfig,
} from '@/lib/config/local-store';
import type { KpiCalcResult, DashboardView } from '@/types/dashboard';

/** The master-dataset payload shared by both modes (moved from useMasterDatasetQuery). */
export interface MasterDatasetData {
  totalExtracted: number;
  dateRange?: { from: string; to: string };
  lastUpdated: string;
  // Full Jira issue objects (rawData incl. changelog in relay mode).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issues?: any[];
}

export interface ExtractParams {
  connectionRef: string;
  connection: Pick<JiraConnection, 'baseUrl' | 'email' | 'apiToken' | 'projectKeys'>;
  rateLimit?: AppSettings['rateLimit'];
  generalSettings?: AppSettings['general'];
  customPlugins: KpiPlugin[];
  jql?: string;
  dateFrom?: string;
  dateTo?: string;
  daysBack?: number;
  saveExtraction: boolean;
  updateOnly: boolean;
  customFields: CustomExtractField[];
  storageConfig: StorageConfig | null;
}

export interface ExtractSummary {
  totalExtracted: number;
  added: number;
  updated: number;
  unchanged: number;
  deleted: number;
  jql: string;
  timestamp: string;
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
}

export interface ExtractResult {
  etlRunId: string;
  summary: ExtractSummary;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issues: any[];
}

export interface CalcParams {
  connectionId: string;
  storageConfig: StorageConfig | null;
  dateFrom?: string;
  dateTo?: string;
  region?: string;
  globalFilters?: Record<string, unknown>;
  settings?: AppSettings | null;
  slaTargets?: Record<string, number>;
  /** Relay mode: issues to calculate against (from the in-memory dataset or widget JQL filter). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issues?: any[];
}

export interface CalcResult {
  results: KpiCalcResult[];
  calculatedAt: string;
}

/** Plugin metadata shape returned by GET /api/kpi/plugins. */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  domain?: string;
  unit: string;
  pluginType: 'builtin';
  isActive: boolean;
}

export interface HolidayEntry {
  date: string;
  name: string;
  nameLocal: string;
  isNational: boolean;
  regions: string[];
}

export interface HolidaysResult {
  year: number;
  region: string;
  holidays: HolidayEntry[];
  states: Array<{ key: string; code: string }>;
}

export interface ViewInput {
  name: string;
  data: string;
  isDefault?: boolean;
  autoSaveEnabled?: boolean;
}

export interface ViewPatch {
  name?: string;
  data?: string;
  autoSaveEnabled?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  userName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ExportFileParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issues: any[];
  regions: string[];
  dateFrom?: string;
  dateTo?: string;
  format: string;
}

export interface DataSource {
  /** Restore the persisted master dataset for a connection. */
  loadMasterDataset(
    connectionId: string,
    opts: { storageConfig?: StorageConfig | null }
  ): Promise<MasterDatasetData | null>;

  /** Run a Jira extraction / relay sync and return the fresh dataset preview. */
  extract(params: ExtractParams): Promise<ExtractResult>;

  /** KPI calculation (server engine, or client-side in relay mode). */
  calculateKpis(params: CalcParams): Promise<CalcResult>;

  /** Built-in plugin registry (server engine, or client engine in relay mode). */
  listPlugins(): Promise<PluginInfo[]>;

  /** German holidays for the Holidays panel. */
  getHolidays(year: number, region: string, start?: string, end?: string): Promise<HolidaysResult>;

  /** Saved dashboard views (database in server mode, localStorage in relay mode). */
  listViews(connectionRef: string, storageConfig: StorageConfig | null): Promise<DashboardView[]>;
  createView(connectionRef: string, input: ViewInput, storageConfig: StorageConfig | null): Promise<DashboardView>;
  updateView(viewId: string, patch: ViewPatch, storageConfig: StorageConfig | null): Promise<DashboardView>;
  deleteView(viewId: string, storageConfig: StorageConfig | null): Promise<void>;
  setDefaultView(viewId: string, isDefault: boolean, storageConfig: StorageConfig | null): Promise<void>;
  /** All views (for config export) and bulk replace (for config import). */
  listAllViews(storageConfig: StorageConfig | null): Promise<DashboardView[]>;
  replaceViews(views: DashboardView[], storageConfig: StorageConfig | null): Promise<void>;

  /** Connection test (server: /api/jira/test; relay: health probe). */
  testConnection(connection: JiraConnection): Promise<TestConnectionResult>;

  /** Delete a connection's persisted extraction data (DB cascade / relay dataset). */
  deleteConnectionData(connectionId: string): Promise<void>;

  /** KPI file export as a downloadable blob. */
  exportKpiFile(params: ExportFileParams): Promise<Blob>;
}
