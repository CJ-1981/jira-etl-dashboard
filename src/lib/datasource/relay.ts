/**
 * RelayDataSource — backs the static GitHub Pages build.
 *
 * Data comes from the local Python relay (jira_relay.py): POST /sync runs the
 * Jira pull + SQLite upsert, GET /dataset serves the master dataset. KPI
 * calculation, plugin listing, holidays, and file export run client-side with
 * the same pure modules the server routes use. Dashboard views persist in
 * localStorage.
 */

import type {
  CalcParams,
  CalcResult,
  DataSource,
  ExportFileParams,
  ExtractParams,
  ExtractResult,
  HolidaysResult,
  MasterDatasetData,
  PluginInfo,
  TestConnectionResult,
  ViewInput,
  ViewPatch,
} from './types';
import { calculateKpisClient } from '@/lib/kpi/client-calculator';
import { KpiEngine } from '@/lib/kpi/engine';
import { localConfig, type JiraConnection, type StorageConfig } from '@/lib/config/local-store';
import type { DashboardView } from '@/types/dashboard';
import {
  GERMAN_STATES,
  getGermanHolidays,
  getHolidaysInRange,
  type GermanState,
} from '@/lib/holidays/german-holidays';

function relayUrl(): string {
  return localConfig.getRelayUrl().replace(/\/+$/, '');
}

async function relayFetch(path: string, init?: RequestInit) {
  return fetch(`${relayUrl()}${path}`, init);
}

