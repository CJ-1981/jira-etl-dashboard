export type { JiraConnection, PgConnection, AppSettings, StorageConfig } from "@/lib/config/local-store";

export interface ExtractedIssue {
  key: string;
  summary: string;
  issueType: string;
  priority?: string;
  status: string;
  assignee?: string;
  reporter?: string;
  created: string;
  updated: string;
  resolved?: string;
  dueDate?: string;
  storyPoints?: number;
  labels?: string[];
  components?: string[];
  changelog?: {
    histories: Array<{
      items: Array<{ field: string; fromString?: string; toString?: string }>;
      created: string;
    }>;
  };
}

export interface KpiCalcResult {
  pluginId: string;
  results: Array<{
    name: string;
    value: number;
    unit: string;
    dimensions?: Record<string, string>;
    details?: Array<{ label: string; value: number | string; unit?: string }>;
    ticketKeys?: string[];
    comparison?: { value: number; change: number; label: string };
    timeSeries?: Array<{ period: string; value: number; isComplete?: boolean }>;
  }>;
}

export interface ChartConfig {
  id: string;
  kpiId: string;
  type: 'bar' | 'line' | 'pie' | 'area';
  width: 'sm' | 'md' | 'lg' | 'full';
  height: 'short' | 'md' | 'tall' | 'xtall';
  jqlFilter: JqlFilter;
  // @MX:NOTE: User-editable title persisted per saved view
  customTitle?: string;
  // @MX:NOTE: Expanded state persisted per widget
  expanded?: boolean;
}

export interface JqlFilter {
  enabled: boolean;
  query: string;
  mode: 'override' | 'refine';
}

export interface KpiCardConfig {
  pluginId: string;
  resultName: string;
  jqlFilter: JqlFilter;
}

export interface PollingStatus {
  enabled: boolean;
  connectionId: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  status: string;
  lastError: string | null;
}

export interface DashboardView {
  id: string;
  name: string;
  connectionRef: string;
  data: string; // JSON string
  isDefault: boolean;
  autoSaveEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardViewState {
  dateFrom: string;
  dateTo: string;
  globalFilters: Record<string, string[]>;
  charts: ChartConfig[];
  dashboardJqlQuery: string;
  kpiCardConfigs: KpiCardConfig[];
  region: string;
  hiddenDimensions: string[];
  widgetTitles: Record<string, string>;
  collapsedWidgets?: string[];
  widgetHeights?: Record<string, number>;
}
