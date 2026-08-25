/**
 * Client-side widget JQL evaluation engine.
 *
 * Extracted from KpiDashboard.tsx (formerly inline in `calculateWidgetJql`).
 * It filters the master dataset issues for a single widget based on that
 * widget's `jqlFilter` config:
 *
 *   - `enabled: false`                → no filtering at all
 *   - `mode: 'refine'`                → dashboard global filters applied first,
 *                                       then the widget JQL on top (AND)
 *   - `mode: 'override'`              → global filters skipped; only widget JQL
 *
 * Supported JQL subset (2026-08 fixes: compound AND/OR, ~ operator,
 * case-insensitive field names, trimmed filter values, JSON object fallback):
 *   field = "v", field != "v", field ~ "v", field CONTAINS "v",
 *   field NOT CONTAINS "v", field IN (v1,v2), field NOT IN (v1,v2)
 * Clauses can be combined with AND (all must match; binds tighter) and OR
 * (any may match), e.g. `status = "Open" AND priority ~ "high" OR labels IN (a,b)`.
 * A clause that matches no pattern is treated as a full-text search predicate.
 * When the whole query matches no pattern at all, the entire query is a
 * full-text search across summary, key, and description.
 *
 * Field names resolve case-insensitively from both flat (issue.field) and
 * nested (issue.fields.field) issue shapes.
 *
 * Pure module: no React, no I/O.
 */

import { splitTopLevel } from './kpi/utils/split-top-level';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Widget JQL filter configuration (mirrors `JqlFilter` in types/dashboard). */
export interface WidgetJqlFilter {
  enabled: boolean;
  query: string;
  mode: 'override' | 'refine';
}

/** Dashboard-level dimension filters: field key → allowed values. */
export type GlobalFilters = Record<string, string[]>;

/**
 * Minimal structural issue type compatible with both shapes the engine sees:
 * flat transformed issues (field values as direct properties) and raw Jira
 * issues carrying a nested `fields` object. Field values are normalized via
 * `normalizeIssueFieldValue` before comparison.
 */
export interface WidgetEvalIssue {
  key?: string;
  summary?: unknown;
  description?: unknown;
  fields?: Record<string, unknown>;
  [field: string]: unknown;
}

// ─── Pre-compiled JQL patterns for client-side filtering ─────────────────────
// IMPORTANT: More specific patterns must come first!
export const JQL_PATTERNS: ReadonlyArray<{ regex: RegExp; op: string }> = [
  { regex: /(\w+)\s*=\s*"([^"]+)"/, op: '=' },
  { regex: /(\w+)\s*!=\s*"([^"]+)"/, op: '!=' },
  { regex: /(\w+)\s*~\s*"([^"]+)"/, op: '~' },
  { regex: /(\w+)\s+NOT\s+CONTAINS\s+"([^"]+)"/i, op: 'NOT CONTAINS' },
  { regex: /(\w+)\s+CONTAINS\s+"([^"]+)"/i, op: 'CONTAINS' },
  { regex: /(\w+)\s+NOT\s+IN\s+\(([^)]+)\)/i, op: 'NOT IN' },
  { regex: /(\w+)\s+IN\s+\(([^)]+)\)/i, op: 'IN' },
];

// ─── Field normalization ─────────────────────────────────────────────────────

/**
 * Describes an unknown-shaped object for comparison: prefers the known label
 * keys (displayName/name/value/key), otherwise serializes to JSON instead of
 * the useless '[object Object]' literal.
 */
function describeUnknownObject(value: unknown): string {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const known = obj.displayName || obj.name || obj.value || obj.key;
    if (known) return String(known);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value ?? '');
}

/**
 * Normalizes a raw issue field value for comparison:
 *   - arrays are joined with ',' using each item's displayName | name | value
 *     | key, falling back to JSON for unknown-shaped items
 *   - objects are reduced to displayName | name | value | key, falling back
 *     to JSON serialization
 *   - primitives pass through unchanged
 */
export function normalizeIssueFieldValue(rawValue: unknown): unknown {
  let normalizedValue = rawValue;
  if (rawValue && typeof rawValue === 'object') {
    if (Array.isArray(rawValue)) {
      normalizedValue = rawValue.map((v) => describeUnknownObject(v)).join(',');
    } else {
      const obj = rawValue as Record<string, unknown>;
      normalizedValue = obj.displayName || obj.name || obj.value || obj.key || describeUnknownObject(rawValue);
    }
  }
  return normalizedValue;
}

/**
 * Case-insensitive property lookup: exact key first, then a scan for a key
 * that differs only in case. Returns undefined when absent (an explicitly
 * stored null is returned as-is so `??` fall-through semantics are kept).
 */
function lookupIgnoreCase(source: Record<string, unknown> | undefined, field: string): unknown {
  if (!source) return undefined;
  const direct = source[field];
  if (direct !== undefined) return direct;
  const lowerField = field.toLowerCase();
  const match = Object.keys(source).find((k) => k.toLowerCase() === lowerField);
  return match === undefined ? undefined : source[match];
}

/**
 * Resolves a field from an issue supporting both flat (issue.field) and
 * nested (issue.fields.field) shapes with case-insensitive field names, then
 * normalizes it to a lowercase trimmed string.
 */
function resolveIssueValue(issue: WidgetEvalIssue, field: string): string {
  const rawValue = lookupIgnoreCase(issue, field) ?? lookupIgnoreCase(issue.fields, field);
  const normalizedValue = normalizeIssueFieldValue(rawValue);
  return String(normalizedValue || '').trim().toLowerCase();
}

// ─── Global dashboard filters ────────────────────────────────────────────────

