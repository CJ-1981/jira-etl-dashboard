/**
 * Statute-pinned regression suite for the German holiday module (SPEC-HOLIDAY-001).
 *
 * The expected matrix below is hand-derived from German holiday statutes and the
 * law findings recorded in .moai/specs/SPEC-HOLIDAY-001/research.md (§2). It is
 * deliberately NOT generated from feiertagejs (or any library): this suite is an
 * independent oracle that stays valid when the runtime library is replaced or
 * bumped. Statute rules encoded here:
 *
 * - National statutory holidays (no federal law exists; every state Feiertag
 *   list shares these): Jan 1, Good Friday, Easter Monday, May 1, Ascension
 *   Day (+39), Whit Monday (+50), Oct 3, Dec 25, Dec 26.
 * - Reformation Day (Oct 31): BB/MV/SN/ST/TH since reunification; HB/HH/NI/SH
 *   permanent only from 2018 (2018 four-state law, Landtag Niedersachsen
 *   Drucksache 18/827); nationwide one-off in 2017 (500th anniversary).
 *   NW/HE/RP/SL have NO Reformation Day (their 2017 holiday was a one-time law).
 * - Buß- und Bettag: SN only (§ 1(1) SächsSFG); date = Wednesday before the
 *   last Sunday of the church year = 11 days before the first Advent Sunday.
 * - Weltkindertag (Sep 20): TH from 2019 (ThürFGtG § 2(1)).
 * - Frauentag (Mar 8): BE from 2019; MV from 2023.
 * - Epiphany (Jan 6): BW/BY/ST. All Saints' Day (Nov 1): BW/BY/NW/RP/SL.
 * - Corpus Christi (Easter +60): BW/BY/HE/NW/RP/SL (partial SN/TH coverage is
 *   municipal and correctly omitted at state granularity).
 * - Assumption Day (Aug 15): SL statewide; BY listed too (in law only
 *   majority-Catholic communities — a documented state-granularity limitation,
 *   matching the adapter/library modeling rather than sub-state rules).
 * - Ostersonntag/Pfingstsonntag are NOT part of the nationwide statutory set
 *   and must not appear in the national scope. Brandenburg is the one state
 *   whose Feiertagsgesetz lists them (as statewide holidays), so they are
 *   expected as BB state holidays here.
 *
 * Diff report — definition of "side": every diff line compares two sides,
 * "adapter output" (what german-holidays.ts returns at runtime) vs "expected
 * matrix" (the hand-derived law encoding in this file). The `expected` field is
 * the expected matrix entry, the `actual` field is the adapter output entry.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  GERMAN_STATES,
  calculateWorkingDays,
  getGermanHolidays,
  isGermanHoliday,
  type GermanHoliday,
  type GermanState,
} from '../german-holidays';

const STATE_CODES = [
  GERMAN_STATES.BW, GERMAN_STATES.BY, GERMAN_STATES.BE, GERMAN_STATES.BB,
  GERMAN_STATES.HB, GERMAN_STATES.HH, GERMAN_STATES.HE, GERMAN_STATES.MV,
  GERMAN_STATES.NI, GERMAN_STATES.NW, GERMAN_STATES.RP, GERMAN_STATES.SL,
  GERMAN_STATES.SN, GERMAN_STATES.ST, GERMAN_STATES.SH, GERMAN_STATES.TH,
] as const;

// UI-allowed range floor (HolidaysPanel clamps to 2000..currentYear+5).
const CURRENT_YEAR = new Date().getFullYear();
const FIRST_YEAR = 2000;
const LAST_YEAR = CURRENT_YEAR + 5;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

// ---------------------------------------------------------------------------
// Calendar helpers (independent of the module under test and of any library)
// ---------------------------------------------------------------------------

/** Format a local Date as YYYY-MM-DD (the module's serialization contract). */
function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Easter Sunday via the Meeus/Jones/Butcher computus (Gregorian). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** First Advent Sunday: the first Sunday on or after Nov 27. */
function firstAdvent(year: number): Date {
  const advent = new Date(year, 10, 27);
  while (advent.getDay() !== 0) advent.setDate(advent.getDate() + 1);
  return advent;
}

// ---------------------------------------------------------------------------
// Law-derived expected matrix (see header for sources)
// ---------------------------------------------------------------------------

interface StatuteRuleBase {
  name: string; // German display name — must match adapter output
  national?: boolean; // applies nationwide (all 16 states)
  states?: readonly string[]; // state-scoped applicability
  fromYear?: number; // inclusive lower year bound
  toYear?: number; // inclusive upper year bound
}

