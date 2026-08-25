/**
 * Time-Series utility functions for KPI plugins
 * @MX:ANCHOR: Shared time-series logic
 * @MX:REASON: Centralizes period key/end/enumeration calculations to prevent
 * duplication and bugs.
 *
 * @MX:WARN: ALL period bucketing uses the LOCAL calendar. Weekly periods are
 * local-time Monday-based weeks, keyed by the week's local Monday date
 * (YYYY-MM-DD) — the SAME convention as the dashboard cards
 * (getLocalMondayWeekBounds, src/lib/utils/week-boundaries.ts). This was a
 * 2026-08 product decision: "weeks start on Monday and the dashboard follows
 * the same". Before that, weekly buckets used UTC ISO-8601 week numbers and
 * diverged from the cards near week edges. Daily/monthly keys likewise use
 * local date components. Stored time-series created before the change carry
 * old-format keys; they are replaced on recalculation.
 */

import { type TransformedIssue } from '../types';
import { type TimeInterval } from '../types-time-series';
import { getLocalMondayWeekBounds } from '@/lib/utils/week-boundaries';

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** Local-calendar date key (YYYY-MM-DD) for a Date. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Monday (local midnight) of the local week containing `date`. */
export function getLocalMondayOf(date: Date): Date {
  return getLocalMondayWeekBounds(date).thisWeekStart;
}

/**
 * Get period key for a date based on interval (local calendar components).
 */
export function getPeriodKey(date: Date, interval: TimeInterval): string {
  switch (interval) {
    case 'daily':
      return localDateKey(date);
    case 'weekly':
      // Week identified by its local Monday date — matches the dashboard
      // cards' Monday-week convention and sorts lexicographically.
      return localDateKey(getLocalMondayOf(date));
    case 'monthly':
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    default:
      // @MX:WARN: Pad like the monthly case — unpadded months would break
      // lexicographic sorting of period keys (e.g. '2026-9' > '2026-10').
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }
}

/**
 * Parse a YYYY-MM-DD key into a local-midnight Date.
 */
function parseLocalDateKey(periodKey: string): Date {
  const [y, m, d] = periodKey.split('-').map((part) => parseInt(part, 10));
  return new Date(y, m - 1, d);
}

/**
 * Get the end date of a time period in local time.
 */
export function getPeriodEnd(periodKey: string, interval: TimeInterval): Date {
  switch (interval) {
    case 'daily': {
      const d = parseLocalDateKey(periodKey);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case 'weekly': {
      // Key is the week's local Monday; the period ends on the local Sunday.
      const monday = parseLocalDateKey(periodKey);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return sunday;
    }
    case 'monthly': {
      const [y, m] = periodKey.split('-').map((part) => parseInt(part, 10));
      const d = new Date(y, m, 0); // Day 0 of the next month = last day of month m
      d.setHours(23, 59, 59, 999);
      return d;
    }
    default: {
      return new Date();
    }
  }
}

/**
 * Check if a period is complete (not the current partial period)
 */
export function isPeriodComplete(periodEnd: Date, currentDate: Date = new Date()): boolean {
  // Add 1 day buffer to ensure period is fully complete
  const completeThreshold = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);
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
 * Enumerate all period keys between two dates (local calendar stepping).
 */
export function enumeratePeriodKeys(
  start: Date,
  end: Date,
  interval: TimeInterval
): string[] {
  const keys: string[] = [];
  const keySet = new Set<string>();
  // Local midnight of the start's local date.
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());

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

    // Advance current date in local time
    if (interval === 'daily') {
      current.setDate(current.getDate() + 1);
    } else if (interval === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else if (interval === 'monthly') {
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
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
