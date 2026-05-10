/**
 * KPI Engine Utility Functions
 * Shared helper functions extracted from engine.ts for use across plugins
 * @MX:ANCHOR: Shared utility functions for KPI calculations
 * @MX:REASON: Prevents code duplication across plugin files and provides consistent behavior
 */

import type { JiraIssue } from '../jira/client';
import { calculateBusinessHours, calculateWorkingDays } from '../holidays/german-holidays';
import type { TransformedIssue, StatusTransition } from './types';

// ─── Issue Transformation ───────────────────────────────────────────────────────

/**
 * Transform JiraIssue to TransformedIssue for KPI calculations
 * Extracts and structures relevant fields from raw Jira API response
 * @MX:ANCHOR: Issue transformation logic
 * @MX:REASON: Central transformation logic used across all KPI calculations
 */
export function transformIssueForKpi(issue: JiraIssue): TransformedIssue {
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
      .map((c: { author?: { displayName?: string }; created: string | number | Date }) => ({
        author: c.author?.displayName || 'Unknown',
        created: new Date(c.created),
      }))
      .sort((a: { created: Date }, b: { created: Date }) => a.created.getTime() - b.created.getTime()),
  };
}

// ─── Issue Status Helpers ────────────────────────────────────────────────────────

/**
 * Robust check if an issue is considered "Done" or "Resolved"
 * Checks both resolution date and status category/name
 * @MX:ANCHOR: Issue completion status check
 * @MX:REASON: Provides consistent logic across all plugins for determining if work is complete
 */
export function isIssueDone(issue: TransformedIssue): boolean {
  if (issue.resolved) return true;
  const status = (issue.status || '').toLowerCase();
  const category = (issue.statusCategory || '').toLowerCase();
  return category === 'done' || ['done', 'closed', 'resolved', 'completed', 'close', 'ready to close'].includes(status);
}

// ─── Filter DSL Implementation ───────────────────────────────────────────────────

/**
 * Filter DSL implementation for dynamic filtering
 * Supports nested logical operators and field comparisons
 * @MX:ANCHOR: Filter DSL parser and evaluator
 * @MX:REASON: Provides flexible filtering capability used by custom formula execution
 */

export type KpiContextIssues = TransformedIssue[];

/**
 * Apply filter condition to array of issues
 * Supports string-based DSL with AND/OR operators and field comparisons
 * @MX:ANCHOR: Filter application logic
 * @MX:REASON: Core filtering capability used by custom formula execution and SLA calculations
 */
export function applyFilter(issues: KpiContextIssues, condition: string): KpiContextIssues {
  const trimmed = condition.trim();
  if (!trimmed || trimmed === 'true' || trimmed === '*') return issues;

  // 1. Handle OR (lowest precedence)
  const orParts = splitByTopLevelOperator(trimmed, 'OR');
  if (orParts.length > 1) {
    const results = orParts.map(p => applyFilter(issues, p));
    const keys = new Set<string>();
    const combinedIssues: KpiContextIssues = [];
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

  // 2. Handle AND
  const andParts = splitByTopLevelOperator(trimmed, 'AND');
  if (andParts.length > 1) {
    let currentIssues = issues;
    for (const part of andParts) {
      currentIssues = applyFilter(currentIssues, part);
    }
    return currentIssues;
  }

  // Handle atomic conditions
  const containsMatch = trimmed.match(/^([\w.-]+)\s+(NOT\s+)?CONTAINS\s+("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (containsMatch) {
    const [, field, not, , quotedDouble, quotedSingle, unquoted] = containsMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const isNot = !!not;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = String(getFieldValue(issue, field) || '').toLowerCase();
      const contains = fieldValue.includes(cleanVal);
      return isNot ? !contains : contains;
    });
  }

  const eqMatch = trimmed.match(/^([\w.-]+)\s*={1,2}\s*("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (eqMatch) {
    const [, field, , quotedDouble, quotedSingle, unquoted] = eqMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      if (cleanVal === 'true') return !!fieldValue;
      if (cleanVal === 'false') return !fieldValue;
      return String(fieldValue || '').toLowerCase() === cleanVal;
    });
  }

  const neqMatch = trimmed.match(/^([\w.-]+)\s*!=\s*("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (neqMatch) {
    const [, field, , quotedDouble, quotedSingle, unquoted] = neqMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      return String(fieldValue || '').toLowerCase() !== cleanVal;
    });
  }

  // @MX:NOTE: Array-aware IN/NOT IN semantics
  // Handles both scalar values and multi-value fields (labels, components).
  // For multi-value fields, the condition matches if ANY element of the field is present in the value list.
  const inMatch = trimmed.match(/^([\w.-]+)\s+(NOT\s+)?IN\s*\((.*)\)$/i);
  if (inMatch) {
    const [, field, not, valuesStr] = inMatch;
    const isNot = !!not;

    // Parse comma separated values respecting quotes
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];
      if ((char === '"' || char === "'") && (i === 0 || valuesStr[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().toLowerCase());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) values.push(current.trim().toLowerCase());

    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);

      let isIn = false;
      if (Array.isArray(fieldValue)) {
        // If issue field is an array (e.g. labels, components), match if ANY element is in the values list
        isIn = fieldValue.some(v => values.includes(String(v || '').toLowerCase()));
      } else {
        // Standard scalar comparison
        isIn = values.includes(String(fieldValue || '').toLowerCase());
      }

      return isNot ? !isIn : isIn;
    });
  }

  return issues;
}

/**
 * Robust splitter that respects quotes
 * @MX:ANCHOR: Top-level operator splitter
 * @MX:REASON: Enables correct parsing of complex filter expressions with quoted values
 */
export function splitByTopLevelOperator(condition: string, operator: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  const op = operator.toUpperCase();
  const search = ` ${op} `;

  for (let i = 0; i < condition.length; i++) {
    const char = condition[i];

    // Handle quotes
    if ((char === '"' || char === "'") && (i === 0 || condition[i-1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }

    // Check for operator if not in quotes
    if (!inQuotes && condition.substring(i).toUpperCase().startsWith(search)) {
      parts.push(current.trim());
      current = '';
      i += search.length - 1; // Skip the operator
    } else {
      current += char;
    }
  }

  if (current) parts.push(current.trim());
  return parts;
}

/**
 * Extract field value from TransformedIssue using field mapping
 * Supports dynamic fields like timeInStatus.statusName
 * @MX:ANCHOR: Field extraction logic
 * @MX:REASON: Provides consistent field access across filter DSL and custom formulas
 */
export function getFieldValue(issue: TransformedIssue, field: string): unknown {
  const fieldMap: Record<string, () => unknown> = {
    storyPoints: () => issue.storyPoints,
    priority: () => issue.priority,
    status: () => issue.status,
    statusCategory: () => issue.statusCategory,
    issueType: () => issue.issueType,
    assignee: () => issue.assignee,
    reporter: () => issue.reporter,
    labels: () => issue.labels,
    components: () => issue.components,
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
