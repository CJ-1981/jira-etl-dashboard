/**
 * DemoDataSource — artificial data without any Jira credentials.
 *
 * @MX:NOTE: Wraps the mode's real DataSource and overrides only the three
 * data-bearing operations (extract, loadMasterDataset, calculateKpis); views,
 * plugins, holidays, exports and the rest keep working against their normal
 * backends. KPIs run through the client calculator (same engine as relay
 * mode) over the demo issues — nothing is written to the database, so entering
 * and leaving demo mode has no storage side effects.
 *
 * @MX:REASON: Demo mode is toggled via localConfig.getDemoMode(); the factory
 * in ./index returns this wrapper while the flag is on, so every consumer
 * that goes through the DataSource seam (extract panel, master-dataset query,
 * KPI calculations, per-widget JQL) sees demo data without code changes.
 */

import type {
  CalcParams,
  CalcResult,
  DataSource,
  ExtractParams,
  ExtractResult,
  MasterDatasetData,
} from './types';
import type { StorageConfig } from '@/lib/config/local-store';
import { generateDemoIssues, DEMO_CONNECTION_ID } from './demo-data';
import { calculateKpisClient } from '@/lib/kpi/client-calculator';
import { localConfig } from '@/lib/config/local-store';

export class DemoDataSource implements DataSource {
  private readonly real: DataSource;
  /** Memoized so extract and loadMasterDataset serve the identical array. */
  private cache: MasterDatasetData | null = null;

  constructor(real: DataSource) {
    this.real = real;
  }

  private dataset(): MasterDatasetData {
    if (!this.cache) {
      const issues = generateDemoIssues();
      const dates = issues
        .map(i => i.fields?.created as string | undefined)
        .filter((d): d is string => !!d)
        .sort();
      this.cache = {
        totalExtracted: issues.length,
        issues,
        dateRange: { from: dates[0], to: dates[dates.length - 1] },
        lastUpdated: new Date().toISOString(),
      };
    }
    return this.cache;
  }

  async loadMasterDataset(
    _connectionId: string,
    _opts: { storageConfig?: StorageConfig | null }
  ): Promise<MasterDatasetData | null> {
    return this.dataset();
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    // Honor the requested window on `created` the way a real extraction would,
    // so narrow date ranges don't silently return the whole dataset. With no
    // bounds (or open-ended ones) everything in the window direction is kept.
    const dataset = this.dataset();
    const from = params.dateFrom ? new Date(params.dateFrom).getTime() : NaN;
    const to = params.dateTo ? new Date(params.dateTo).setHours(23, 59, 59, 999) : NaN;
    const issues = (dataset.issues ?? []).filter((issue) => {
      const created = new Date(issue.fields?.created).getTime();
      if (Number.isNaN(created)) return false;
      if (!Number.isNaN(from) && created < from) return false;
      if (!Number.isNaN(to) && created > to) return false;
      return true;
    });

    return {
      etlRunId: `demo-${Date.now()}`,
      summary: {
        totalExtracted: issues.length,
        added: issues.length,
        updated: 0,
        unchanged: 0,
        deleted: 0,
        jql: params.jql || `project = "${DEMO_CONNECTION_ID.toUpperCase()}" ORDER BY created DESC`,
        timestamp: new Date().toISOString(),
        effectiveDateFrom: params.dateFrom,
        effectiveDateTo: params.dateTo,
      },
      issues,
    };
  }

  async calculateKpis(params: CalcParams): Promise<CalcResult> {
    // Explicit inline issues (per-widget JQL filtering) win; the main KPI
    // query passes none in server builds and falls back to the demo dataset.
    const issues = params.issues ?? this.dataset().issues ?? [];
    const output = calculateKpisClient({
      issues,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      region: params.region,
      globalFilters: params.globalFilters,
      settings: params.settings,
      slaTargets: params.slaTargets,
      customPlugins: localConfig.getKpiPlugins(),
    });
    return { results: output.results, calculatedAt: output.calculatedAt };
  }

  // Everything without demo data (views, plugins, holidays, connection tests,
  // file export) keeps talking to the mode's real backend.
  listPlugins() { return this.real.listPlugins(); }
  getHolidays(year: number, region: string, start?: string, end?: string) {
    return this.real.getHolidays(year, region, start, end);
  }
  listViews(connectionRef: string, storageConfig: StorageConfig | null) {
    return this.real.listViews(connectionRef, storageConfig);
  }
  createView(connectionRef: string, input: Parameters<DataSource['createView']>[1], storageConfig: StorageConfig | null) {
    return this.real.createView(connectionRef, input, storageConfig);
  }
  updateView(viewId: string, patch: Parameters<DataSource['updateView']>[1], storageConfig: StorageConfig | null) {
    return this.real.updateView(viewId, patch, storageConfig);
  }
  deleteView(viewId: string, storageConfig: StorageConfig | null) {
    return this.real.deleteView(viewId, storageConfig);
  }
  setDefaultView(viewId: string, isDefault: boolean, storageConfig: StorageConfig | null) {
    return this.real.setDefaultView(viewId, isDefault, storageConfig);
  }
  listAllViews(storageConfig: StorageConfig | null) {
    return this.real.listAllViews(storageConfig);
  }
  replaceViews(views: Parameters<DataSource['replaceViews']>[0], storageConfig: StorageConfig | null) {
    return this.real.replaceViews(views, storageConfig);
  }
  testConnection(connection: Parameters<DataSource['testConnection']>[0]) {
    return this.real.testConnection(connection);
  }
  deleteConnectionData(connectionId: string) {
    return this.real.deleteConnectionData(connectionId);
  }
  exportKpiFile(params: Parameters<DataSource['exportKpiFile']>[0]) {
    return this.real.exportKpiFile(params);
  }
}
