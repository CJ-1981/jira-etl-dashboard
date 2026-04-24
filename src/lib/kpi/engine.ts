/**
 * KPI Engine with Extension Plugin Architecture
 *
 * Built-in KPI calculators for Jira metrics with German holiday awareness.
 * Supports custom plugins via the KpiPlugin interface.
 */

import { calculateBusinessHours, calculateWorkingDays, isWorkingDay, type GermanState } from '../holidays/german-holidays';
import type { JiraIssue } from '../jira/client';
import { extractTransitions } from '../jira/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KpiContext {
  issues: Array<ReturnType<typeof transformIssueForKpi>>;
  holidays: { regions: GermanState[]; workStartHour: number; workEndHour: number; slaTargetHours?: number };
  period: { start: Date; end: Date };
  dimensions?: Record<string, string>;
}

export interface TransformedIssue {
  key: string;
  summary: string;
  issueType: string;
  priority: string | null;
  status: string;
  statusCategory: string;
  assignee: string;
  reporter: string;
  created: Date;
  updated: Date;
  resolved: Date | null;
  dueDate: Date | null;
  storyPoints: number | null;
  labels: string[];
  components: string[];
  transitions: StatusTransition[];
  timeInStatus: Record<string, number>;
}

export interface StatusTransition {
  fromStatus: string | null;
  toStatus: string;
  author: string;
  occurredAt: Date;
}

export interface KpiPlugin {
  id: string;
  name: string;
  description: string;
  category: 'processing_time' | 'turnaround' | 'throughput' | 'sla' | 'quality' | 'custom';
  unit: string;
  calculate(context: KpiContext): KpiResult[];
}

export interface KpiResult {
  name: string;
  value: number;
  unit: string;
  dimensions?: Record<string, string>;
  details?: Array<{
    label: string;
    value: number;
    unit?: string;
  }>;
}

// ─── Transform ───────────────────────────────────────────────────────────────

function transformIssueForKpi(issue: JiraIssue): TransformedIssue {
  const transitions: StatusTransition[] = [];
  if (issue.changelog?.histories) {
    for (const history of issue.changelog.histories) {
      for (const item of history.items) {
        if (item.field === 'status') {
          transitions.push({
            fromStatus: item.fromString || null,
            toStatus: item.toString || 'Unknown',
            author: history.author?.displayName || 'Unknown',
            occurredAt: new Date(history.created),
          });
        }
      }
    }
  }

  // Calculate time in each status
  const timeInStatus: Record<string, number> = {};
  for (let i = 0; i < transitions.length; i++) {
    const endTime = transitions[i + 1]
      ? transitions[i + 1].occurredAt.getTime()
      : Date.now();
    const durationHours = (endTime - transitions[i].occurredAt.getTime()) / (1000 * 60 * 60);
    const status = transitions[i].toStatus;
    timeInStatus[status] = (timeInStatus[status] || 0) + durationHours;
  }

  return {
    key: issue.key,
    summary: issue.fields?.summary || (issue as any).summary || 'No Summary',
    issueType: issue.fields?.issuetype?.name || (issue as any).issueType || 'Task',
    priority: issue.fields?.priority?.name || (issue as any).priority || null,
    status: issue.fields?.status?.name || (issue as any).status || 'Unknown',
    statusCategory: issue.fields?.status?.statusCategory?.name || (issue as any).statusCategory || 'Unknown',
    assignee: issue.fields?.assignee?.displayName || (issue as any).assignee || 'Unassigned',
    reporter: issue.fields?.reporter?.displayName || (issue as any).reporter || 'Unknown',
    created: new Date(issue.fields?.created || (issue as any).created || Date.now()),
    updated: new Date(issue.fields?.updated || (issue as any).updated || Date.now()),
    resolved: (issue.fields?.resolutiondate || (issue as any).resolved) ? new Date(issue.fields?.resolutiondate || (issue as any).resolved) : null,
    dueDate: (issue.fields?.duedate || (issue as any).dueDate) ? new Date(issue.fields?.duedate || (issue as any).dueDate) : null,
    storyPoints: (issue.fields as any)?.customfield_10002 || (issue as any).storyPoints || null,
    labels: issue.fields?.labels || (issue as any).labels || [],
    components: issue.fields?.components?.map((c) => c.name) || (issue as any).components || [],
    transitions,
    timeInStatus,
  };
}

