/**
 * Shared age-breakdown helper for KPI plugins
 * @MX:ANCHOR: Group-by-dimension x age-category x sort pipeline
 * @MX:REASON: Centralizes the algorithm previously duplicated across the
 * open/closed ticket breakdown plugins (by priority, status, assignee, and
 * issue owner team) so result shape and sort semantics stay consistent
 */

import type { AgeCategory, KpiResult, TransformedIssue } from '../types';
import { AGE_ORDER, getAgeCategory, getPriorityOrder } from '../engine-utils';

/** Fallback bucket for null/empty dimension values */
const UNASSIGNED = 'Unassigned';

/** Human-readable age labels used by the open-ticket breakdown plugins */
export const OPEN_TICKET_AGE_LABELS: Record<AgeCategory, string> = {
  existing: '2+ weeks old',
  last_week: '1 week old',
  this_week: 'This week',
};

/** Human-readable age labels used by the closed-ticket breakdown plugins */
export const CLOSED_TICKET_AGE_LABELS: Record<AgeCategory, string> = {
  existing: 'Closed 2+ weeks ago',
  last_week: 'Closed 1 week ago',
  this_week: 'Closed this week',
};

/** Age category display order in result names: existing → last_week → this_week */
const AGE_CATEGORIES: AgeCategory[] = ['existing', 'last_week', 'this_week'];

const AGE_NAME_SUFFIX: Record<AgeCategory, string> = {
  existing: 'Existing',
  last_week: 'Last Week',
  this_week: 'This Week',
};

export interface AgeBreakdownOptions {
  /** Key used inside `dimensions` (e.g. 'priority', 'status', 'assignee', 'team') */
  dimensionKey: string;
  /** Label used in result names and the first details entry (e.g. 'Priority') */
  dimensionLabel: string;
  /** Human-readable age labels for the 'Age' details entry */
  ageLabels: Record<AgeCategory, string>;
  /**
   * Sort mode:
   * - 'priority': dimension ascending by getPriorityOrder (P0 → P3), then age
   * - 'total-desc': dimension total count descending, then dimension name, then age
   */
  sortBy: 'priority' | 'total-desc';
}

/**
 * Group issues by a dimension value and age category, emitting one KpiResult
 * per non-empty (dimension, age category) pair.
 *
 * @param issues - Issues to group (callers apply their own done/open filter)
 * @param referenceDate - Reference date for age categorization (typically period end)
 * @param getDate - Date used for age categorization (created for open, resolved/updated for closed)
 * @param getDimension - Dimension accessor; null/empty values fall back to 'Unassigned'
 */
export function calculateAgeBreakdown(
  issues: TransformedIssue[],
  referenceDate: Date,
  getDate: (issue: TransformedIssue) => Date,
  getDimension: (issue: TransformedIssue) => string | null,
  options: AgeBreakdownOptions,
): KpiResult[] {
  const { dimensionKey, dimensionLabel, ageLabels, sortBy } = options;

  // Group tickets by dimension value and age category
  const ageGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

  for (const issue of issues) {
    const dimensionValue = getDimension(issue) || UNASSIGNED;
    if (!ageGroups[dimensionValue]) {
      ageGroups[dimensionValue] = {
        this_week: new Set(),
        last_week: new Set(),
        existing: new Set(),
      };
    }

    const ageCategory = getAgeCategory(getDate(issue), referenceDate);
    ageGroups[dimensionValue][ageCategory].add(issue.key);
  }

  // Convert to result format with age breakdown
  const results: KpiResult[] = [];

  for (const [dimensionValue, groups] of Object.entries(ageGroups)) {
    // Create separate results for each age category to enable stacked/grouped visualization
    for (const ageCategory of AGE_CATEGORIES) {
      const keys = groups[ageCategory];
      if (keys.size === 0) continue;

      results.push({
        name: `${dimensionLabel}: ${dimensionValue} (${AGE_NAME_SUFFIX[ageCategory]})`,
        value: keys.size,
        unit: 'tickets',
        dimensions: { [dimensionKey]: dimensionValue, ageCategory },
        ticketKeys: Array.from(keys),
        details: [
          { label: dimensionLabel, value: 0, unit: dimensionValue },
          { label: 'Age', value: 0, unit: ageLabels[ageCategory] },
        ],
      });
    }
  }

  if (sortBy === 'priority') {
    // Sort results by priority (ascending P0→P3), then by age category (existing → last_week → this_week)
    return results.sort((a, b) => {
      const orderA = getPriorityOrder(a.dimensions?.[dimensionKey] || '');
      const orderB = getPriorityOrder(b.dimensions?.[dimensionKey] || '');
      if (orderA !== orderB) return orderA - orderB;
      return ageRank(a) - ageRank(b);
    });
  }

  // Sort results by total count (descending), then by dimension name, then by age category
  const totals: Record<string, number> = {};
  for (const [dimensionValue, groups] of Object.entries(ageGroups)) {
    totals[dimensionValue] =
      groups.existing.size + groups.last_week.size + groups.this_week.size;
  }

  return results.sort((a, b) => {
    const valueA = a.dimensions?.[dimensionKey] || '';
    const valueB = b.dimensions?.[dimensionKey] || '';
    const totalA = totals[valueA] || 0;
    const totalB = totals[valueB] || 0;
    if (totalA !== totalB) return totalB - totalA; // Descending total count
    if (valueA !== valueB) return valueA.localeCompare(valueB);
    return ageRank(a) - ageRank(b); // Existing (0) → Last Week (1) → This Week (2)
  });
}

function ageRank(result: KpiResult): number {
  return AGE_ORDER[result.dimensions?.ageCategory as AgeCategory] ?? 999;
}