interface FixedStatuteRule extends StatuteRuleBase {
  kind: 'fixed';
  month: number;
  day: number;
}

interface EasterOffsetStatuteRule extends StatuteRuleBase {
  kind: 'easter-offset';
  offset: number; // days from Easter Sunday
}

interface BussBettagStatuteRule extends StatuteRuleBase {
  kind: 'bussbettag';
}

type StatuteRule = FixedStatuteRule | EasterOffsetStatuteRule | BussBettagStatuteRule;

const STATUTE_RULES: StatuteRule[] = [
  // National statutory holidays
  { name: 'Neujahr', kind: 'fixed', month: 1, day: 1, national: true },
  { name: 'Karfreitag', kind: 'easter-offset', offset: -2, national: true },
  { name: 'Ostermontag', kind: 'easter-offset', offset: 1, national: true },
  { name: 'Tag der Arbeit', kind: 'fixed', month: 5, day: 1, national: true },
  { name: 'Christi Himmelfahrt', kind: 'easter-offset', offset: 39, national: true },
  { name: 'Pfingstmontag', kind: 'easter-offset', offset: 50, national: true },
  { name: 'Tag der Deutschen Einheit', kind: 'fixed', month: 10, day: 3, national: true },
  { name: 'Erster Weihnachtstag', kind: 'fixed', month: 12, day: 25, national: true },
  { name: 'Zweiter Weihnachtstag', kind: 'fixed', month: 12, day: 26, national: true },
  // 2017 nationwide one-off (500th anniversary of the Reformation)
  { name: 'Reformationstag', kind: 'fixed', month: 10, day: 31, national: true, fromYear: 2017, toYear: 2017 },
  // State-scoped holidays
  { name: 'Heilige Drei Könige', kind: 'fixed', month: 1, day: 6, states: ['BW', 'BY', 'ST'] },
  { name: 'Frauentag', kind: 'fixed', month: 3, day: 8, states: ['BE'], fromYear: 2019 },
  { name: 'Frauentag', kind: 'fixed', month: 3, day: 8, states: ['MV'], fromYear: 2023 },
  { name: 'Mariä Himmelfahrt', kind: 'fixed', month: 8, day: 15, states: ['SL', 'BY'] }, // BY: community-level in law — documented state-granularity limitation
  { name: 'Weltkindertag', kind: 'fixed', month: 9, day: 20, states: ['TH'], fromYear: 2019 },
  { name: 'Reformationstag', kind: 'fixed', month: 10, day: 31, states: ['BB', 'MV', 'SN', 'ST', 'TH'] },
  { name: 'Reformationstag', kind: 'fixed', month: 10, day: 31, states: ['HB', 'HH', 'NI', 'SH'], fromYear: 2018 },
  { name: 'Allerheiligen', kind: 'fixed', month: 11, day: 1, states: ['BW', 'BY', 'NW', 'RP', 'SL'] },
  { name: 'Buß- und Bettag', kind: 'bussbettag', states: ['SN'] },
  { name: 'Fronleichnam', kind: 'easter-offset', offset: 60, states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'] },
  // Brandenburg's Feiertagsgesetz lists Ostersonntag/Pfingstsonntag statewide
  // (unique among the states) — they stay OUT of the national scope.
  { name: 'Ostersonntag', kind: 'easter-offset', offset: 0, states: ['BB'] },
  { name: 'Pfingstsonntag', kind: 'easter-offset', offset: 49, states: ['BB'] },
];

/**
 * Expected holiday set (Map date -> German name) for one year and one scope.
 * Scope 'national' = nationwide statutory set; a state code = national set
 * plus that state's own holidays (what isGermanHoliday(date, [state]) must see).
 */
function expectedMatrix(year: number, scope: 'national' | GermanState): Map<string, string> {
  const expected = new Map<string, string>();
  for (const rule of STATUTE_RULES) {
    const applies =
      rule.national === true ||
      (scope !== 'national' && (rule.states ?? []).includes(scope));
    if (!applies) continue;
    if (rule.fromYear !== undefined && year < rule.fromYear) continue;
    if (rule.toYear !== undefined && year > rule.toYear) continue;
    let date: Date;
    if (rule.kind === 'fixed') date = new Date(year, rule.month - 1, rule.day);
    else if (rule.kind === 'easter-offset') date = addDays(easterSunday(year), rule.offset);
    else date = addDays(firstAdvent(year), -11); // Buß- und Bettag
    expected.set(fmt(date), rule.name);
  }
  return expected;
}

/** Adapter output seen from one scope, as Map date -> German name. */
function adapterMatrix(year: number, scope: 'national' | GermanState): Map<string, string> {
  const actual = new Map<string, string>();
  for (const holiday of getGermanHolidays(year)) {
    // A state scope sees the national entries plus its own entries — the same
    // union isGermanHoliday(date, [state]) matches against.
    const inScope =
      scope === 'national'
        ? holiday.isNational
        : holiday.isNational || holiday.regions.includes(scope);
    if (inScope) actual.set(fmt(holiday.date), holiday.name);
  }
  return actual;
}

interface MatrixDiff {
  year: number;
  region: string;
  date: string;
  expected: string; // expected-matrix side
  actual: string; // adapter-output side
}

function compareMatrix(year: number, scope: 'national' | GermanState): MatrixDiff[] {
  const expected = expectedMatrix(year, scope);
  const actual = adapterMatrix(year, scope);
  const diffs: MatrixDiff[] = [];
  for (const [date, name] of expected) {
    if (!actual.has(date)) diffs.push({ year, region: scope, date, expected: name, actual: '<none>' });
    else if (actual.get(date) !== name) {
      diffs.push({ year, region: scope, date, expected: name, actual: actual.get(date) ?? '<none>' });
    }
  }
  for (const [date, name] of actual) {
    if (!expected.has(date)) diffs.push({ year, region: scope, date, expected: '<none>', actual: name });
  }
  return diffs;
}

const MAX_REPORTED_DIFFS = 60;

function formatDiffs(diffs: MatrixDiff[]): string {
  const header =
    `side: "adapter output" (german-holidays.ts) vs "expected matrix" (hand-derived, ` +
    `fields: expected = expected matrix, actual = adapter output); ` +
    `${diffs.length} diff(s), showing first ${Math.min(diffs.length, MAX_REPORTED_DIFFS)}:`;
  const lines = diffs.slice(0, MAX_REPORTED_DIFFS).map(
    (d) => `year=${d.year} region=${d.region} date=${d.date} expected="${d.expected}" actual="${d.actual}"`
  );
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// REQ-301 statute pins (AC-1..AC-6)
// ---------------------------------------------------------------------------

describe('statute pins (REQ-301)', () => {
  it('AC-1: 2026-10-31 is NOT a holiday in NW (Reformationstag was a 2017 one-off there)', () => {
    expect(isGermanHoliday(new Date(2026, 9, 31), [GERMAN_STATES.NW])).toBeNull();
  });

  it('AC-2: 2026-11-18 IS Buß- und Bettag in SN (§ 1(1) SächsSFG)', () => {
    const holiday = isGermanHoliday(new Date(2026, 10, 18), [GERMAN_STATES.SN]);
    expect(holiday?.name).toBe('Buß- und Bettag');
  });

  it('AC-3: 2026-09-20 IS and 2018-09-20 is NOT Weltkindertag in TH (ThürFGtG § 2(1), from 2019)', () => {
    const present = isGermanHoliday(new Date(2026, 8, 20), [GERMAN_STATES.TH]);
    expect(present?.name).toBe('Weltkindertag');
    expect(isGermanHoliday(new Date(2018, 8, 20), [GERMAN_STATES.TH])).toBeNull();
  });

  it('AC-4: 2026-03-08 IS and 2018-03-08 is NOT Frauentag in BE (from 2019)', () => {
    const present = isGermanHoliday(new Date(2026, 2, 8), [GERMAN_STATES.BE]);
    expect(present?.name).toBe('Frauentag');
    expect(isGermanHoliday(new Date(2018, 2, 8), [GERMAN_STATES.BE])).toBeNull();
  });

  it('AC-5: 2017-10-31 IS Reformation Day in the national scope (one-off 500th anniversary)', () => {
    const national = getGermanHolidays(2017).filter((h) => h.isNational);
    const reformation = national.find((h) => fmt(h.date) === '2017-10-31');
    expect(reformation?.name).toBe('Reformationstag');
  });

  it('AC-6: 2016-10-31 is NOT a holiday in NI (permanent Reformation Day starts 2018)', () => {
    expect(isGermanHoliday(new Date(2016, 9, 31), [GERMAN_STATES.NI])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audit-C2 boundary pins
// ---------------------------------------------------------------------------

describe('boundary pins (audit C2)', () => {
  it('BB/MV/SN/ST/TH have Reformation Day in 2026 (permanent since reunification)', () => {
    for (const state of ['BB', 'MV', 'SN', 'ST', 'TH'] as const) {
      const holiday = isGermanHoliday(new Date(2026, 9, 31), [state]);
      expect(holiday?.name, `state ${state}`).toBe('Reformationstag');
    }
  });

  it('HB/HH/NI/SH have NO state-level Reformation Day in 2017 (only the national one-off)', () => {
    for (const state of ['HB', 'HH', 'NI', 'SH'] as const) {
      const stateScoped = getGermanHolidays(2017).filter(
        (h: GermanHoliday) => !h.isNational && h.regions.includes(state)
      );
      expect(
        stateScoped.find((h) => fmt(h.date) === '2017-10-31'),
        `state ${state} must not carry its own 2017 Reformation Day entry`
      ).toBeUndefined();
    }
  });

  it('HB/HH/NI/SH each have a state-level Reformation Day in 2018 (Drucksache 18/827 states)', () => {
    for (const state of ['HB', 'HH', 'NI', 'SH'] as const) {
      const holiday = isGermanHoliday(new Date(2018, 9, 31), [state]);
      expect(holiday?.name, `state ${state}`).toBe('Reformationstag');
      expect(holiday?.isNational, `state ${state} entry must be state-scoped`).toBe(false);
    }
  });

  it('MV: 2022-03-08 is NOT and 2023-03-08 IS Frauentag', () => {
    expect(isGermanHoliday(new Date(2022, 2, 8), [GERMAN_STATES.MV])).toBeNull();
    const present = isGermanHoliday(new Date(2023, 2, 8), [GERMAN_STATES.MV]);
    expect(present?.name).toBe('Frauentag');
  });

  it('Buß- und Bettag 2026-11-18 is NOT a holiday outside SN (e.g. BY)', () => {
    expect(isGermanHoliday(new Date(2026, 10, 18), [GERMAN_STATES.BY])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// REQ-302 / AC-7: full matrix comparison 2000..currentYear+5, national + 16 states
// ---------------------------------------------------------------------------

describe('expected-matrix comparison (REQ-302)', () => {
  it(`matches the law-derived matrix for ${FIRST_YEAR}..${LAST_YEAR} across national + 16 states`, () => {
    const scopes: Array<'national' | GermanState> = ['national', ...STATE_CODES];
    const diffs: MatrixDiff[] = [];
    for (const year of YEARS) {
      for (const scope of scopes) {
        diffs.push(...compareMatrix(year, scope));
      }
    }
    expect(diffs, formatDiffs(diffs)).toEqual([]);
  });

  it('emits only local-midnight Date values (REQ-102 serialization contract)', () => {
    for (const year of YEARS) {
      for (const holiday of getGermanHolidays(year)) {
        const where = `${holiday.name} ${year}`;
        expect(holiday.date.getHours(), where).toBe(0);
        expect(holiday.date.getMinutes(), where).toBe(0);
        expect(holiday.date.getSeconds(), where).toBe(0);
        expect(holiday.date.getMilliseconds(), where).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Audit-C1 checks: caller-array non-mutation + import isolation (REQ-106)
// ---------------------------------------------------------------------------

describe('hazard guards (audit C1)', () => {
  it('calculateWorkingDays does not mutate the caller regions array (cache-key sort)', () => {
    const regions: GermanState[] = [GERMAN_STATES.TH, GERMAN_STATES.BW, GERMAN_STATES.SN, GERMAN_STATES.NW];
    const snapshot = [...regions];
    calculateWorkingDays(new Date(2026, 1, 2, 0, 0, 0, 0), new Date(2026, 2, 27, 0, 0, 0, 0), regions);
    expect(regions).toEqual(snapshot);
  });

  it('imports feiertagejs only inside the adapter boundary (REQ-106)', () => {
    const adapterPath = join(process.cwd(), 'src', 'lib', 'holidays', 'german-holidays.ts');
    const importPattern = /(?:from\s+|import\s+|require\s*\(\s*)['"]feiertagejs(?:\/|['"])/;
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && full !== adapterPath) {
          const content = readFileSync(full, 'utf8');
          if (importPattern.test(content)) offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), 'src'));

    expect(offenders).toEqual([]);
  });
});
