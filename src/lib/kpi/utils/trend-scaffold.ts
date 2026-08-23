/**
 * Shared time-series trend scaffold for KPI plugins
 *
 * @MX:ANCHOR: Trend scaffold - single implementation of the repeated
 * group -> zero-fill -> build-points -> sort -> aggregate trend pipeline.
 * @MX:REASON: ~8 time-series plugins hand-rolled the same scaffold
 * (groupByTimeInterval -> enumeratePeriodKeys -> isComplete flagging ->
 * chronological sort -> aggregate over COMPLETE periods only -> incomplete
 * period detail). Centralizing it prevents drift and keeps every trend
 * consistent with the ISO-week bucketing documented in time-series-utils.ts.
 *
 * Two structural families exist across the plugins:
 *  - "flow" trends (throughput, processing time, SLA compliance, priority
 *    inflow, time-in-status): issues are bucketed by an event date and each
 *    period's value is derived from the issues in that bucket. Use
 *    `preparePeriods` + `buildTrendPoints` (+ an aggregate helper).
 *  - "stock" trends (open tickets by assignee, cumulative flow): each period
 *    is a point-in-time snapshot counted from the whole issue set. Use
 *    `enumerateTrendPeriods` + `buildTrendPoints` with a per-period counter.
 */

import type { TransformedIssue } from '../types';
import type { TimeSeriesDataPoint, TimeInterval } from '../types-time-series';
import {
  getPeriodEnd,
  isPeriodComplete,
  groupByTimeInterval,
  enumeratePeriodKeys,
} from './time-series-utils';

/** A period bucket with its resolved end date and completeness flag. */
export interface TrendPeriod {
  key: string;
  end: Date;
  isComplete: boolean;
}

/**
 * The per-issue "incomplete period" detail marker. Every trend plugin pushes
 * this (or a list containing it) when any rendered period is still open.
 */
export const INCOMPLETE_PERIOD_DETAIL = {
  label: 'ℹ️ Current period incomplete',
  value: 1,
  unit: 'partial',
} as const;

/**
 * Group issues into period buckets by an event date, then zero-fill every
 * period in `[minDate, maxDate]` so quiet periods still render as 0.
 *
 * This reproduces the shared "steps 1 & 2" of the flow-style plugins.
 */
export function preparePeriods(
  issues: TransformedIssue[],
  interval: TimeInterval,
  dateExtractor: (issue: TransformedIssue) => Date | null,
  minDate: Date,
  maxDate: Date
): Record<string, TransformedIssue[]> {
  const grouped = groupByTimeInterval(issues, interval, dateExtractor);

  const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);
  for (const key of allPeriodKeys) {
    if (!grouped[key]) {
      grouped[key] = [];
    }
  }
  return grouped;
}

/**
 * Enumerate every period in `[start, end]` with its end date and completeness
 * flag, in chronological order. Used by stock/snapshot trends and anywhere the
 * caller already owns the per-period values.
 */
export function enumerateTrendPeriods(
  start: Date,
  end: Date,
  interval: TimeInterval
): TrendPeriod[] {
  return enumeratePeriodKeys(start, end, interval).map((key) => {
    const periodEnd = getPeriodEnd(key, interval);
    return { key, end: periodEnd, isComplete: isPeriodComplete(periodEnd) };
  });
}

/**
 * Build chronologically-sorted time-series points from period buckets.
 *
 * `pointFor` maps a period's issues to `{ value, count }`. Both the point's
 * `date` and `isComplete` are derived from the period key so every plugin
 * flags partial periods identically.
 *
 * `hasIncompletePeriod` is reported via the returned object rather than a
 * callback so callers can attach `INCOMPLETE_PERIOD_DETAIL` wherever their
 * result shape requires it (single result vs first-of-many).
 */
export function buildTrendPoints(
  grouped: Record<string, TransformedIssue[]>,
  interval: TimeInterval,
  pointFor: (issues: TransformedIssue[], period: TrendPeriod) => { value: number; count: number }
): { points: TimeSeriesDataPoint[]; hasIncompletePeriod: boolean } {
  const points: TimeSeriesDataPoint[] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);
    if (!isComplete) {
      hasIncompletePeriod = true;
    }

    const { value, count } = pointFor(issues, { key: periodKey, end: periodEnd, isComplete });
    points.push({ period: periodKey, date: periodEnd, value, count, isComplete });
  }

  // Sort by date (chronological)
  // @MX:WARN: `new Date(...)` normalizes `Date | string` (ISO string after JSON API round-trip)
  points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { points, hasIncompletePeriod };
}

/**
 * Resolve a set of period keys into `TrendPeriod` objects (end date +
 * completeness). `keys` need not be sorted; callers that need chronological
 * order can sort the input or rely on `buildSnapshotPoints`' defensive sort.
 */
export function resolveTrendPeriods(keys: string[], interval: TimeInterval): TrendPeriod[] {
  return keys.map((key) => {
    const end = getPeriodEnd(key, interval);
    return { key, end, isComplete: isPeriodComplete(end) };
  });
}

/**
 * Snapshot variant of `buildTrendPoints` for stock trends: instead of bucketed
 * issues, the caller supplies a value/count for each enumerated period.
 */
export function buildSnapshotPoints(
  periods: TrendPeriod[],
  pointFor: (period: TrendPeriod) => { value: number; count: number }
): { points: TimeSeriesDataPoint[]; hasIncompletePeriod: boolean } {
  const points: TimeSeriesDataPoint[] = [];
  let hasIncompletePeriod = false;

  for (const period of periods) {
    if (!period.isComplete) {
      hasIncompletePeriod = true;
    }
    const { value, count } = pointFor(period);
    points.push({ period: period.key, date: period.end, value, count, isComplete: period.isComplete });
  }

  // Snapshot periods are already chronological from enumerateTrendPeriods,
  // but sort defensively to match the flow path's guarantees.
  // @MX:WARN: `new Date(...)` normalizes `Date | string` (ISO string after JSON API round-trip)
  points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return { points, hasIncompletePeriod };
}

/**
 * Simple mean of point values over COMPLETE periods only.
 * Zero-value periods count toward the denominator (they were zero-filled on
 * purpose, so a quiet week still lowers the average).
 */
export function meanOfCompletePeriods(points: TimeSeriesDataPoint[]): number {
  const complete = points.filter((p) => p.isComplete);
  if (complete.length === 0) return 0;
  return complete.reduce((sum, p) => sum + p.value, 0) / complete.length;
}

/**
 * Count-weighted mean of point values over COMPLETE periods only.
 *
 * @param requireCount When true (processing-time, time-in-status) periods with
 *   `count === 0` are excluded entirely; when false (SLA compliance) they are
 *   kept but contribute nothing because their weight is 0.
 */
export function weightedMeanOfCompletePeriods(
  points: TimeSeriesDataPoint[],
  requireCount = false
): number {
  const complete = points.filter((p) => p.isComplete && (!requireCount || p.count > 0));
  const totalCount = complete.reduce((sum, p) => sum + p.count, 0);
  if (totalCount === 0) return 0;
  return complete.reduce((sum, p) => sum + p.value * p.count, 0) / totalCount;
}

/** Round to 2 decimal places, the codebase's standard display precision. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
