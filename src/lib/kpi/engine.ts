/**
 * KPI Engine with Extension Plugin Architecture
 *
 * Built-in KPI calculators for Jira metrics with German holiday awareness.
 * Supports custom plugins via the KpiPlugin interface.
 */

import { calculateBusinessHours, calculateWorkingDays, type GermanState } from '../holidays/german-holidays';
import type { JiraIssue } from '../jira/client';
import { registerTimeSeriesPlugins } from './time-series-plugin';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KpiContext {
  issues: TransformedIssue[];
  holidays: { regions: GermanState[]; workStartHour: number; workEndHour: number; slaTargetHours?: number };
  period: { start: Date; end: Date };
  slaTargets?: Record<string, number>;
  dimensions?: Record<string, string>;
  globalFilters?: Record<string, string[]>; // New: Active filters from UI
}

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
  category: 'processing_time' | 'turnaround' | 'throughput' | 'sla' | 'quality' | 'assignee' | 'custom';
  unit: string;
  pluginType?: 'builtin' | 'custom';
  isActive?: boolean;
  visualization?: 'card' | 'horizontal_bar' | 'pie' | 'line';
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
  ticketKeys?: string[]; // New: List of tickets that make up this metric
  comparison?: {         // New: Comparison data for deltas
    value: number;
    change: number;
    label: string;
  };
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

  // Sort transitions chronologically (Jira returns changelog in reverse order)
  transitions.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

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
    project: (issue.fields as any)?.project?.name || (issue.fields as any)?.project?.key || issue.key.split('-')[0],
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
    comments: ((issue.fields as any)?.comment?.comments || [])
      .map((c: any) => ({
        author: c.author?.displayName || 'Unknown',
        created: new Date(c.created),
      }))
      .sort((a: { created: Date }, b: { created: Date }) => a.created.getTime() - b.created.getTime()),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Robust check if an issue is considered "Done" or "Resolved"
 */
