/**
 * KPI Engine Utility Functions
 * Shared helper functions extracted from engine.ts for use across plugins
 * @MX:ANCHOR: Shared utility functions for KPI calculations
 * @MX:REASON: Prevents code duplication across plugin files and provides consistent behavior
 */

import type { JiraIssue } from '../jira/client';
import { calculateBusinessHours, calculateWorkingDays } from '../holidays/german-holidays';
import { extractSelectFieldValue } from '../jira/client';
import type { TransformedIssue, StatusTransition, AgeCategory } from './types';

// ─── Transform Cache ────────────────────────────────────────────────────────────

/**
 * @MX:NOTE: Key-based cache for transformed issues (replaces ineffective WeakMap)
 * @MX:REASON: Issues are recreated from JSON as new objects - key-based cache
 * works within a single calculation batch where the same issue is processed multiple times
 */
interface TransformCacheEntry {
  issue: TransformedIssue;
  timestamp: number;
}

const transformCache = new Map<string, TransformCacheEntry>();
const TRANSFORM_CACHE_SIZE = 5000;

// ─── Issue Transformation ───────────────────────────────────────────────────────

export function transformIssueForKpi(issue: JiraIssue): TransformedIssue {
  // @MX:NOTE: Use composed key (issue.key + updated timestamp) to detect stale data
  const cacheKey = `${issue.key}:${issue.fields.updated || ''}`;
  const cached = transformCache.get(cacheKey);
  if (cached) return cached.issue;
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
  if (transitions.length > 0) {
    // 1. Initial status (creation to first transition)
    const firstTransition = transitions[0];
    const initialStatus = firstTransition.fromStatus;
    if (initialStatus) {
      const createdDate = new Date(issue.fields.created);
      const durationHours = (firstTransition.occurredAt.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
      timeInStatus[initialStatus] = (timeInStatus[initialStatus] || 0) + Math.max(0, durationHours);
    }

    // 2. Transitions
    for (let i = 0; i < transitions.length; i++) {
      const startTime = transitions[i].occurredAt.getTime();
      const endTime = transitions[i + 1]
        ? transitions[i + 1].occurredAt.getTime()
        : (issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate).getTime() : Date.now());
      
      const durationHours = (endTime - startTime) / (1000 * 60 * 60);
      const status = transitions[i].toStatus;
      timeInStatus[status] = (timeInStatus[status] || 0) + Math.max(0, durationHours);
    }
  } else {
    // No transitions - all time spent in current status
    const createdDate = new Date(issue.fields.created);
    const startTime = createdDate.getTime();
    const endTime = issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate).getTime() : Date.now();
    const durationHours = (endTime - startTime) / (1000 * 60 * 60);
    timeInStatus[issue.fields.status.name] = durationHours;
  }

  const result: TransformedIssue = {
    key: issue.key,
    project: (issue.fields as any)?.project?.name || (issue.fields as any)?.project?.key || issue.key.split('-')[0],
    summary: issue.fields?.summary || (issue as any).summary || 'No Summary',
    issueType: issue.fields?.issuetype?.name || (issue as any).issueType || 'Task',
    priority: issue.fields?.priority?.name || (issue as any).priority || null,
    status: issue.fields?.status?.name || (issue as any).status || 'Unknown',
    statusCategory: issue.fields?.status?.statusCategory?.name || (issue as any).statusCategory || 'Unknown',
    assignee: issue.fields?.assignee?.displayName || (issue as any).assignee || 'Unassigned',
    reporter: issue.fields?.reporter?.displayName || (issue as any).reporter || 'Unknown',
    issueOwnerTeam: extractSelectFieldValue((issue.fields as any)?.customfield_10132) || (issue.fields as any)?.issueOwnerTeam || (issue as any).issueOwnerTeam || null,
    created: new Date(issue.fields?.created || (issue as any).created || Date.now()),
    updated: new Date(issue.fields?.updated || (issue as any).updated || Date.now()),
    resolved: (issue.fields?.resolutiondate || (issue as any).resolved) ? new Date(issue.fields?.resolutiondate || (issue as any).resolved) : null,
    dueDate: (issue.fields?.duedate || (issue as any).dueDate) ? new Date(issue.fields?.duedate || (issue as any).dueDate) : null,
    // @MX:REASON: ?? instead of || — a story points value of 0 is meaningful
    // and must not fall through to the next fallback.
    storyPoints: (issue.fields as any)?.customfield_10002 ?? (issue as any).storyPoints ?? null,
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
    // @MX:NOTE: Raw changelog is preserved because some plugins (reassignment_count)
    // need assignee-change history, which status-only `transitions` cannot represent.
    changelog: issue.changelog || (issue as any).changelog || undefined,
  };

  if (transformCache.size >= TRANSFORM_CACHE_SIZE) {
    const firstKey = transformCache.keys().next().value;
    if (firstKey !== undefined) {
      transformCache.delete(firstKey);
    }
  }
  transformCache.set(cacheKey, { issue: result, timestamp: Date.now() });
  return result;
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
 * @MX:NOTE: Pre-compiled regex patterns for filter DSL
 * @MX:REASON: Avoids regex compilation overhead on every filter application
 */
