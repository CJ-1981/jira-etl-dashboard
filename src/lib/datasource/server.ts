/**
 * ServerDataSource — every operation hits the Next.js API routes with the
 * exact request shapes the components used before the DataSource seam was
 * introduced. Server/exe behavior is unchanged.
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
import type { JiraConnection, StorageConfig } from '@/lib/config/local-store';
import type { DashboardView } from '@/types/dashboard';

export class ServerDataSource implements DataSource {
  async loadMasterDataset(
    connectionId: string,
    opts: { storageConfig?: StorageConfig | null }
  ): Promise<MasterDatasetData | null> {
    const res = await fetch(`/api/jira/master/${connectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', storageConfig: opts.storageConfig }),
    });
    const data = await res.json();
    if (res.ok && data?.success && data.data) return data.data as MasterDatasetData;
    return null;
  }

  async extract(params: ExtractParams): Promise<ExtractResult> {
    const { connection, customFields, ...rest } = params;
    const body: Record<string, unknown> = {
      ...rest,
      jiraCredentials: {
        baseUrl: connection.baseUrl,
        email: connection.email,
        apiToken: connection.apiToken,
        projectKeys: connection.projectKeys,
      },
      customFieldIds: customFields.map(f => f.fieldId),
      storyPointsFieldId: customFields.find(f => f.role === 'storyPoints')?.fieldId,
      issueOwnerTeamFieldId: customFields.find(f => f.role === 'issueOwnerTeam')?.fieldId,
    };

    const res = await fetch('/api/jira/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      // Preserve the status on the error so callers keep their tailored toasts.
      throw Object.assign(new Error(data.error || `Extraction failed (${res.status})`), { status: res.status });
    }
    return { etlRunId: data.etlRunId, summary: data.summary, issues: data.issues };
  }

  async calculateKpis(params: CalcParams): Promise<CalcResult> {
    const body = {
      activeConnectionId: params.connectionId,
      connectionId: params.connectionId,
      storageConfig: params.storageConfig,
      // Inline issues must reach the route: it computes from the request body
      // when present and only falls back to the DB dataset otherwise — this is
      // what keeps per-widget JQL filtering working in server mode.
      // (undefined keys are dropped by JSON.stringify, so the main dashboard
      // path — no issues — still hits the DB path exactly as before.)
      issues: params.issues,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      region: params.region,
      globalFilters: params.globalFilters,
      slaTargets: params.slaTargets,
      settings: params.settings,
    };

    // 120s timeout — server-side calculation may be heavy; surface a clear
    // error instead of spinning forever (semantics of the pre-seam hook).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    let res: Response;
    try {
      res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('KPI calculation request timed out after 120 seconds');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      throw new Error(`KPI calculation failed with HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.success && data.results) {
      return { results: data.results, calculatedAt: data.calculatedAt };
    }
    throw new Error(`KPI calculation failed: ${data.error || 'unknown'}`);
  }

  async listPlugins(): Promise<PluginInfo[]> {
    const res = await fetch('/api/kpi/plugins');
    const data = await res.json();
    if (data.success && data.plugins) return data.plugins as PluginInfo[];
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  async getHolidays(year: number, region: string, start?: string, end?: string): Promise<HolidaysResult> {
    const qs = new URLSearchParams({ year: String(year), region });
    if (start) qs.set('start', start);
    if (end) qs.set('end', end);
    const res = await fetch(`/api/holidays?${qs}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch holidays');
    return data as HolidaysResult;
  }

  async listViews(connectionRef: string, storageConfig: StorageConfig | null): Promise<DashboardView[]> {
    const params = new URLSearchParams({
      connectionRef,
      storageConfig: JSON.stringify(storageConfig ?? {}),
    });
    const res = await fetch(`/api/dashboard/views?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch views');
    return data.views as DashboardView[];
  }

  async createView(connectionRef: string, input: ViewInput, storageConfig: StorageConfig | null): Promise<DashboardView> {
    const res = await fetch('/api/dashboard/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionRef, ...input, storageConfig }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create view');
    return data.view as DashboardView;
  }

  async updateView(viewId: string, patch: ViewPatch, storageConfig: StorageConfig | null): Promise<DashboardView> {
    const res = await fetch(`/api/dashboard/views/${viewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, storageConfig }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update view');
    return data.view as DashboardView;
  }

  async deleteView(viewId: string, storageConfig: StorageConfig | null): Promise<void> {
    const res = await fetch(`/api/dashboard/views/${viewId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageConfig }),
    });
    if (!res.ok) throw new Error('Delete failed');
  }

  async setDefaultView(viewId: string, isDefault: boolean, storageConfig: StorageConfig | null): Promise<void> {
    const res = await fetch(`/api/dashboard/views/${viewId}/default`, {
      method: isDefault ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageConfig }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || (isDefault ? 'Failed to set default view' : 'Failed to clear default view'));
    }
  }

  async listAllViews(storageConfig: StorageConfig | null): Promise<DashboardView[]> {
    const params = new URLSearchParams({ storageConfig: JSON.stringify(storageConfig ?? {}) });
    const res = await fetch(`/api/dashboard/views/bulk?${params}`);
    const data = await res.json();
    return data.success ? (data.views as DashboardView[]) : [];
  }

  async replaceViews(views: DashboardView[], storageConfig: StorageConfig | null): Promise<void> {
    const res = await fetch('/api/dashboard/views/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ views, storageConfig }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Views import failed');
  }

  async testConnection(connection: JiraConnection): Promise<TestConnectionResult> {
    const res = await fetch('/api/jira/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: connection.baseUrl,
        email: connection.email,
        apiToken: connection.apiToken,
      }),
    });
    return res.json();
  }

  async deleteConnectionData(connectionId: string): Promise<void> {
    const res = await fetch(`/api/jira/connections/${connectionId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Delete failed');
  }

  async exportKpiFile(params: ExportFileParams): Promise<Blob> {
    const res = await fetch('/api/export/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issues: params.issues,
        holidays: { regions: params.regions },
        dateFrom: params.dateFrom || undefined,
        dateTo: params.dateTo || undefined,
        format: params.format,
      }),
    });
    if (!res.ok) throw new Error('KPI export failed');
    return res.blob();
  }
}