export function isIssueDone(issue: TransformedIssue): boolean {
  if (issue.resolved) return true;
  const status = (issue.status || '').toLowerCase();
  const category = (issue.statusCategory || '').toLowerCase();
  return category === 'done' || ['done', 'closed', 'resolved', 'completed', 'close'].includes(status);
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
      ticketKeys: resolvedIssues.map(i => i.key),
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
      ticketKeys: resolvedIssues.map(i => i.key),
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

      // Account for the initial status before any changelog entry.
      // Jira doesn't record the creation-to-first-transition as a changelog item,
      // so the ticket's initial status (e.g. "Distribution") is missed unless we
      // measure from issue.created to the first transition's occurredAt.
      if (issue.transitions.length > 0) {
        const firstTransition = issue.transitions[0];
        const initialStatus = firstTransition.fromStatus;
        if (initialStatus) {
          const hours = calculateBusinessHours(issue.created, firstTransition.occurredAt, context.holidays);
          if (!statusHours[initialStatus]) statusHours[initialStatus] = { total: 0, count: 0, issueCount: 0 };
          if (!issuesPerStatus[initialStatus]) issuesPerStatus[initialStatus] = new Set();
          statusHours[initialStatus].total += hours;
          statusHours[initialStatus].count++;
          statusHours[initialStatus].issueCount++;
          issuesPerStatus[initialStatus].add(issue.key);
          seen.add(initialStatus);
        }
      }

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

    // Filter out transient statuses (average under 1 minute)
    const MIN_STATUS_HOURS = 1 / 60; // 1 minute in hours

    return Object.entries(statusHours)
      .filter(([, data]) => (data.total / Math.max(data.count, 1)) >= MIN_STATUS_HOURS)
      .map(([status, data]) => ({
        name: `Time in ${status}`,
        value: Math.round((data.total / Math.max(data.count, 1)) * 100) / 100,
        unit: 'hours',
        dimensions: { status },
        ticketKeys: Array.from(issuesPerStatus[status] || []),
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

    const withinSlaIssues = resolvedIssues.filter((issue) => {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
      return hours <= slaTargetHours;
    });

    const rate = (withinSlaIssues.length / resolvedIssues.length) * 100;

    return [{
      name: 'SLA Compliance Rate',
      value: Math.round(rate * 100) / 100,
      unit: '%',
      ticketKeys: withinSlaIssues.map(i => i.key),
      details: [
        { label: 'Within SLA', value: withinSlaIssues.length, unit: 'tickets' },
        { label: 'Breached SLA', value: resolvedIssues.length - withinSlaIssues.length, unit: 'tickets' },
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
  description: 'Overview of ticket activity: Created, Resolved, and currently Open.',
  category: 'throughput',
  unit: 'tickets',
  calculate(context) {
    const createdIssues = context.issues.filter((i) =>
      i.created >= context.period.start && i.created <= context.period.end
    );

    const resolvedIssues = context.issues.filter((i) =>
      i.resolved && i.resolved >= context.period.start && i.resolved <= context.period.end
    );

    const openIssues = context.issues.filter((i) => {
      const createdBeforeEnd = i.created <= context.period.end;
      // An issue is NOT open if it was resolved before the period end OR if it's currently Done (fallback for missing resolution date)
      const isActuallyDone = isIssueDone(i);
      const notYetResolved = (!i.resolved && !isActuallyDone) || (i.resolved && i.resolved > context.period.end);
      return createdBeforeEnd && notYetResolved;
    });

    const periodDays = Math.max(
      Math.ceil((context.period.end.getTime() - context.period.start.getTime()) / (1000 * 60 * 60 * 24)),
      1
    );

    return [
      {
        name: 'Resolved Tickets',
        value: resolvedIssues.length,
        unit: 'tickets',
        ticketKeys: resolvedIssues.map(i => i.key),
        details: [
          { label: 'Avg. Resolved/Day', value: Math.round((resolvedIssues.length / periodDays) * 100) / 100, unit: 'tickets/day' },
        ],
      },
      {
        name: 'Created Tickets',
        value: createdIssues.length,
        unit: 'tickets',
        ticketKeys: createdIssues.map(i => i.key),
      },
      {
        name: 'Open Tickets',
        value: openIssues.length,
        unit: 'tickets',
        ticketKeys: openIssues.map(i => i.key),
      }
    ];
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

    const resolvedIssues = context.issues.filter((i) => isIssueDone(i));
    const resolved = resolvedIssues.length;
    const rate = (resolved / total) * 100;

    return [{
      name: 'Resolution Rate',
      value: Math.round(rate * 100) / 100,
      unit: '%',
      ticketKeys: resolvedIssues.map(i => i.key),
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
      ticketKeys: resolvedIssues.map(i => i.key),
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

    const resolvedByPriority: Record<string, { total: number; withinSla: number; ticketKeys: Set<string> }> = {};

    for (const issue of context.issues) {
      if (!issue.resolved) continue;
      const priority = issue.priority || 'Unassigned';
      if (!resolvedByPriority[priority]) resolvedByPriority[priority] = { total: 0, withinSla: 0, ticketKeys: new Set() };
      resolvedByPriority[priority].total++;
      resolvedByPriority[priority].ticketKeys.add(issue.key);

      const hours = calculateBusinessHours(issue.created, issue.resolved, context.holidays);
      const target = slaTargets[priority] || 40;
      if (hours <= target) resolvedByPriority[priority].withinSla++;
    }

    return Object.entries(resolvedByPriority).map(([priority, data]) => ({
      name: `SLA: ${priority}`,
      value: Math.round((data.withinSla / data.total) * 10000) / 100,
      unit: '%',
      dimensions: { priority },
      ticketKeys: Array.from(data.ticketKeys),
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
    const ticketKeys: string[] = [];

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
      if (reassignments > 0) {
        issuesWithReassignments++;
        ticketKeys.push(issue.key);
      }
      totalReassignments += reassignments;
    }

    return [{
      name: 'Avg. Reassignments',
      value: context.issues.length > 0
        ? Math.round((totalReassignments / context.issues.length) * 100) / 100
        : 0,
      unit: 'reassignments',
      ticketKeys,
      details: [
        { label: 'Total Reassignments', value: totalReassignments },
        { label: 'Issues with Reassignments', value: issuesWithReassignments },
      ],
    }];
  },
};

/**
 * Open Tickets by Assignee - Count non-resolved tickets per unique assignee
 */
const openTicketsByAssigneePlugin: KpiPlugin = {
  id: 'open_tickets_by_assignee',
  name: 'Open Tickets by Assignee',
  description: 'Number of non-resolved tickets currently assigned to each user.',
  category: 'assignee',
  unit: 'tickets',
  visualization: 'horizontal_bar',
  calculate(context) {
    const counts: Record<string, number> = {};
    const openIssues = context.issues.filter(i => !isIssueDone(i));

    for (const issue of openIssues) {
      const assignee = issue.assignee || 'Unassigned';
      counts[assignee] = (counts[assignee] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([assignee, count]) => {
        const issuesForAssignee = openIssues.filter(i => (i.assignee || 'Unassigned') === assignee);
        return {
          name: `Open: ${assignee}`,
          value: count,
          unit: 'tickets',
          dimensions: { assignee },
          ticketKeys: issuesForAssignee.map(i => i.key),
          details: [
            { label: 'Assignee', value: 0, unit: assignee }, // Value 0 but label shows name
          ],
        };
      });
  },
};

/**
 * SLA by Status - Compliance per workflow status with comment-based clock reset.
 * When the assignee comments while a ticket is in a status, the SLA clock resets
 * to that comment timestamp (the last assignee comment becomes the new SLA start).
 */
const slaByStatusPlugin: KpiPlugin = {
  id: 'sla_by_status',
  name: 'SLA Compliance by Status',
  description: 'Percentage of status durations meeting per-status SLA targets. Assignee comments reset the SLA clock.',
  category: 'sla',
  unit: '%',
  calculate(context) {
    return calculateSlaByStatus(context);
  },
};

/**
 * SLA by Status (Excl. Clones) - Same as above but excludes tickets with "CLONE" in summary.
 */
const slaByStatusExclClonePlugin: KpiPlugin = {
  id: 'sla_by_status_excl_clone',
  name: 'SLA Compliance by Status (Excl. Clones)',
  description: 'SLA compliance by status, excluding tickets with "CLONE" in the title/summary. Assignee comments reset the SLA clock.',
  category: 'sla',
  unit: '%',
  calculate(context) {
    // Filter out tickets with "CLONE" in summary (case-sensitive as requested)
    const filteredContext = {
      ...context,
      issues: context.issues.filter(issue => !issue.summary.includes('CLONE'))
    };
    return calculateSlaByStatus(filteredContext);
  },
};

/**
 * Core calculation logic for SLA by Status
 */
function calculateSlaByStatus(context: KpiContext): KpiResult[] {
  const targets = context.slaTargets || {};
  const targetEntries = Object.entries(targets).filter(([, h]) => h > 0);
  if (targetEntries.length === 0) return [];

  // Debug: Log available statuses from transitions
  const availableStatuses = new Set<string>();
  for (const issue of context.issues) {
    for (const t of issue.transitions) {
      if (t.toStatus) availableStatuses.add(t.toStatus);
      if (t.fromStatus) availableStatuses.add(t.fromStatus);
    }
  }

  const results: KpiResult[] = [];

  for (const [configuredStatus, targetHours] of targetEntries) {
    let totalOccurrences = 0;
    let withinSla = 0;
    const ticketKeys = new Set<string>();

    // Try exact match first, then case-insensitive match
    const matchingStatuses = Array.from(availableStatuses).filter(s =>
      s === configuredStatus || s.toLowerCase() === configuredStatus.toLowerCase()
    );

    if (matchingStatuses.length === 0) {
      continue;
    }

    // Use the first matching status (prefer exact match)
    const status = matchingStatuses.find(s => s === configuredStatus) || matchingStatuses[0];

    for (const issue of context.issues) {
      let issueMatchedStatus = false;

      // Find periods where the ticket was in this status
      for (let i = 0; i < issue.transitions.length; i++) {
        const t = issue.transitions[i];
        if (t.toStatus !== status) continue;

        issueMatchedStatus = true;
        const statusEntry = t.occurredAt;
        const statusExit = issue.transitions[i + 1]
          ? issue.transitions[i + 1].occurredAt
          : issue.resolved || new Date();

        totalOccurrences++;

        // Find assignee comments during this status period
        const assigneeComments = issue.comments.filter(
          (c) => c.author === issue.assignee
            && c.created >= statusEntry
            && c.created <= statusExit
        );

        // SLA clock resets to the last assignee comment
        const slaStart = assigneeComments.length > 0
          ? assigneeComments[assigneeComments.length - 1].created
          : statusEntry;

        const hours = calculateBusinessHours(slaStart, statusExit, context.holidays);
        if (hours <= targetHours) withinSla++;
      }

      // Also check initial status (before first transition)
      if (issue.transitions.length > 0) {
        const firstTransition = issue.transitions[0];
        if (firstTransition.fromStatus === status) {
          issueMatchedStatus = true;
          const statusEntry = issue.created;
          const statusExit = firstTransition.occurredAt;

          totalOccurrences++;

          const assigneeComments = issue.comments.filter(
            (c) => c.author === issue.assignee
              && c.created >= statusEntry
              && c.created <= statusExit
          );

          const slaStart = assigneeComments.length > 0
            ? assigneeComments[assigneeComments.length - 1].created
            : statusEntry;

          const hours = calculateBusinessHours(slaStart, statusExit, context.holidays);
          if (hours <= targetHours) withinSla++;
        }
      }

      if (issueMatchedStatus) {
        ticketKeys.add(issue.key);
      }
    }

    if (totalOccurrences > 0) {
      const rate = (withinSla / totalOccurrences) * 100;
      results.push({
        name: `SLA: ${status}`,
        value: Math.round(rate * 100) / 100,
        unit: '%',
        dimensions: { status },
        ticketKeys: Array.from(ticketKeys),
        details: [
          { label: 'Target', value: targetHours, unit: 'hours' },
          { label: 'Within SLA', value: withinSla },
          { label: 'Total', value: totalOccurrences },
        ],
      });
    }
  }

  return results;
}

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
    this.register(slaByStatusPlugin);
    this.register(slaByStatusExclClonePlugin);
    this.register(reassignmentPlugin);
    this.register(openTicketsByAssigneePlugin);

    // Register time-series plugins
    registerTimeSeriesPlugins(this);
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
   * Filter issues to those relevant to the specified period.
   * Includes issues created, resolved, or active during the period.
   */
  private filterIssuesByPeriod(
    issues: JiraIssue[],
    period: { start: Date; end: Date }
  ): JiraIssue[] {
    return issues.filter((issue) => {
      const created = issue.fields?.created
        ? new Date(issue.fields.created)
        : (issue as any).created
          ? new Date((issue as any).created)
          : null;
      const resolved = issue.fields?.resolutiondate
        ? new Date(issue.fields.resolutiondate)
        : (issue as any).resolved
          ? new Date((issue as any).resolved)
          : null;

      // Include if created within period
      if (created && created >= period.start && created <= period.end) {
        return true;
      }

      // Include if resolved within period
      if (resolved && resolved >= period.start && resolved <= period.end) {
        return true;
      }

      // Include if open during period (created before period end, not resolved)
      if (created && created < period.end && !resolved) {
        return true;
      }

      // Include if active during period (created before, resolved after)
      if (created && created < period.start && resolved && resolved > period.start) {
        return true;
      }

      return false;
    });
  }

  /**
   * Run a specific KPI calculation
   */
  calculate(
    pluginId: string,
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>
  ): KpiResult[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`KPI plugin not found: ${pluginId}`);

    // 1. Apply global filters to all issues first
    let processedIssues = issues;
    if (globalFilters && Object.keys(globalFilters).length > 0) {
      processedIssues = issues.filter(issue => {
        const transformed = transformIssueForKpi(issue);
        for (const [key, values] of Object.entries(globalFilters)) {
          if (!values || values.length === 0) continue;
          
          if (key === 'jql') {
            let matchesAllJql = true;
            for (const query of values) {
              const result = applyFilter([transformed], query);
              if (result.length === 0) {
                matchesAllJql = false;
                break;
              }
            }
            if (!matchesAllJql) return false;
            continue;
          }

          let issueValue: string | string[] = '';
          if (key === 'assignee') issueValue = transformed.assignee;
          else if (key === 'priority') issueValue = transformed.priority || 'None';
          else if (key === 'issueType') issueValue = transformed.issueType;
          else if (key === 'status') issueValue = transformed.status;
          else if (key === 'project') issueValue = transformed.project;
          else if (key === 'component') issueValue = transformed.components;
          else if (key === 'label') issueValue = transformed.labels;

          const match = Array.isArray(issueValue) 
            ? issueValue.some(v => values.includes(v))
            : values.includes(issueValue);
            
          if (!match) return false;
        }
        return true;
      });
    }

    // 2. Filter issues to those relevant for the period
    const filteredIssues = this.filterIssuesByPeriod(processedIssues, period);

    const context: KpiContext = {
      issues: filteredIssues.map(transformIssueForKpi),
      holidays: {
        regions: holidays.regions,
        workStartHour: holidays.workStartHour || 9,
        workEndHour: holidays.workEndHour || 17,
        slaTargetHours: holidays.slaTargetHours || 40,
      },
      period,
      slaTargets,
      globalFilters,
    };

    const currentResults = plugin.calculate(context);

    // 3. Weekly breakdown for Overview cards
    // Only apply to overview plugins (throughput, resolution_rate, etc.) that don't have dimensions
    const isOverviewPlugin = !currentResults.some(r => r.dimensions && Object.keys(r.dimensions).length > 0);
    
    if (isOverviewPlugin) {
      const now = new Date();
      // Current week start (Monday)
      const thisWeekStart = new Date(now);
      const day = thisWeekStart.getDay();
      const diff = thisWeekStart.getDate() - day + (day === 0 ? -6 : 1);
      thisWeekStart.setDate(diff);
      thisWeekStart.setHours(0, 0, 0, 0);

      const thisWeekEnd = new Date(thisWeekStart);
      thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      
      const lastWeekEnd = new Date(thisWeekStart);

      const thisWeekIssues = processedIssues.filter(i => {
        const d = i.fields?.created ? new Date(i.fields.created) : new Date(i.created);
        return d >= thisWeekStart && d < thisWeekEnd;
      });

      const lastWeekIssues = processedIssues.filter(i => {
        const d = i.fields?.created ? new Date(i.fields.created) : new Date(i.created);
        return d >= lastWeekStart && d < lastWeekEnd;
      });

      const thisWeekContext: KpiContext = {
        ...context,
        issues: thisWeekIssues.map(transformIssueForKpi),
        period: { start: thisWeekStart, end: thisWeekEnd }
      };

      const lastWeekContext: KpiContext = {
        ...context,
        issues: lastWeekIssues.map(transformIssueForKpi),
        period: { start: lastWeekStart, end: lastWeekEnd }
      };

      try {
        const thisWeekResults = plugin.calculate(thisWeekContext);
        const lastWeekResults = plugin.calculate(lastWeekContext);

        currentResults.forEach(res => {
          const tw = thisWeekResults.find(r => r.name === res.name);
          const lw = lastWeekResults.find(r => r.name === res.name);
          
          if (tw || lw) {
            res.details = res.details || [];
            if (tw) res.details.push({ label: 'This Week', value: tw.value, unit: tw.unit });
            if (lw) res.details.push({ label: 'Previous Week', value: lw.value, unit: lw.unit });

            // Update comparison for overview cards to be Week-over-Week
            if (tw && lw) {
              res.comparison = {
                value: lw.value,
                change: Number((tw.value - lw.value).toFixed(2)),
                label: 'vs. prev week'
              };
            }
          }
        });
      } catch (e) {
        console.warn(`Weekly breakdown failed for ${pluginId}:`, e);
      }
    }

    // 4. Comparison logic
    // Only run if not already set by weekly breakdown (overview cards)
    const currentDuration = period.end.getTime() - period.start.getTime();
    const prevPeriod = {
      start: new Date(period.start.getTime() - currentDuration),
      end: new Date(period.end.getTime() - currentDuration)
    };
    const prevFilteredIssues = this.filterIssuesByPeriod(processedIssues, prevPeriod);
    const prevContext: KpiContext = {
      ...context,
      issues: prevFilteredIssues.map(transformIssueForKpi),
      period: prevPeriod,
    };

    try {
      const previousResults = plugin.calculate(prevContext);
      return currentResults.map(res => {
        // If we already have a comparison (e.g. from weekly breakdown), keep it
        if (res.comparison) return res;

        const prevRes = previousResults.find(p => p.name === res.name);
        if (prevRes && typeof prevRes.value === 'number') {
          const change = res.value - prevRes.value;
          return {
            ...res,
            comparison: {
              value: prevRes.value,
              change: Number(change.toFixed(2)),
              label: 'vs. prev period'
            }
          };
        }
        return res;
      });
    } catch (e) {
      return currentResults;
    }
  }

  /**
   * Run all registered KPI calculations
   */
  calculateAll(
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>
  ): Record<string, KpiResult[]> {
    const results: Record<string, KpiResult[]> = {};
    for (const [id, plugin] of this.plugins) {
      results[id] = this.calculate(id, issues, holidays, period, slaTargets, globalFilters);
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
    formula: string; // DSL formula or JS code
    language?: 'dsl' | 'javascript';
  }) {
    const customPlugin: KpiPlugin = {
      ...definition,
      pluginType: 'custom',
      isActive: true,
      calculate(context) {
        if (definition.language === 'javascript') {
          try {
            const fn = new Function('context', definition.formula);
            const result = fn(context);
            if (Array.isArray(result) && result.length > 0 && typeof result[0].value !== 'undefined') {
              return result;
            }
            return [{ name: definition.name, value: Number(result) || 0, unit: definition.unit }];
          } catch (err: any) {
            console.error('Plugin JS error:', err);
            return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'JS Error', value: 0 }] }];
          }
        }
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

        let sum = 0;
        let numericCount = 0;

        for (const issue of filtered) {
          const fieldValue = getFieldValue(issue, field.trim());
          if (typeof fieldValue === 'number') {
            sum += fieldValue;
            numericCount++;
          }
        }

        if (numericCount === 0) {
          value = 0;
        } else {
          value = Math.round((sum / numericCount) * 100) / 100;
        }
        break;
      }
      case 'SUM': {
        const [field, whereClause] = args.split(' WHERE ');
        const filtered = whereClause ? applyFilter(issues, whereClause) : issues;
        value = filtered.reduce((acc, issue) => {
          const fieldValue = getFieldValue(issue, field.trim());
          return acc + (typeof fieldValue === 'number' ? fieldValue : 0);
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
  if (!trimmed || trimmed === 'true' || trimmed === '*') return issues;

  // Handle OR (lowest precedence)
  if (trimmed.toUpperCase().includes(' OR ')) {
    const parts = splitByTopLevelOperator(trimmed, 'OR');
    if (parts.length > 1) {
      const results = parts.map(p => applyFilter(issues, p));
      // Combine results (Set of keys to ensure uniqueness)
      const keys = new Set<string>();
      const combinedIssues: TransformedIssue[] = [];
      results.forEach(resList => {
        resList.forEach(issue => {
          if (!keys.has(issue.key)) {
            keys.add(issue.key);
            combinedIssues.push(issue);
          }
        });
      });
      return combinedIssues;
    }
  }

  // Handle AND
  if (trimmed.toUpperCase().includes(' AND ')) {
    const parts = splitByTopLevelOperator(trimmed, 'AND');
    if (parts.length > 1) {
      let currentIssues = issues;
      for (const part of parts) {
        currentIssues = applyFilter(currentIssues, part);
      }
      return currentIssues;
    }
  }

  // Handle atomic conditions
  const containsMatch = trimmed.match(/^(\w+)\s+(NOT\s+)?CONTAINS\s+"?([^"]+)"?$/i);
  if (containsMatch) {
    const [, field, not, val] = containsMatch;
    const isNot = !!not;
    const cleanVal = val.replace(/^"|"$/g, '').toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = String(getFieldValue(issue, field) || '').toLowerCase();
      const contains = fieldValue.includes(cleanVal);
      return isNot ? !contains : contains;
    });
  }

  const eqMatch = trimmed.match(/^(\w+)\s*=\s*"?([^"]+)"?$/i);
  if (eqMatch) {
    const [, field, val] = eqMatch;
    const cleanVal = val.replace(/^"|"$/g, '').toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      if (cleanVal === 'true') return !!fieldValue;
      if (cleanVal === 'false') return !fieldValue;
      return String(fieldValue || '').toLowerCase() === cleanVal;
    });
  }

  const neqMatch = trimmed.match(/^(\w+)\s*!=\s*"?([^"]+)"?$/i);
  if (neqMatch) {
    const [, field, val] = neqMatch;
    const cleanVal = val.replace(/^"|"$/g, '').toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      return String(fieldValue || '').toLowerCase() !== cleanVal;
    });
  }

  return issues;
}

/**
 * Simple splitter that respects quotes (but not parentheses yet)
 */
function splitByTopLevelOperator(condition: string, operator: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  const words = condition.split(/\s+/);
  
  const op = operator.toUpperCase();
  
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (word.includes('"')) {
      const quotes = (word.match(/"/g) || []).length;
      if (quotes % 2 !== 0) inQuotes = !inQuotes;
    }

    if (!inQuotes && word.toUpperCase() === op) {
      parts.push(current.trim());
      current = '';
    } else {
      current += (current ? ' ' : '') + word;
    }
    i++;
  }
  
  if (current) parts.push(current.trim());
  return parts;
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
    project: () => issue.project,
    summary: () => issue.summary,
    description: () => (issue as any).description || '',
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
