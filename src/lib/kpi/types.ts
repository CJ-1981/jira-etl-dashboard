/**
 * KPI Plugin Type Definitions
 * @MX:ANCHOR: Core type system for KPI plugin architecture
 * @MX:REASON: Defines the plugin interface that all KPI plugins must implement
 */

import type { GermanState } from '../holidays/german-holidays';
import type { JiraIssue } from '../jira/client';

// ─── KPI Issue Input Shapes ───────────────────────────────────────────────────
/**
 * @MX:ANCHOR: KPI issue input union
 * @MX:REASON: transformIssueForKpi historically accepted two shapes and relied
 * on `as any` fallback chains to read them. This union makes both shapes
 * explicit so the transform can be written with zero `as any` casts.
 */

/**
 * Flat, normalized issue representation (e.g. webhook/master-derived data that
 * has already been flattened to top-level scalar fields). Discriminated from a
 * real Jira issue via the `'fields' in issue` check: flat issues carry their
 * data at the top level and have no `fields` object.
 */
export interface FlatIssue {
  key: string;
  summary?: string;
  issueType?: string;
  priority?: string | null;
  status?: string;
  statusCategory?: string;
  assignee?: string;
  reporter?: string;
  issueOwnerTeam?: string | null;
  /** ISO-8601 date string */
  created?: string;
  /** ISO-8601 date string */
  updated?: string;
  /** ISO-8601 date string */
  resolved?: string | null;
  /** ISO-8601 date string */
  dueDate?: string | null;
  storyPoints?: number | null;
  labels?: string[];
  /** Component names (already flattened, unlike JiraIssue's `{ name }[]`) */
  components?: string[];
  /** Raw changelog, same structure as on a Jira issue when present */
  changelog?: JiraIssue['changelog'];
}

/**
 * Jira issue as consumed by the KPI transform. Structurally identical to the
 * client's JiraIssue, plus the extra `fields` properties that real Jira
 * payloads carry but the minimal client type does not declare (`project`,
 * `comment`, a named `issueOwnerTeam`, and arbitrary `customfield_*` IDs used
 * for dynamic field lookup). Every addition is optional, so any value typed as
 * the client JiraIssue is directly assignable to this shape.
 */
export interface KpiJiraIssue extends Omit<JiraIssue, 'fields'> {
  fields: JiraIssue['fields'] & {
    project?: { name?: string; key?: string };
    comment?: {
      comments?: Array<{
        author?: { displayName?: string };
        created: string | number | Date;
      }>;
    };
    issueOwnerTeam?: unknown;
    [customFieldId: string]: unknown;
  };
}

/**
 * Explicit union of the two issue shapes accepted by transformIssueForKpi.
 * Use `'fields' in issue` to discriminate: `true` -> KpiJiraIssue, `false` -> FlatIssue.
 */
export type KpiIssueInput = KpiJiraIssue | FlatIssue;

/**
 * Domain categories for KPI plugins
 * Hierarchical organization matching business metrics taxonomy
 */
export type KpiDomain =
  | 'processing-time'
  | 'turnaround'
  | 'throughput'
  | 'sla'
  | 'quality'
  | 'assignee'
  | 'custom';

/**
 * Plugin category indicating source and lifecycle
 * - builtin: Core plugins distributed with the application
 * - custom: User-defined plugins in the custom directory
 * - time-series: Specialized plugins for time-based aggregations
 */
export type KpiCategory = 'builtin' | 'custom' | 'time-series';

/**
 * Result structure returned by plugin calculate functions
 * Standardized format for UI consumption and API responses
 * @MX:ANCHOR: Result contract - defines plugin output structure
 * @MX:REASON: Ensures consistent downstream processing and display
 */
export interface KpiResult {
  /** Display name for this metric value */
  name: string;

  /** Numeric value of the metric */
  value: number;

  /** Unit of measurement (hours, days, count, percentage, etc.) */
  unit: string;

  /** Optional dimension values for multi-dimensional metrics */
  dimensions?: Record<string, string>;

  /** Optional breakdown of contributing factors */
  details?: Array<{
    label: string;
    value: number;
    unit?: string;
  }>;

  /** Optional list of ticket keys contributing to this result */
  ticketKeys?: string[];

  /** Optional time series data for trend analysis */
  timeSeries?: TimeSeriesDataPoint[];

  /** Optional per-result SLA target (hours) used to render reference lines */
  slaTargetHours?: number;

  /** Optional comparison with previous period */
  comparison?: {
    value: number;
    change: number;
    label: string;
  };
}

/**
 * Data point for time-series visualizations
 */
export interface TimeSeriesDataPoint {
  period: string;
  /**
   * Period end date.
   * @MX:WARN: Typed `Date | string` because KPI results cross a JSON
   * serialization boundary (API responses / storage): after a round-trip a
   * `Date` arrives as an ISO-8601 string. Consumers must never call Date
   * methods on this field directly — normalize first, e.g.
   * `new Date(point.date).getTime()`.
   * @MX:REASON: Prevents the "type lie" where the static type promised Date
   * but runtime values were strings, crashing `.getTime()` callers.
   */
  date: Date | string;
  value: number;
  count: number;
  isComplete?: boolean;
}