// ─── Built-in KPI Plugins ────────────────────────────────────────────────────

/**
 * Average Processing Hours (excluding German holidays and non-working hours)
 */
const avgProcessingHoursPlugin: KpiPlugin = {
  id: 'avg_processing_hours',
  name: 'Avg. Processing Hours',
  description: 'Average business hours from creation to resolution, excluding weekends and German holidays.',
  category: 'processing_time',
  unit: 'hours',
  calculate(context) {
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) return [{ name: 'Avg. Processing Hours', value: 0, unit: 'hours' }];

    const totalHours = resolvedIssues.reduce((sum, issue) => {
      return sum + calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
    }, 0);

    const avg = totalHours / resolvedIssues.length;

    return [{
      name: 'Avg. Processing Hours',
      value: Math.round(avg * 100) / 100,
      unit: 'hours',
      details: [
        { label: 'Resolved Tickets', value: resolvedIssues.length, unit: 'tickets' },
        { label: 'Total Business Hours', value: Math.round(totalHours * 100) / 100, unit: 'hours' },
      ],
    }];
  },
};

/**
 * Median Processing Hours
 */
const medianProcessingHoursPlugin: KpiPlugin = {
  id: 'median_processing_hours',
  name: 'Median Processing Hours',
  description: 'Median business hours from creation to resolution, excluding holidays.',
  category: 'processing_time',
  unit: 'hours',
  calculate(context) {
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) return [{ name: 'Median Processing Hours', value: 0, unit: 'hours' }];

    const hours = resolvedIssues.map((issue) =>
      calculateBusinessHours(issue.created, issue.resolved!, context.holidays)
    ).sort((a, b) => a - b);

    const mid = Math.floor(hours.length / 2);
    const median = hours.length % 2 !== 0 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;

    return [{
      name: 'Median Processing Hours',
      value: Math.round(median * 100) / 100,
      unit: 'hours',
    }];
  },
};

/**
 * Time in Status KPI - Business hours spent in each workflow status
 */
const timeInStatusPlugin: KpiPlugin = {
  id: 'time_in_status',
  name: 'Turnaround Time by Status',
  description: 'Average business hours tickets spend in each workflow status.',
  category: 'turnaround',
  unit: 'hours',
  calculate(context) {
    const statusHours: Record<string, { total: number; count: number; issueCount: number }> = {};
    const issuesPerStatus: Record<string, Set<string>> = {};

    for (const issue of context.issues) {
      const seen = new Set<string>();
      for (const transition of issue.transitions) {
        const status = transition.toStatus;
        if (!seen.has(status) || true) { // include all transitions
          const nextTime = issue.transitions[issue.transitions.indexOf(transition) + 1]
            ? issue.transitions[issue.transitions.indexOf(transition) + 1].occurredAt
            : issue.resolved || new Date();

          const hours = calculateBusinessHours(transition.occurredAt, nextTime, context.holidays);
          if (!statusHours[status]) statusHours[status] = { total: 0, count: 0, issueCount: 0 };
          if (!issuesPerStatus[status]) issuesPerStatus[status] = new Set();

          statusHours[status].total += hours;
          statusHours[status].count++;
          if (!seen.has(status)) {
            statusHours[status].issueCount++;
            issuesPerStatus[status].add(issue.key);
          }
          seen.add(status);
        }
      }
    }

    return Object.entries(statusHours).map(([status, data]) => ({
      name: `Time in ${status}`,
      value: Math.round((data.total / Math.max(data.count, 1)) * 100) / 100,
      unit: 'hours',
      dimensions: { status },
      details: [
        { label: 'Total Occurrences', value: data.count },
        { label: 'Unique Issues', value: data.issueCount },
        { label: 'Total Hours', value: Math.round(data.total * 100) / 100 },
        { label: 'Avg Hours per Occurrence', value: Math.round((data.total / Math.max(data.count, 1)) * 100) / 100 },
      ],
    }));
  },
};

/**
 * SLA Compliance - % of tickets resolved within target
 */
