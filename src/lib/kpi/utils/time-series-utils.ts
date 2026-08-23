/**
 * Time-Series utility functions for KPI plugins
 * @MX:ANCHOR: Shared time-series logic
 * @MX:REASON: Centralizes complex ISO week and period calculations to prevent duplication and bugs
 *
 * @MX:WARN: TWO WEEK DEFINITIONS COEXIST IN THIS CODEBASE — DO NOT "UNIFY"
 * THEM WITHOUT A PRODUCT DECISION:
 * - The time-series trend plugins (this module) bucket periods using
 *   UTC ISO-8601 weeks (getWeekNumber / getISOWeekYear / getPeriodKey).
 * - The engine's weekly card buckets and weekly plugins (KpiEngine,
 *   weekly_ticket_list, age-category breakdowns) use LOCAL-time Monday-based
 *   weeks via getLocalMondayWeekBounds (src/lib/utils/week-boundaries.ts).
 * Values near week edges (and around DST transitions) can therefore differ
 * between a trend chart bucket and a weekly card bucket for the same instant.
 * @MX:REASON: Unifying would silently change reported KPI numbers; the split
 * is documented here instead of fixed so the divergence is a conscious choice.
 */

import { type TransformedIssue } from '../types';
import { type TimeInterval } from '../types-time-series';

/**
 * Get ISO week number using UTC
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get ISO week-numbering year
 */
export function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

/**
 * Get period key for a date based on interval
 */
export function getPeriodKey(date: Date, interval: TimeInterval): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  switch (interval) {
    case 'daily':
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    case 'weekly': {
      const isoYear = getISOWeekYear(date);
      const week = getWeekNumber(date);
      return `${isoYear}-W${week.toString().padStart(2, '0')}`;
    }
    case 'monthly':
      return `${year}-${month.toString().padStart(2, '0')}`;
    default:
      // @MX:WARN: Pad like the monthly case — unpadded months would break
      // lexicographic sorting of period keys (e.g. '2026-9' > '2026-10').
      return `${year}-${month.toString().padStart(2, '0')}`;
  }
}

/**
 * Get the end date of a time period in UTC
 */
export function getPeriodEnd(periodKey: string, interval: TimeInterval): Date {
  const parts = periodKey.split('-');
  const year = parseInt(parts[0], 10);

  switch (interval) {
    case 'daily': {
      const d = new Date(Date.UTC(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      d.setUTCHours(23, 59, 59, 999);
      return d;
    }
    case 'weekly': {
      const week = parseInt(parts[1].replace('W', ''), 10);
      return getWeekEndDate(year, week);
    }
    case 'monthly': {
      const month = parseInt(parts[1], 10);
      const d = new Date(Date.UTC(year, month, 0)); // Last day of month
      d.setUTCHours(23, 59, 59, 999);
      return d;
    }
    default: {
      return new Date();
    }
  }
}

/**
 * Get the end date of an ISO week in UTC
 */
export function getWeekEndDate(year: number, week: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const days = (week - 1) * 7 + 4 - (jan1.getUTCDay() || 7);
  const endDate = new Date(Date.UTC(year, 0, 1 + days));
  // Set to Sunday (end of ISO week)
  endDate.setUTCDate(endDate.getUTCDate() + (7 - (endDate.getUTCDay() || 7)) % 7);
  endDate.setUTCHours(23, 59, 59, 999);
  return endDate;
}

/**
 * Check if a period is complete (not the current partial period)
 */
export function isPeriodComplete(periodEnd: Date, currentDate: Date = new Date()): boolean {
  // Add 1 day buffer to ensure period is fully complete
  const bufferDays = 1;
  const completeThreshold = new Date(periodEnd.getTime());
  completeThreshold.setUTCDate(completeThreshold.getUTCDate() + bufferDays);

  return currentDate > completeThreshold;
}

/**
 * Group issues by time interval
 */
export function groupByTimeInterval(
  issues: TransformedIssue[],
  interval: TimeInterval,
  dateExtractor: (issue: TransformedIssue) => Date | null
): Record<string, TransformedIssue[]> {
  const grouped: Record<string, TransformedIssue[]> = {};

  for (const issue of issues) {
    const date = dateExtractor(issue);
    if (!date) continue;
    const key = getPeriodKey(date, interval);

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(issue);
  }

  return grouped;
}

/**
 * Enumerate all period keys between two dates
 */
export function enumeratePeriodKeys(
  start: Date,
  end: Date,
  interval: TimeInterval
): string[] {
  const keys: string[] = [];
  const keySet = new Set<string>();
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  current.setUTCHours(0, 0, 0, 0);
  
  const endKey = getPeriodKey(end, interval);
  let currentKey = '';
  
  // Limit iterations to prevent infinite loops (max 10 years of daily data)
  let iterations = 0;
  const maxIterations = 365 * 10;

  while (currentKey !== endKey && current <= end && iterations < maxIterations) {
    iterations++;
    currentKey = getPeriodKey(current, interval);
    if (!keySet.has(currentKey)) {
      keys.push(currentKey);
      keySet.add(currentKey);
    }
    
    // Advance current date
    if (interval === 'daily') {
      current.setUTCDate(current.getUTCDate() + 1);
    } else if (interval === 'weekly') {
      current.setUTCDate(current.getUTCDate() + 7);
    } else if (interval === 'monthly') {
      current.setUTCMonth(current.getUTCMonth() + 1);
      current.setUTCDate(1);
    }
  }
  
  // Ensure the end key is included
  const finalEndKey = getPeriodKey(end, interval);
  if (!keySet.has(finalEndKey)) {
     keys.push(finalEndKey);
     keySet.add(finalEndKey);
  }

  return keys;
}
