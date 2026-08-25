/**
 * Local-calendar bucketing for time-series periods (TDD)
 *
 * Product decision (2026-08): weeks start on Monday and trend bucketing must
 * follow the SAME convention as the dashboard cards. The cards use local-time
 * Monday weeks (getLocalMondayWeekBounds, src/lib/utils/week-boundaries.ts);
 * these tests pin the time-series period helpers to that convention:
 *
 *  - weekly keys identify the week by its LOCAL Monday date (YYYY-MM-DD)
 *  - weekly/daily/monthly keys and period ends use LOCAL calendar components
 *  - enumeration steps in local time
 *
 * The oracle for week membership is getLocalMondayWeekBounds itself, so the
 * tests express "trend buckets == card buckets" directly and hold in any
 * timezone the suite runs in.
 */
import { describe, it, expect } from 'vitest';
import {
  getPeriodKey,
  getPeriodEnd,
  enumeratePeriodKeys,
  isPeriodComplete,
} from '../time-series-utils';
import { getLocalMondayWeekBounds } from '@/lib/utils/week-boundaries';

/** Local date key (YYYY-MM-DD) helper mirroring the expected weekly key format. */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the local week containing `d`, per the dashboard card convention. */
function cardWeekMonday(d: Date): Date {
  return getLocalMondayWeekBounds(d).thisWeekStart;
}

describe('weekly period keys — local Monday weeks (dashboard convention)', () => {
  it('keys a date by the Monday of its local week', () => {
    // Wednesday local — its week started two days earlier, on Monday.
    const wednesday = new Date(2026, 7, 12, 15, 30); // 2026-08-12 is a Wednesday
    const key = getPeriodKey(wednesday, 'weekly');
    expect(key).toBe(localDateKey(cardWeekMonday(wednesday)));
    expect(key).toBe('2026-08-10'); // the Monday of that week
  });

  it('keys Sunday into the week that started the previous Monday', () => {
    const sunday = new Date(2026, 7, 16, 23, 0); // 2026-08-16 Sunday
    expect(getPeriodKey(sunday, 'weekly')).toBe('2026-08-10');
  });

  it('keys Monday 00:00 into its own week', () => {
    const monday = new Date(2026, 7, 17, 0, 0); // 2026-08-17 Monday
    expect(getPeriodKey(monday, 'weekly')).toBe('2026-08-17');
  });

  it('matches the card week boundaries for instants around the week edge', () => {
    // The requirement: trend bucketing follows the dashboard cards. For every
    // instant, the trend week key must be the Monday the cards consider the
    // start of the current week.
    const probes = [
      new Date(2026, 7, 16, 23, 59, 59), // Sunday end
      new Date(2026, 7, 17, 0, 0, 0),    // Monday start
      new Date(2026, 7, 17, 12, 0, 0),   // Monday midday
      new Date(2026, 0, 1, 9, 0, 0),     // year-boundary week
    ];
    for (const instant of probes) {
      expect(getPeriodKey(instant, 'weekly')).toBe(localDateKey(cardWeekMonday(instant)));
    }
  });

  it('weekly keys sort lexicographically in chronological order', () => {
    const keys = [
      getPeriodKey(new Date(2026, 11, 30, 12), 'weekly'), // late December
      getPeriodKey(new Date(2026, 0, 2, 12), 'weekly'),   // early January
      getPeriodKey(new Date(2026, 7, 12, 12), 'weekly'),  // August
    ];
    expect([...keys].sort()).toEqual([
      getPeriodKey(new Date(2026, 0, 2, 12), 'weekly'),
      getPeriodKey(new Date(2026, 7, 12, 12), 'weekly'),
      getPeriodKey(new Date(2026, 11, 30, 12), 'weekly'),
    ]);
  });
});

describe('weekly period ends — local Sunday 23:59:59.999', () => {
  it('ends the week on the local Sunday after the key Monday', () => {
    const end = getPeriodEnd('2026-08-10', 'weekly'); // Monday key
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(16); // the Sunday of that week
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('round-trips: the end of a week belongs to the same week key', () => {
    const key = '2026-08-10';
    const end = getPeriodEnd(key, 'weekly');
    expect(getPeriodKey(end, 'weekly')).toBe(key);
  });

  it('handles year-boundary weeks', () => {
    // Monday 2026-12-28 → Sunday 2027-01-03
    const end = getPeriodEnd('2026-12-28', 'weekly');
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(3);
  });
});

describe('weekly enumeration — local steps', () => {
  it('enumerates consecutive local-Monday keys including both endpoint weeks', () => {
    // Wednesday 2026-08-12 through Tuesday 2026-08-25 → weeks of 08-10, 08-17, 08-24
    const keys = enumeratePeriodKeys(new Date(2026, 7, 12), new Date(2026, 7, 25), 'weekly');
    expect(keys).toEqual(['2026-08-10', '2026-08-17', '2026-08-24']);
  });

  it('single-week ranges produce one key', () => {
    const keys = enumeratePeriodKeys(new Date(2026, 7, 12), new Date(2026, 7, 14), 'weekly');
    expect(keys).toEqual(['2026-08-10']);
  });
});

describe('daily and monthly keys — local calendar components', () => {
  it('daily keys use the local date', () => {
    const lateEvening = new Date(2026, 7, 12, 23, 30); // local Aug 12
    expect(getPeriodKey(lateEvening, 'daily')).toBe('2026-08-12');
  });

  it('daily period end is the local end of that day', () => {
    const end = getPeriodEnd('2026-08-12', 'daily');
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(12);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('monthly keys use the local month', () => {
    const firstLocalHour = new Date(2026, 0, 31, 23, 45); // local Jan 31
    expect(getPeriodKey(firstLocalHour, 'monthly')).toBe('2026-01');
  });

  it('monthly period end is the local last day of the month', () => {
    const end = getPeriodEnd('2026-02', 'monthly');
    expect(end.getMonth()).toBe(1);
    expect(end.getDate()).toBe(28); // 2026 is not a leap year
    expect(end.getHours()).toBe(23);
  });

  it('daily enumeration steps local days', () => {
    const keys = enumeratePeriodKeys(new Date(2026, 7, 12), new Date(2026, 7, 14), 'daily');
    expect(keys).toEqual(['2026-08-12', '2026-08-13', '2026-08-14']);
  });
});

describe('period completeness (unchanged semantics, local ends)', () => {
  it('flags a past week complete and the current week incomplete', () => {
    const now = new Date();
    const thisMonday = cardWeekMonday(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    expect(isPeriodComplete(getPeriodEnd(localDateKey(lastMonday), 'weekly'))).toBe(true);
    expect(isPeriodComplete(getPeriodEnd(localDateKey(thisMonday), 'weekly'))).toBe(false);
  });
});
