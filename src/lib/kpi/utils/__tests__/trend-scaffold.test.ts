/**
 * Unit tests for the shared time-series trend scaffold (trend-scaffold.ts).
 *
 * Covers: zero-fill, incomplete-period exclusion from aggregation, the
 * incomplete detail marker, chronological ordering, and single vs
 * multi-series construction.
 *
 * The system clock is pinned so "complete" vs "incomplete" periods are
 * deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  preparePeriods,
  enumerateTrendPeriods,
  buildTrendPoints,
  buildSnapshotPoints,
  meanOfCompletePeriods,
  weightedMeanOfCompletePeriods,
  round2,
  INCOMPLETE_PERIOD_DETAIL,
} from '../trend-scaffold';
import type { TransformedIssue } from '../../types';

const D = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0);

function makeIssue(partial: Partial<TransformedIssue> & { key: string }): TransformedIssue {
  return {
    project: 'TEST',
    summary: 'Test issue',
    issueType: 'Task',
    priority: 'Medium',
    status: 'Open',
    statusCategory: 'In Progress',
    assignee: 'Unassigned',
    reporter: 'reporter@example.com',
    issueOwnerTeam: null,
    created: D(2024, 0, 2, 12),
    updated: D(2024, 0, 2, 12),
    resolved: null,
    dueDate: null,
    storyPoints: null,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...partial,
  } as TransformedIssue;
}

describe('trend-scaffold', () => {
  beforeEach(() => {
    // Mid-2024: all Jan-2024 periods are complete
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('preparePeriods (group + zero-fill)', () => {
    it('groups issues by period and zero-fills gaps', () => {
      const issues = [
        makeIssue({ key: 'A', resolved: D(2024, 0, 10, 12) }), // ISO W02
        makeIssue({ key: 'B', resolved: D(2024, 0, 24, 12) }), // ISO W04
      ];
      const min = D(2024, 0, 10);
      const max = D(2024, 0, 24);
      const grouped = preparePeriods(issues, 'weekly', (i) => i.resolved, min, max);

      const keys = Object.keys(grouped).sort();
      // W02, W03 (zero-filled), W04
      expect(keys).toEqual(['2024-W02', '2024-W03', '2024-W04']);
      expect(grouped['2024-W02']).toHaveLength(1);
      expect(grouped['2024-W03']).toHaveLength(0); // zero-filled
      expect(grouped['2024-W04']).toHaveLength(1);
    });
  });

  describe('buildTrendPoints (flow)', () => {
    it('builds chronologically-sorted points with isComplete flags', () => {
      const issues = [
        makeIssue({ key: 'A', resolved: D(2024, 0, 24, 12) }), // W04
        makeIssue({ key: 'B', resolved: D(2024, 0, 10, 12) }), // W02
      ];
      const grouped = preparePeriods(issues, 'weekly', (i) => i.resolved, D(2024, 0, 10), D(2024, 0, 24));

      const { points, hasIncompletePeriod } = buildTrendPoints(grouped, 'weekly', (iss) => ({
        value: iss.length,
        count: iss.length,
      }));

      expect(hasIncompletePeriod).toBe(false);
      expect(points.map((p) => p.period)).toEqual(['2024-W02', '2024-W03', '2024-W04']);
      expect(points.map((p) => p.value)).toEqual([1, 0, 1]);
      expect(points.every((p) => p.isComplete === true)).toBe(true);
    });

    it('flags the current period as incomplete', () => {
      vi.useFakeTimers({ now: D(2024, 0, 20, 12) }); // W03 (ends Jan 21) still open
      const issues = [makeIssue({ key: 'A', resolved: D(2024, 0, 17, 12) })]; // W03
      const grouped = preparePeriods(issues, 'weekly', (i) => i.resolved, D(2024, 0, 17), D(2024, 0, 17));

      const { points, hasIncompletePeriod } = buildTrendPoints(grouped, 'weekly', (iss) => ({
        value: iss.length,
        count: iss.length,
      }));

      expect(hasIncompletePeriod).toBe(true);
      expect(points).toHaveLength(1);
      expect(points[0].isComplete).toBe(false);
    });
  });

  describe('buildSnapshotPoints (stock)', () => {
    it('builds one point per enumerated period in order', () => {
      const periods = enumerateTrendPeriods(D(2024, 0, 1), D(2024, 0, 3), 'daily');
      const { points, hasIncompletePeriod } = buildSnapshotPoints(periods, (_p) => ({
        value: 5,
        count: 5,
      }));

      expect(hasIncompletePeriod).toBe(false);
      expect(points).toHaveLength(3);
      expect(points.map((p) => p.value)).toEqual([5, 5, 5]);
      expect(points.every((p) => p.isComplete)).toBe(true);
    });

    it('flags incomplete when the range includes the current period', () => {
      vi.useFakeTimers({ now: D(2024, 0, 2, 12) }); // Jan 2 daily period is open
      const periods = enumerateTrendPeriods(D(2024, 0, 1), D(2024, 0, 2), 'daily');
      const { hasIncompletePeriod } = buildSnapshotPoints(periods, () => ({ value: 1, count: 1 }));
      expect(hasIncompletePeriod).toBe(true);
    });
  });

  describe('aggregation over complete periods', () => {
    const pt = (value: number, count: number, isComplete: boolean) => ({
      period: 'p',
      date: new Date(),
      value,
      count,
      isComplete,
    });

    it('meanOfCompletePeriods ignores incomplete points and includes zero periods', () => {
      const points = [pt(2, 2, true), pt(0, 0, true), pt(100, 1, false)];
      expect(meanOfCompletePeriods(points)).toBe(1); // (2 + 0) / 2
    });

    it('meanOfCompletePeriods returns 0 with no complete periods', () => {
      expect(meanOfCompletePeriods([pt(5, 1, false)])).toBe(0);
    });

    it('weightedMeanOfCompletePeriods weights by count', () => {
      const points = [pt(100, 1, true), pt(0, 3, true)];
      // (100*1 + 0*3) / 4 = 25
      expect(weightedMeanOfCompletePeriods(points)).toBe(25);
    });

    it('weightedMeanOfCompletePeriods excludes incomplete points', () => {
      const points = [pt(100, 1, true), pt(0, 100, false)];
      expect(weightedMeanOfCompletePeriods(points)).toBe(100);
    });

    it('requireCount=true drops zero-count periods from the mean', () => {
      const points = [pt(4, 1, true), pt(99, 0, true)];
      // Without requireCount: (4*1 + 99*0)/1 = 4 (zero weight anyway)
      expect(weightedMeanOfCompletePeriods(points, true)).toBe(4);
    });

    it('round2 rounds to two decimals', () => {
      expect(round2(0.755)).toBe(0.76);
      expect(round2(2)).toBe(2);
    });
  });

  describe('INCOMPLETE_PERIOD_DETAIL marker', () => {
    it('has the standard label/value/unit', () => {
      expect(INCOMPLETE_PERIOD_DETAIL).toEqual({
        label: 'ℹ️ Current period incomplete',
        value: 1,
        unit: 'partial',
      });
    });
  });
});