/**
 * Supported time intervals for aggregation
 */
export type TimeInterval = 'daily' | 'weekly' | 'monthly';

/**
 * Standard age categories for ticket freshness and backlog distribution analysis
 * @MX:ANCHOR: Age category taxonomy
 * @MX:REASON: Standardizes age buckets across open and closed ticket plugins
 */
export type AgeCategory = 'this_week' | 'last_week' | 'existing';

/**
 * Core plugin interface that all KPI calculators must implement
 * @MX:ANCHOR: Plugin contract - all plugins must implement this interface
 * @MX:REASON: Ensures type safety and consistent API across all plugins
 */
export interface KpiPlugin<T = KpiResult | KpiResult[]> {
  /** Unique identifier for the plugin (e.g., 'avg-processing-hours') */
  id: string;

  /** Human-readable name for display in UI */
  name: string;

  /** Category indicating plugin source and lifecycle */
  category: KpiCategory;

  /** Business domain this plugin belongs to */
  domain: KpiDomain;

  /** Semantic version for plugin evolution tracking */
  version: string;

  /** Plugin type: builtin, custom, or time-series */
  pluginType?: 'builtin' | 'custom' | 'time-series';

  /** Whether the plugin is currently active */
  isActive?: boolean;

  /** Whether the plugin is marked as favorite by the user */
  isFavorite?: boolean;

  /** Visualization type hint for UI rendering */
  visualization?: 'card' | 'horizontal_bar' | 'pie' | 'line' | 'list';

  /** Unit of measurement for the calculated value */
  unit: string;

  /** Optional time interval for time-series plugins */
  timeInterval?: TimeInterval;

  /** Detailed description of what the plugin calculates */
  description?: string;

  /**
   * Calculation function that transforms issue data into KPI metrics
   * @param context - Execution context with issues, holidays, and configuration
   * @returns Single KPI result or array of results (for multi-value metrics)
   */
  calculate: (context: KpiContext) => T;

  /**
   * Optional list of plugin IDs this plugin depends on
   * Used for topological sorting and dependency resolution
   */
  dependencies?: string[];

  /** Optional metadata for documentation and discovery */
  metadata?: PluginMetadata;
}

/**
 * Extended metadata about a plugin for documentation and UI display
 */
export interface PluginMetadata {
  /** Detailed description of what the plugin calculates */
  description?: string;

  /** Plugin author or team */
  author?: string;

  /** Searchable tags for categorization */
  tags?: string[];

  /** Example usage scenarios or expected outputs */
  examples?: unknown[];
}

/**
 * Execution context passed to plugin calculate functions
 * Contains all data needed for KPI calculation
 * @MX:ANCHOR: Context contract - defines available data for calculations
 * @MX:REASON: Ensures all plugins have consistent access to required data
 */
export interface KpiContext {
  /** Transformed issue data from Jira API */
  issues: TransformedIssue[];

  /** Holiday calendar for working day calculations */
  holidays: HolidayContext;

  /** Time period for this KPI calculation */
  period: {
    start: Date;
    end: Date;
  };

  /** Optional SLA target mappings (priority/field -> hours) */
  slaTargets?: Record<string, number>;

  /** Flag to include "Anyone" comments in SLA calculations */
  useAnyoneCommentsForSla?: boolean;

  /** Optional dimension values for grouping/filtering */
  dimensions?: Record<string, string>;

  /** Optional filters applied at calculation time */
  globalFilters?: Record<string, string[]>;
}

/**
 * Transformed issue structure from Jira API
 * Existing type maintained for backward compatibility
 */
export interface TransformedIssue {
  key: string;
  project: string;
  summary: string;
  issueType: string;
  priority: string | null;
  status: string;
  statusCategory: string;
  assignee: string;
  reporter: string;
  issueOwnerTeam: string | null;
  created: Date;
  updated: Date;
  resolved: Date | null;
  dueDate: Date | null;
  storyPoints: number | null;
  labels: string[];
  components: string[];
  transitions: StatusTransition[];
  timeInStatus: Record<string, number>;
  comments: Array<{ author: string; created: Date }>;
  /** Raw Jira changelog (present when the source issue carries one; read by e.g. reassignment_count). */
  changelog?: {
    histories: Array<{
      id?: string;
      author?: { displayName: string };
      created?: string;
      items: Array<{ field: string; from: string | null; to: string | null }>;
    }>;
  };
}

/**
 * Status transition record from Jira changelog
 */
export interface StatusTransition {
  fromStatus: string | null;
  toStatus: string;
  author: string;
  occurredAt: Date;
}

/**
 * Holiday calendar context for working day calculations
 * Existing type maintained for backward compatibility
 */
export interface HolidayContext {
  dates: Set<string>;
  regions: GermanState[];
  workStartHour: number;
  workEndHour: number;
  workDaysPerWeek?: number[];
  slaTargetHours?: number;
  isHoliday: (date: Date) => boolean;
  isWorkingDay: (date: Date) => boolean;
}
