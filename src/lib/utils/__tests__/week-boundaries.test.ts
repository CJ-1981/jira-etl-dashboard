/**
 * Tests for getLocalMondayWeekBounds — the shared local-time Monday-based
 * week-boundary helper used by the KPI engine and weekly plugins.
 *
 * The expected values are pinned with vi.useFakeTimers and computed by an
 * inline copy of the legacy engine algorithm (buildPreprocessed, pre-refactor)
 * so the tests assert the EXACT behavior that existed before the helper was
 * extracted. Any deviation means the refactor changed KPI numbers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getLocalMondayWeekBounds } from '../week-boundaries';

/**
 * Legacy inline computation from KpiEngine.buildPreprocessed (pre-refactor).
 * Kept here verbatim as the behavior oracle.
 */
function legacyEngineWeekBounds(now: Date) {
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
  return { thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd };
}

function assertLocalMidnight(d: Date) {
  expect(d.getHours()).toBe(0);
  expect(d.getMinutes()).toBe(0);
  expect(d.getSeconds()).toBe(0);
  expect(d.getMilliseconds()).toBe(0);
}

describe('getLocalMondayWeekBounds', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('on a Monday', () => {
    beforeEach(() => {
      // Mon 2026-08-17 14:30 local
      vi.useFakeTimers({ now: new Date(2026, 7, 17, 14, 30) });
    });

    it('starts the current week at that same Monday local midnight', () => {
      const b = getLocalMondayWeekBounds(new Date());
      expect(b.thisWeekStart.getFullYear()).toBe(2026);
      expect(b.thisWeekStart.getMonth()).toBe(7);
      expect(b.thisWeekStart.getDate()).toBe(17);
      expect(b.thisWeekStart.getDay()).toBe(1); // Monday
      assertLocalMidnight(b.thisWeekStart);
    });

    it('ends the current week at the following Monday local midnight (exclusive)', () => {
      const b = getLocalMondayWeekBounds(new Date());
      expect(b.thisWeekEnd.getDate()).toBe(24);
      expect(b.thisWeekEnd.getDay()).toBe(1); // Monday
      assertLocalMidnight(b.thisWeekEnd);
    });

    it('bounds the previous week from the prior Monday to this Monday', () => {
      const b = getLocalMondayWeekBounds(new Date());
      expect(b.lastWeekStart.getDate()).toBe(10);
      expect(b.lastWeekStart.getDay()).toBe(1); // Monday
      assertLocalMidnight(b.lastWeekStart);
      // lastWeekEnd equals thisWeekStart in value (exclusive end)
      expect(b.lastWeekEnd.getTime()).toBe(b.thisWeekStart.getTime());
    });
  });

  describe('on a Sunday', () => {
    beforeEach(() => {
      // Sun 2026-08-23 09:15 local — the week started the previous Monday
      vi.useFakeTimers({ now: new Date(2026, 7, 23, 9, 15) });
    });

    it('starts the current week at the previous Monday (day === 0 -> -6 adjustment)', () => {
      const b = getLocalMondayWeekBounds(new Date());
      expect(b.thisWeekStart.getDate()).toBe(17); // Mon Aug 17
      expect(b.thisWeekStart.getMonth()).toBe(7);
      expect(b.thisWeekStart.getDay()).toBe(1); // Monday
      assertLocalMidnight(b.thisWeekStart);
    });

    it('matches the legacy engine computation exactly', () => {
      const now = new Date();
      const expected = legacyEngineWeekBounds(now);
      const actual = getLocalMondayWeekBounds(new Date());
      expect(actual.thisWeekStart.getTime()).toBe(expected.thisWeekStart.getTime());
      expect(actual.thisWeekEnd.getTime()).toBe(expected.thisWeekEnd.getTime());
      expect(actual.lastWeekStart.getTime()).toBe(expected.lastWeekStart.getTime());
      expect(actual.lastWeekEnd.getTime()).toBe(expected.lastWeekEnd.getTime());
    });
  });

  describe('on a mid-week day', () => {
    beforeEach(() => {
      // Wed 2026-08-19 22:45 local
      vi.useFakeTimers({ now: new Date(2026, 7, 19, 22, 45) });
    });

    it('starts the current week at the Monday of that calendar week', () => {
      const b = getLocalMondayWeekBounds(new Date());
      expect(b.thisWeekStart.getDate()).toBe(17); // Mon Aug 17
      expect(b.thisWeekStart.getDay()).toBe(1); // Monday
      assertLocalMidnight(b.thisWeekStart);
      expect(b.thisWeekEnd.getDate()).toBe(24); // Mon Aug 24 (exclusive)
      expect(b.lastWeekStart.getDate()).toBe(10); // Mon Aug 10
      expect(b.lastWeekEnd.getTime()).toBe(b.thisWeekStart.getTime());
    });

    it('matches the legacy engine computation exactly', () => {
      const expected = legacyEngineWeekBounds(new Date());
      const actual = getLocalMondayWeekBounds(new Date());
      expect(actual.thisWeekStart.getTime()).toBe(expected.thisWeekStart.getTime());
      expect(actual.thisWeekEnd.getTime()).toBe(expected.thisWeekEnd.getTime());
      expect(actual.lastWeekStart.getTime()).toBe(expected.lastWeekStart.getTime());
      expect(actual.lastWeekEnd.getTime()).toBe(expected.lastWeekEnd.getTime());
    });
  });

  it('crosses a month boundary correctly (Sat 2026-08-01 -> Mon 2026-07-27)', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 1, 8, 0) }); // Sat Aug 1 2026
    const b = getLocalMondayWeekBounds(new Date());
    expect(b.thisWeekStart.getMonth()).toBe(6); // July
    expect(b.thisWeekStart.getDate()).toBe(27); // Mon Jul 27
    expect(b.thisWeekStart.getDay()).toBe(1);
    assertLocalMidnight(b.thisWeekStart);

    const expected = legacyEngineWeekBounds(new Date());
    expect(b.thisWeekStart.getTime()).toBe(expected.thisWeekStart.getTime());
    expect(b.thisWeekEnd.getTime()).toBe(expected.thisWeekEnd.getTime());
    expect(b.lastWeekStart.getTime()).toBe(expected.lastWeekStart.getTime());
    expect(b.lastWeekEnd.getTime()).toBe(expected.lastWeekEnd.getTime());
  });

  it('crosses a year boundary correctly (Thu 2026-01-01 -> Mon 2025-12-29)', () => {
    vi.useFakeTimers({ now: new Date(2026, 0, 1, 12, 0) }); // Thu Jan 1 2026
    const b = getLocalMondayWeekBounds(new Date());
    expect(b.thisWeekStart.getFullYear()).toBe(2025);
    expect(b.thisWeekStart.getMonth()).toBe(11); // December
    expect(b.thisWeekStart.getDate()).toBe(29); // Mon Dec 29 2025
    expect(b.thisWeekStart.getDay()).toBe(1);
    assertLocalMidnight(b.thisWeekStart);

    const expected = legacyEngineWeekBounds(new Date());
    expect(b.thisWeekStart.getTime()).toBe(expected.thisWeekStart.getTime());
    expect(b.thisWeekEnd.getTime()).toBe(expected.thisWeekEnd.getTime());
    expect(b.lastWeekStart.getTime()).toBe(expected.lastWeekStart.getTime());
    expect(b.lastWeekEnd.getTime()).toBe(expected.lastWeekEnd.getTime());
  });

  it('uses the provided argument rather than the current time', () => {
    // No fake timers: pass an explicit date far from "now".
    const input = new Date(2024, 2, 13, 18, 20); // Wed Mar 13 2024
    const b = getLocalMondayWeekBounds(input);
    expect(b.thisWeekStart.getDate()).toBe(11); // Mon Mar 11 2024
    expect(b.thisWeekStart.getMonth()).toBe(2);
    expect(b.thisWeekStart.getFullYear()).toBe(2024);
    assertLocalMidnight(b.thisWeekStart);

    const expected = legacyEngineWeekBounds(input);
    expect(b.thisWeekStart.getTime()).toBe(expected.thisWeekStart.getTime());
    expect(b.thisWeekEnd.getTime()).toBe(expected.thisWeekEnd.getTime());
    expect(b.lastWeekStart.getTime()).toBe(expected.lastWeekStart.getTime());
    expect(b.lastWeekEnd.getTime()).toBe(expected.lastWeekEnd.getTime());
  });

  it('does not mutate its input', () => {
    const input = new Date(2026, 7, 19, 22, 45); // Wed Aug 19 2026
    const snapshot = input.getTime();
    getLocalMondayWeekBounds(input);
    expect(input.getTime()).toBe(snapshot);
  });
});
