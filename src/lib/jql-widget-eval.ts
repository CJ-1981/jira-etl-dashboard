/**
 * Client-side widget JQL evaluation engine.
 *
 * Extracted verbatim (behavior-preserving) from KpiDashboard.tsx, where it
 * lived inline inside `calculateWidgetJql`. It filters the master dataset
 * issues for a single widget based on that widget's `jqlFilter` config:
 *
 *   - `enabled: false`                → no filtering at all
 *   - `mode: 'refine'`                → dashboard global filters applied first,
 *                                       then the widget JQL on top (AND)
 *   - `mode: 'override'`              → global filters skipped; only widget JQL
 *
 * Supported JQL subset (first matching pattern wins):
 *   field = "v", field != "v", field CONTAINS "v", field NOT CONTAINS "v",
 *   field IN (v1,v2), field NOT IN (v1,v2)
 * Anything else falls back to a full-text search across summary, key, and
 * description.
 *
 * Fields are resolved from both flat (issue.field) and nested
 * (issue.fields.field) issue shapes.
 *
 * Pure module: no React, no I/O.
 */

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
  { regex: /(\w+)\s+NOT\s+CONTAINS\s+"([^"]+)"/i, op: 'NOT CONTAINS' },
  { regex: /(\w+)\s+CONTAINS\s+"([^"]+)"/i, op: 'CONTAINS' },
  { regex: /(\w+)\s+NOT\s+IN\s+\(([^)]+)\)/i, op: 'NOT IN' },
  { regex: /(\w+)\s+IN\s+\(([^)]+)\)/i, op: 'IN' },
];

// ─── Field normalization ─────────────────────────────────────────────────────

/**
 * Normalizes a raw issue field value for comparison:
 *   - arrays are joined with ',' using each item's displayName | name | value
 *   - objects are reduced to displayName | name | value | key
 *   - primitives pass through unchanged
 */
export function normalizeIssueFieldValue(rawValue: unknown): unknown {
  let normalizedValue = rawValue;
  if (rawValue && typeof rawValue === 'object') {
    if (Array.isArray(rawValue)) {
      normalizedValue = rawValue
        .map((v: Record<string, unknown>) => v.displayName || v.name || v.value || String(v))
        .join(',');
    } else {
      const obj = rawValue as Record<string, unknown>;
      normalizedValue = obj.displayName || obj.name || obj.value || obj.key || String(rawValue);
    }
  }
  return normalizedValue;
}

/**
 * Resolves a field from an issue supporting both flat (issue.field) and
 * nested (issue.fields.field) shapes, then normalizes it to a lowercase
 * trimmed string.
 */
function resolveIssueValue(issue: WidgetEvalIssue, field: string): string {
  const rawValue = issue[field] ?? issue.fields?.[field];
  const normalizedValue = normalizeIssueFieldValue(rawValue);
  return String(normalizedValue || '').trim().toLowerCase();
}

// ─── Global dashboard filters ────────────────────────────────────────────────

/**
 * Applies the dashboard-level global filters (exact match per dimension key,
 * case-insensitive; array dimensions compared via the comma-joined form).
 * Keys with no values are skipped. Returns a new array.
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
            const lowerV = v.toLowerCase();
            return issueValue === lowerV || issueValue.split(',').includes(lowerV);
          });
        });
      }
    });
  }

  return filteredIssues;
}

// ─── Widget JQL query ────────────────────────────────────────────────────────

/**
 * Applies a single widget JQL query to a list of issues.
 *
 * First tries the supported field-match patterns (`JQL_PATTERNS`); when none
 * matches, falls back to a case-insensitive full-text search across summary,
 * key, and description. Returns a new array.
 */
export function applyWidgetJqlQuery(
  issues: WidgetEvalIssue[],
  rawQuery: string
): WidgetEvalIssue[] {
  const query = rawQuery.trim();
  let field = '';
  let operator = '';
  let value = '';

  // IMPORTANT: More specific patterns must come first!
  for (const pattern of JQL_PATTERNS) {
    const match = query.match(pattern.regex);
    if (match) {
      field = match[1];
      operator = pattern.op;
      value = (operator === 'IN' || operator === 'NOT IN') ? match[2] : match[2].toLowerCase();
      break;
    }
  }

  if (field && operator && value) {
    return issues.filter((issue) => {
      // Support both flat (issue.summary) and nested (issue.fields.summary) issue shapes
      const issueValue = resolveIssueValue(issue, field);

      switch (operator) {
        case '=':            return issueValue.toLowerCase() === value;
        case '!=':           return issueValue.toLowerCase() !== value;
        case 'CONTAINS':     return issueValue.toLowerCase().includes(value);
        case 'NOT CONTAINS': return !issueValue.toLowerCase().includes(value);
        case 'IN': {
          const values = value.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
          return values.some(v => v.toLowerCase() === issueValue.toLowerCase());
        }
        case 'NOT IN': {
          const values = value.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
          return !values.some(v => v.toLowerCase() === issueValue.toLowerCase());
        }
        default: return true;
      }
    });
  }

  // Fallback: full-text search across summary, key, description
  const queryLower = query.toLowerCase();
  return issues.filter((issue) => {
    // NOTE: `${issue.key}` intentionally interpolates raw (matches original:
    // a missing key contributes the literal text "undefined").
    const text = `${issue.summary ?? issue.fields?.summary ?? ''} ${issue.key} ${issue.description ?? issue.fields?.description ?? ''}`.toLowerCase();
    return text.includes(queryLower);
  });
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