/**
 * Applies the dashboard-level global filters (exact match per dimension key,
 * case-insensitive; array dimensions compared via the comma-joined form).
 * Filter values are trimmed before comparison. Keys with no values are
 * skipped. Returns a new array.
 */
export function applyGlobalFilters(
  issues: WidgetEvalIssue[],
  globalFilters: GlobalFilters | null | undefined
): WidgetEvalIssue[] {
  let filteredIssues = issues;

  if (globalFilters) {
    Object.entries(globalFilters).forEach(([key, values]) => {
      if (values && values.length > 0) {
        filteredIssues = filteredIssues.filter((issue) => {
          // Array dimensions like components/labels might need partial match, but globalFilters uses exact match
          const issueValue = resolveIssueValue(issue, key);
          return values.some(v => {
            const lowerV = v.trim().toLowerCase();
            return issueValue === lowerV || issueValue.split(',').includes(lowerV);
          });
        });
      }
    });
  }

  return filteredIssues;
}

// ─── Widget JQL query ────────────────────────────────────────────────────────

/** Parses one clause against JQL_PATTERNS; null when nothing matches. */
function parseClause(clause: string): { field: string; operator: string; value: string } | null {
  for (const pattern of JQL_PATTERNS) {
    const match = clause.match(pattern.regex);
    if (match) {
      return { field: match[1], operator: pattern.op, value: match[2] };
    }
  }
  return null;
}

/** Matches one issue against one parsed field clause. */
function matchesClause(issue: WidgetEvalIssue, field: string, operator: string, rawValue: string): boolean {
  const issueValue = resolveIssueValue(issue, field);

  switch (operator) {
    case '=':            return issueValue === rawValue.toLowerCase();
    case '!=':           return issueValue !== rawValue.toLowerCase();
    case '~':            return issueValue.includes(rawValue.toLowerCase());
    case 'CONTAINS':     return issueValue.includes(rawValue.toLowerCase());
    case 'NOT CONTAINS': return !issueValue.includes(rawValue.toLowerCase());
    case 'IN': {
      // Quote-aware split so quoted values may contain commas.
      const values = splitTopLevel(rawValue, ',', { keepQuotes: true })
        .map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '').toLowerCase());
      return values.some(v => v === issueValue);
    }
    case 'NOT IN': {
      const values = splitTopLevel(rawValue, ',', { keepQuotes: true })
        .map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '').toLowerCase());
      return !values.some(v => v === issueValue);
    }
    default: return true;
  }
}

/** Full-text predicate across summary, key, and description. */
function matchesFullText(issue: WidgetEvalIssue, needle: string): boolean {
  const needleLower = needle.trim().toLowerCase();
  // NOTE: `${issue.key}` intentionally interpolates raw (a missing key
  // contributes the literal text "undefined").
  const text = `${issue.summary ?? issue.fields?.summary ?? ''} ${issue.key} ${issue.description ?? issue.fields?.description ?? ''}`.toLowerCase();
  return text.includes(needleLower);
}

/**
 * Evaluates one clause: a parsed field clause when it matches a JQL pattern,
 * otherwise a full-text predicate over the whole clause text.
 */
function matchesSingleClause(issue: WidgetEvalIssue, clause: string): boolean {
  const parsed = parseClause(clause);
  if (parsed) {
    return matchesClause(issue, parsed.field, parsed.operator, parsed.value);
  }
  return matchesFullText(issue, clause);
}

/**
 * Applies a single widget JQL query to a list of issues.
 *
 * Queries are split into OR alternatives (any may match); each alternative is
 * split into AND clauses (all must match), with AND binding tighter than OR.
 * Splitting is quote-aware, so quoted values containing AND/OR/commas stay
 * intact. When nothing parses as a field clause the whole query is a
 * case-insensitive full-text search. Returns a new array.
 */
export function applyWidgetJqlQuery(
  issues: WidgetEvalIssue[],
  rawQuery: string
): WidgetEvalIssue[] {
  const query = rawQuery.trim();

  // OR alternatives, each a list of AND clauses (AND binds tighter).
  const alternatives = splitTopLevel(query, ' OR ', { caseInsensitive: true, keepQuotes: true })
    .map(orPart =>
      splitTopLevel(orPart, ' AND ', { caseInsensitive: true, keepQuotes: true })
        .map(clause => clause.trim())
        .filter(clause => clause.length > 0)
    )
    .filter(group => group.length > 0);

  // Empty/whitespace query: "".includes is always true — keep everything.
  if (alternatives.length === 0) return issues.filter(() => true);

  return issues.filter((issue) =>
    alternatives.some(andGroup =>
      andGroup.every(clause => matchesSingleClause(issue, clause))
    )
  );
}

// ─── Combined pipeline ───────────────────────────────────────────────────────

/**
 * Filters the master dataset for one widget according to its JQL filter
 * config. Behavior mirrors the former inline logic in KpiDashboard:
 *
 *   1. When enabled and mode !== 'override', global dashboard filters apply
 *      first (refine mode). Override mode starts from the full dataset.
 *   2. When enabled and a query is present, the widget JQL refines the
 *      (already globally filtered) result further.
 *
 * The input array is never mutated.
 */
export function filterIssuesForWidget(
  issues: WidgetEvalIssue[],
  jqlFilter: WidgetJqlFilter,
  globalFilters?: GlobalFilters | null
): WidgetEvalIssue[] {
  let filteredIssues = issues;

  if (jqlFilter.enabled && jqlFilter.mode !== 'override' && globalFilters) {
    filteredIssues = applyGlobalFilters(filteredIssues, globalFilters);
  }

  if (jqlFilter.enabled && jqlFilter.query) {
    filteredIssues = applyWidgetJqlQuery(filteredIssues, jqlFilter.query);
  }

  return filteredIssues;
}