const slaCompliancePlugin: KpiPlugin = {
  id: 'sla_compliance',
  name: 'SLA Compliance Rate',
  description: 'Percentage of tickets resolved within the configured SLA target (business hours).',
  category: 'sla',
  unit: '%',
  calculate(context) {
    const slaTargetHours = context.holidays.slaTargetHours || 40; // Use configured target, default to 40
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) return [{ name: 'SLA Compliance Rate', value: 0, unit: '%' }];

    const withinSla = resolvedIssues.filter((issue) => {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
      return hours <= slaTargetHours;
    }).length;

    const rate = (withinSla / resolvedIssues.length) * 100;

    return [{
      name: 'SLA Compliance Rate',
      value: Math.round(rate * 100) / 100,
      unit: '%',
      details: [
        { label: 'Within SLA', value: withinSla, unit: 'tickets' },
        { label: 'Breached SLA', value: resolvedIssues.length - withinSla, unit: 'tickets' },
        { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
      ],
    }];
  },
};

/**
 * Throughput - Tickets created and resolved per period
 */
const throughputPlugin: KpiPlugin = {
  id: 'throughput',
  name: 'Throughput',
  description: 'Number of tickets created and resolved in the analysis period.',
  category: 'throughput',
  unit: 'tickets',
  calculate(context) {
    const created = context.issues.filter((i) =>
      i.created >= context.period.start && i.created <= context.period.end
    ).length;

    const resolved = context.issues.filter((i) =>
      i.resolved && i.resolved >= context.period.start && i.resolved <= context.period.end
    ).length;

    const periodDays = Math.max(
      Math.ceil((context.period.end.getTime() - context.period.start.getTime()) / (1000 * 60 * 60 * 24)),
      1
    );

    return [{
      name: 'Throughput',
      value: resolved,
      unit: 'tickets',
      details: [
        { label: 'Created', value: created, unit: 'tickets' },
        { label: 'Resolved', value: resolved, unit: 'tickets' },
        { label: 'Period', value: periodDays, unit: 'days' },
        { label: 'Avg. Resolved/Day', value: Math.round((resolved / periodDays) * 100) / 100, unit: 'tickets/day' },
      ],
    }];
  },
};

/**
 * Resolution Rate
 */
const resolutionRatePlugin: KpiPlugin = {
  id: 'resolution_rate',
  name: 'Resolution Rate',
  description: 'Percentage of created tickets that have been resolved.',
  category: 'quality',
  unit: '%',
  calculate(context) {
    const total = context.issues.length;
    if (total === 0) return [{ name: 'Resolution Rate', value: 0, unit: '%' }];

    const resolved = context.issues.filter((i) => i.resolved).length;
    const rate = (resolved / total) * 100;

    return [{
      name: 'Resolution Rate',
      value: Math.round(rate * 100) / 100,
      unit: '%',
      details: [
        { label: 'Resolved', value: resolved },
        { label: 'Open', value: total - resolved },
      ],
    }];
  },
};

/**
 * Avg Working Days to Resolution
 */
const avgWorkingDaysPlugin: KpiPlugin = {
  id: 'avg_working_days',
  name: 'Avg. Working Days to Resolution',
  description: 'Average working days from creation to resolution, excluding weekends and German holidays.',
  category: 'processing_time',
  unit: 'days',
  calculate(context) {
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) return [{ name: 'Avg. Working Days', value: 0, unit: 'days' }];

    const totalDays = resolvedIssues.reduce((sum, issue) => {
      return sum + calculateWorkingDays(issue.created, issue.resolved!, context.holidays.regions);
    }, 0);

    return [{
      name: 'Avg. Working Days to Resolution',
      value: Math.round((totalDays / resolvedIssues.length) * 100) / 100,
      unit: 'days',
      details: [
        { label: 'Resolved Tickets', value: resolvedIssues.length },
      ],
    }];
  },
};

/**
 * SLA by Priority - SLA compliance broken down by ticket priority
 */