function newId(): string {
  return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// CSV injection guard — same rule as the server export route.
function sanitizeCsvCell(value: unknown): string {
  if (typeof value === 'number') return String(value);
  const str = value == null ? '' : String(value);
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

export class RelayDataSource implements DataSource {
  async loadMasterDataset(
    connectionId: string,
    _opts: { storageConfig?: StorageConfig | null }
  ): Promise<MasterDatasetData | null> {
    const res = await relayFetch(`/dataset?connection=${encodeURIComponent(connectionId)}`);
    const data = await res.json();
    if (res.ok && data?.success && data.data) {
      return {
        totalExtracted: data.data.totalExtracted ?? 0,
        issues: data.data.issues ?? [],
        dateRange: data.data.dateRange ?? undefined,
        lastUpdated: data.data.lastUpdated ?? new Date().toISOString(),
      };
    }
    return null;
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    const { connection, customFields, rateLimit, ...rest } = params;
    const res = await relayFetch('/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        projectKeys: connection.projectKeys,
        customFieldIds: customFields.map(f => f.fieldId),
        storyPointsFieldId: customFields.find(f => f.role === 'storyPoints')?.fieldId,
        issueOwnerTeamFieldId: customFields.find(f => f.role === 'issueOwnerTeam')?.fieldId,
        batchSize: rateLimit?.batchSize,
        delayMs: rateLimit?.delayMs,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw Object.assign(new Error(data.error || `Relay sync failed (${res.status})`), { status: res.status });
    }

    // The preview list is the freshly synced dataset (localhost + gzip, so the
    // second hop is cheap and keeps the ticket list identical to server mode).
    const dataset = await this.loadMasterDataset(params.connectionRef, {});
    return {
      etlRunId: 'relay-sync',
      summary: data.summary,
      issues: dataset?.issues ?? [],
    };
  }

  async calculateKpis(params: CalcParams): Promise<CalcResult> {
    if (!params.issues || !Array.isArray(params.issues)) {
      throw new Error('Relay mode requires inline issues (dataset not loaded yet)');
    }
    const output = calculateKpisClient({
      issues: params.issues,
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

  async listPlugins(): Promise<PluginInfo[]> {
    const engine = new KpiEngine();
    return engine.getAllPlugins().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      category: p.category,
      domain: p.domain,
      unit: p.unit,
      pluginType: 'builtin' as const,
      isActive: true,
    }));
  }

  async getHolidays(year: number, region: string, start?: string, end?: string): Promise<HolidaysResult> {
    // Port of GET /api/holidays — the holiday module is pure TypeScript.
    let allHolidays;
    if (start && end) {
      const regions: GermanState[] = region === 'all'
        ? Object.values(GERMAN_STATES)
        : [region as GermanState];
      allHolidays = getHolidaysInRange(new Date(start), new Date(end), regions);
    } else {
      allHolidays = getGermanHolidays(year);
    }

    const filteredHolidays = allHolidays.filter((h) => {
      if (h.isNational) return true;
      if (region === 'all') return true;
      return h.regions.includes(region as GermanState);
    });

    return {
      year,
      region,
      holidays: filteredHolidays.map((h) => ({
        date: h.date.toLocaleDateString('en-CA'),
        name: h.nameEn,
        nameLocal: h.name,
        isNational: h.isNational,
        regions: h.regions,
      })),
      states: Object.entries(GERMAN_STATES).map(([key, value]) => ({ key, code: value })),
    };
  }

  // ── Dashboard views: localStorage-backed ─────────────────────────────────

  private readViews(): DashboardView[] {
    return (localConfig.getDashboardViews() as DashboardView[]) ?? [];
  }

  private writeViews(views: DashboardView[]): void {
    localConfig.saveDashboardViews(views as unknown[]);
  }

  async listViews(connectionRef: string): Promise<DashboardView[]> {
    return this.readViews().filter(v => v.connectionRef === connectionRef);
  }

  async createView(connectionRef: string, input: ViewInput): Promise<DashboardView> {
    const now = new Date().toISOString();
    const view: DashboardView = {
      id: newId(),
      name: input.name,
      connectionRef,
      data: input.data,
      isDefault: input.isDefault ?? false,
      autoSaveEnabled: input.autoSaveEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.writeViews([view, ...this.readViews()]);
    return view;
  }

  async updateView(viewId: string, patch: ViewPatch): Promise<DashboardView> {
    const views = this.readViews();
    const idx = views.findIndex(v => v.id === viewId);
    if (idx === -1) throw new Error('View not found');
    views[idx] = { ...views[idx], ...patch, updatedAt: new Date().toISOString() };
    this.writeViews(views);
    return views[idx];
  }

  async deleteView(viewId: string): Promise<void> {
    this.writeViews(this.readViews().filter(v => v.id !== viewId));
  }

  async setDefaultView(viewId: string, isDefault: boolean): Promise<void> {
    const views = this.readViews();
    // Exactly one default per connection, mirroring the DB route semantics.
    const target = views.find(v => v.id === viewId);
    this.writeViews(views.map(v =>
      v.connectionRef === (target?.connectionRef ?? v.connectionRef)
        ? { ...v, isDefault: isDefault ? v.id === viewId : false }
        : v
    ));
  }

  async listAllViews(): Promise<DashboardView[]> {
    return this.readViews();
  }

  async replaceViews(views: DashboardView[]): Promise<void> {
    // Config import: keep provided ids stable, regenerate missing ones.
    this.writeViews(views.map(v => ({ ...v, id: v.id || newId() })));
  }

  // ── Connection test + export ─────────────────────────────────────────────

  async deleteConnectionData(connectionId: string): Promise<void> {
    const res = await relayFetch(`/dataset?connection=${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Relay dataset delete failed (${res.status})`);
    }
  }

  async testConnection(_connection: JiraConnection): Promise<TestConnectionResult> {
    try {
      const res = await relayFetch('/health');
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          userName: 'relay',
          baseUrl: data.jira?.baseUrl,
        };
      }
      return { success: false, error: data.error || 'Relay reported an error' };
    } catch {
      return {
        success: false,
        error: `Relay unreachable at ${relayUrl()} — is jira_relay.py running, and does its ALLOWED_ORIGIN include this page's origin?`,
      };
    }
  }

  async exportKpiFile(params: ExportFileParams): Promise<Blob> {
    // Port of POST /api/export/file — engine + CSV assembly client-side.
    const engine = new KpiEngine();
    const end = params.dateTo ? new Date(params.dateTo) : new Date();
    const DEFAULT_LOOKBACK_DAYS = 90;
    const start = params.dateFrom
      ? new Date(params.dateFrom)
      : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    if (params.dateTo && params.dateTo.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }
    const regions = params.regions || [];
    const allResults = engine.calculateAll(params.issues, { regions: regions as GermanState[] }, { start, end });

    if (params.format === 'json') {
      return new Blob([JSON.stringify(allResults, null, 2)], { type: 'application/json' });
    }

    const rows: string[] = [
      'kpi_id,kpi_name,value,unit,calculated_at,period_start,period_end,region,priority,status,is_detail',
    ];
    for (const [pluginId, results] of Object.entries(allResults)) {
      for (const result of results) {
        const dims = result.dimensions || {};
        rows.push(
          [
            sanitizeCsvCell(pluginId),
            `"${sanitizeCsvCell(result.name)}"`,
            result.value,
            sanitizeCsvCell(result.unit),
            sanitizeCsvCell(new Date().toISOString()),
            sanitizeCsvCell(start.toISOString()),
            sanitizeCsvCell(end.toISOString()),
            sanitizeCsvCell(regions.join(',')),
            sanitizeCsvCell(dims.priority || ''),
            sanitizeCsvCell(dims.status || ''),
            'false',
          ].join(',')
        );
        if (result.details) {
          for (const detail of result.details) {
            rows.push(
              [
                sanitizeCsvCell(pluginId),
                `"${sanitizeCsvCell(result.name)} - ${sanitizeCsvCell(detail.label)}"`,
                detail.value,
                sanitizeCsvCell(detail.unit || result.unit),
                sanitizeCsvCell(new Date().toISOString()),
                sanitizeCsvCell(start.toISOString()),
                sanitizeCsvCell(end.toISOString()),
                sanitizeCsvCell(regions.join(',')),
                '',
                '',
                'true',
              ].join(',')
            );
          }
        }
      }
    }
    return new Blob([rows.join('\n')], { type: 'text/csv' });
  }
}