const FILTER_PATTERNS = {
  contains: /^([\w.-]+)\s+(NOT\s+)?CONTAINS\s+("([^"]+)"|'([^']+)'|(\S+))$/i,
  eq: /^([\w.-]+)\s*={1,2}\s+("([^"]+)"|'([^']+)'|(\S+))$/i,
  neq: /^([\w.-]+)\s*!=\s+("([^"]+)"|'([^']+)'|(\S+))$/i,
  in: /^([\w.-]+)\s+(NOT\s+)?IN\s*\((.*)\)$/i,
};

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

  // Handle atomic conditions using pre-compiled patterns
  const containsMatch = trimmed.match(FILTER_PATTERNS.contains);
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

  const eqMatch = trimmed.match(FILTER_PATTERNS.eq);
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

  const neqMatch = trimmed.match(FILTER_PATTERNS.neq);
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
  const inMatch = trimmed.match(FILTER_PATTERNS.in);
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

// ─── Module-level field accessors for O(1) lookup ───────────────────────────────

const FIELD_MAP: Record<string, (issue: TransformedIssue) => unknown> = {
  storyPoints: (i) => i.storyPoints,
  priority: (i) => i.priority,
  status: (i) => i.status,
  statusCategory: (i) => i.statusCategory,
  issueType: (i) => i.issueType,
  assignee: (i) => i.assignee,
  reporter: (i) => i.reporter,
  labels: (i) => i.labels,
  components: (i) => i.components,
  resolved: (i) => i.resolved,
  key: (i) => i.key,
  project: (i) => i.project,
  summary: (i) => i.summary,
  description: (i) => (i as any).description || '',
};

/**
 * Extract field value from TransformedIssue using field mapping
 * Supports dynamic fields like timeInStatus.statusName
 * @MX:ANCHOR: Field extraction logic
 * @MX:REASON: Provides consistent field access across filter DSL and custom formulas
 */
export function getFieldValue(issue: TransformedIssue, field: string): unknown {
  if (field.startsWith('timeInStatus.')) {
    const statusName = field.replace('timeInStatus.', '');
    return issue.timeInStatus[statusName] || 0;
  }

  const getter = FIELD_MAP[field];
  return getter ? getter(issue) : null;
}

// ─── Age & Priority Utilities ───────────────────────────────────────────────────

/**
 * Get standard age category for a ticket given its creation/resolution date and a reference date
 * @param date - Creation date (for open tickets) or resolution/update date (for closed tickets)
 * @param referenceDate - Reference date (typically period end date or current time)
 * @returns AgeCategory ('this_week' | 'last_week' | 'existing')
 * @MX:ANCHOR: Age categorization logic
 * @MX:REASON: Provides standardized age calculation robust to negative time deltas
 */
export function getAgeCategory(date: Date | string, referenceDate: Date | string): AgeCategory {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const dateObj = new Date(date);
  const refObj = new Date(referenceDate);
  const ageMs = refObj.getTime() - dateObj.getTime();
  const weeksOld = Math.floor(Math.max(0, ageMs) / msPerWeek);

  if (weeksOld === 0) return 'this_week';
  if (weeksOld === 1) return 'last_week';
  return 'existing';
}

/**
 * Standard sort order for age categories (existing → last_week → this_week)
 */
export const AGE_ORDER: Record<AgeCategory, number> = { existing: 0, last_week: 1, this_week: 2 };

/**
 * Priority order mapping for ascending sort (P0 → P3, Highest → Lowest)
 */
export const PRIORITY_ORDER: Record<string, number> = {
  'Highest': 0,
  'High': 1,
  'Medium': 2,
  'Low': 3,
  'Lowest': 4,
  'P0': 0,
  'P0-Highest': 0,
  'P1': 1,
  'P1-High': 1,
  'P2': 2,
  'P2-Medium': 2,
  'P3': 3,
  'P3-Low': 3,
  'P4': 4,
  'P4-Lowest': 4,
  'p0': 0,
  'p0-highest': 0,
  'p1': 1,
  'p1-high': 1,
  'p2': 2,
  'p2-medium': 2,
  'p3': 3,
  'p3-low': 3,
  'p4': 4,
  'p4-lowest': 4,
  'unassigned': 999,
  'Unassigned': 999,
  'Unknown': 998,
  'unknown': 998,
};

/**
 * Robust helper function to get numeric priority order value for sorting
 */
export function getPriorityOrder(priority: string): number {
  if (!priority) return 999;

  if (PRIORITY_ORDER[priority] !== undefined) return PRIORITY_ORDER[priority];

  const normalized = priority.toLowerCase().trim();
  if (PRIORITY_ORDER[normalized] !== undefined) return PRIORITY_ORDER[normalized];

  const pMatch = priority.match(/p(\d+)/i);
  if (pMatch) {
    return parseInt(pMatch[1], 10);
  }

  const textualPriority = normalized.toLowerCase();
  if (textualPriority.includes('highest') || textualPriority === 'p0') return 0;
  if (textualPriority.includes('high') && !textualPriority.includes('highest')) return 1;
  if (textualPriority.includes('medium')) return 2;
  if (textualPriority.includes('low')) {
    if (textualPriority.includes('lowest')) return 4;
    return 3;
  }

  return 999;
}