const slaByPriorityPlugin: KpiPlugin = {
  id: 'sla_by_priority',
  name: 'SLA Compliance by Priority',
  description: 'SLA compliance rate for each priority level.',
  category: 'sla',
  unit: '%',
  calculate(context) {
    const slaTargets: Record<string, number> = {
      'Highest': 8,
      'High': 24,
      'Medium': 40,
      'Low': 80,
      'Lowest': 120,
    };

    const resolvedByPriority: Record<string, { total: number; withinSla: number }> = {};

    for (const issue of context.issues) {
      if (!issue.resolved) continue;
      const priority = issue.priority || 'Unassigned';
      if (!resolvedByPriority[priority]) resolvedByPriority[priority] = { total: 0, withinSla: 0 };
      resolvedByPriority[priority].total++;

      const hours = calculateBusinessHours(issue.created, issue.resolved, context.holidays);
      const target = slaTargets[priority] || 40;
      if (hours <= target) resolvedByPriority[priority].withinSla++;
    }

    return Object.entries(resolvedByPriority).map(([priority, data]) => ({
      name: `SLA: ${priority}`,
      value: Math.round((data.withinSla / data.total) * 10000) / 100,
      unit: '%',
      dimensions: { priority },
      details: [
        { label: 'Target', value: slaTargets[priority] || 40, unit: 'hours' },
        { label: 'Within SLA', value: data.withinSla },
        { label: 'Total', value: data.total },
      ],
    }));
  },
};

/**
 * Reassignment Count - Average number of times a ticket is reassigned
 */
const reassignmentPlugin: KpiPlugin = {
  id: 'reassignment_count',
  name: 'Avg. Reassignments',
  description: 'Average number of times tickets are reassigned (assignee changes).',
  category: 'quality',
  unit: 'reassignments',
  calculate(context) {
    let totalReassignments = 0;
    let issuesWithReassignments = 0;

    for (const issue of context.issues) {
      const rawIssue = issue as unknown as JiraIssue;
      if (!rawIssue.changelog?.histories) continue;

      let reassignments = 0;
      for (const history of rawIssue.changelog.histories) {
        for (const item of history.items) {
          if (item.field === 'assignee' && item.from && item.to) {
            reassignments++;
          }
        }
      }
      if (reassignments > 0) issuesWithReassignments++;
      totalReassignments += reassignments;
    }

    return [{
      name: 'Avg. Reassignments',
      value: context.issues.length > 0
        ? Math.round((totalReassignments / context.issues.length) * 100) / 100
        : 0,
      unit: 'reassignments',
      details: [
        { label: 'Total Reassignments', value: totalReassignments },
        { label: 'Issues with Reassignments', value: issuesWithReassignments },
      ],
    }];
  },
};

// ─── KPI Engine ──────────────────────────────────────────────────────────────

export class KpiEngine {
  private plugins: Map<string, KpiPlugin> = new Map();

  constructor() {
    // Register all built-in plugins
    this.register(avgProcessingHoursPlugin);
    this.register(medianProcessingHoursPlugin);
    this.register(timeInStatusPlugin);
    this.register(slaCompliancePlugin);
    this.register(throughputPlugin);
    this.register(resolutionRatePlugin);
    this.register(avgWorkingDaysPlugin);
    this.register(slaByPriorityPlugin);
    this.register(reassignmentPlugin);
  }

  register(plugin: KpiPlugin) {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string) {
    this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): KpiPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): KpiPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByCategory(category: KpiPlugin['category']): KpiPlugin[] {
    return this.getAllPlugins().filter((p) => p.category === category);
  }

  /**
   * Run a specific KPI calculation
   */
  calculate(
    pluginId: string,
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date }
  ): KpiResult[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`KPI plugin not found: ${pluginId}`);

    const context: KpiContext = {
      issues: issues.map(transformIssueForKpi),
      holidays: {
        regions: holidays.regions,
        workStartHour: holidays.workStartHour || 9,
        workEndHour: holidays.workEndHour || 17,
        slaTargetHours: holidays.slaTargetHours || 40,
      },
      period,
    };

    return plugin.calculate(context);
  }

  /**
   * Run all registered KPI calculations
   */
  calculateAll(
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date }
  ): Record<string, KpiResult[]> {
    const results: Record<string, KpiResult[]> = {};
    for (const [id, plugin] of this.plugins) {
      results[id] = this.calculate(id, issues, holidays, period);
    }
    return results;
  }

  /**
   * Register a custom KPI plugin from JSON definition
   * Used for extension/plugin system
   */
  registerCustomPlugin(definition: {
    id: string;
    name: string;
    description: string;
    category: KpiPlugin['category'];
    unit: string;
    formula: string; // DSL formula
  }) {
    const customPlugin: KpiPlugin = {
      ...definition,
      calculate(context) {
        // Parse and execute the custom formula
        return executeCustomFormula(definition.formula, context, definition);
      },
    };

    this.register(customPlugin);
    return customPlugin;
  }
}

/**
 * Execute custom formula DSL for plugin extensions
 */
function executeCustomFormula(
  formula: string,
  context: KpiContext,
  definition: { id: string; name: string; unit: string }
): KpiResult[] {
  const issues = context.issues;

  try {
    // Simple formula parser supporting:
    // - COUNT(issues where <condition>)
    // - AVG(<field>) where <condition>
    // - SUM(<field>) where <condition>
    // - PERCENTAGE(<condition1>) of <condition2>

    const match = formula.match(/^(\w+)\((.+)\)$/i);
    if (!match) {
      return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Error', value: 0 }] }];
    }

    const func = match[1].toUpperCase();
    const args = match[2];

    let value = 0;

    switch (func) {
      case 'COUNT': {
        const filtered = applyFilter(issues, args);
        value = filtered.length;
        break;
      }
      case 'AVG': {
        const [field, whereClause] = args.split(' WHERE ');
        const filtered = whereClause ? applyFilter(issues, whereClause) : issues;
        if (filtered.length === 0) { value = 0; break; }
        const sum = filtered.reduce((acc, issue) => {
          return acc + (getFieldValue(issue, field.trim()) || 0);
        }, 0);
        value = Math.round((sum / filtered.length) * 100) / 100;
        break;
      }
      case 'SUM': {
        const [field, whereClause] = args.split(' WHERE ');
        const filtered = whereClause ? applyFilter(issues, whereClause) : issues;
        value = filtered.reduce((acc, issue) => {
          return acc + (getFieldValue(issue, field.trim()) || 0);
        }, 0);
        value = Math.round(value * 100) / 100;
        break;
      }
      case 'PERCENTAGE': {
        const parts = args.split(' OF ');
        const numerator = applyFilter(issues, parts[0]).length;
        const denominator = applyFilter(issues, parts[1] || 'true').length;
        value = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
        break;
      }
      default:
        return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Unknown Function', value: 0 }] }];
    }

    return [{ name: definition.name, value, unit: definition.unit }];
  } catch {
    return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Parse Error', value: 0 }] }];
  }
}

function applyFilter(issues: KpiContext['issues'], condition: string): KpiContext['issues'] {
  const trimmed = condition.trim();

  if (trimmed === 'true' || trimmed === '*') return issues;

  // Parse simple conditions like: status = "Done", resolved = true
  const eqMatch = trimmed.match(/^(\w+)\s*=\s*"?([^"]+)"?$/);
  if (eqMatch) {
    const [, field, val] = eqMatch;
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      if (val === 'true') return !!fieldValue;
      if (val === 'false') return !fieldValue;
      return String(fieldValue).toLowerCase() === val.toLowerCase();
    });
  }

  const neqMatch = trimmed.match(/^(\w+)\s*!=\s*"?([^"]+)"?$/);
  if (neqMatch) {
    const [, field, val] = neqMatch;
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      return String(fieldValue).toLowerCase() !== val.toLowerCase();
    });
  }

  return issues;
}

function getFieldValue(issue: TransformedIssue, field: string): unknown {
  const fieldMap: Record<string, () => unknown> = {
    storyPoints: () => issue.storyPoints,
    priority: () => issue.priority,
    status: () => issue.status,
    issueType: () => issue.issueType,
    assignee: () => issue.assignee,
    resolved: () => issue.resolved,
    key: () => issue.key,
  };

  // Check timeInStatus for dynamic fields
  if (field.startsWith('timeInStatus.')) {
    const statusName = field.replace('timeInStatus.', '');
    return issue.timeInStatus[statusName] || 0;
  }

  const getter = fieldMap[field];
  return getter ? getter() : null;
}

// Singleton engine instance
let engineInstance: KpiEngine | null = null;

export function getKpiEngine(): KpiEngine {
  if (!engineInstance) {
    engineInstance = new KpiEngine();
  }
  return engineInstance;
}
