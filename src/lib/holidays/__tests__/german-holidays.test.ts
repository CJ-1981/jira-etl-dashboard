/**
 * German Holiday Calendar Tests
 * Regression tests for business hours and working days calculations.
 */

import { describe, it, expect } from 'vitest';
import { calculateBusinessHours, calculateWorkingDays } from '../german-holidays';

// All dates chosen in February 2026: no German holidays and no DST transitions,
// so expected values can be hand-computed from the Mon-Fri 09:00-17:00 config.
// 2026-02-02 is a Monday.

describe('calculateBusinessHours', () => {
  it('should count a single working day fully within work hours (Mon 09:00-17:00 = 8h)', () => {
    const start = new Date(2026, 1, 2, 9, 0, 0, 0); // Mon 2026-02-02 09:00
    const end = new Date(2026, 1, 2, 17, 0, 0, 0); // Mon 2026-02-02 17:00
    expect(calculateBusinessHours(start, end)).toBe(8);
  });

  it('should not drop the middle day for a range spanning 3 days (Mon-Wed = 24h)', () => {
    // 8h Mon + 8h Tue + 8h Wed
    const start = new Date(2026, 1, 2, 9, 0, 0, 0); // Mon 2026-02-02 09:00
    const end = new Date(2026, 1, 4, 17, 0, 0, 0); // Wed 2026-02-04 17:00
    expect(calculateBusinessHours(start, end)).toBe(24);
  });

  it('should handle partial first and last days across the weekend (Thu 13:00 - Mon 11:00 = 14h)', () => {
    // Thu 2026-02-05 13:00-17:00 = 4h, Fri full = 8h (counted as middle day),
    // Sat/Sun skipped, Mon 09:00-11:00 = 2h  =>  4 + 8 + 2 = 14h
    const start = new Date(2026, 1, 5, 13, 0, 0, 0); // Thu 2026-02-05 13:00
    const end = new Date(2026, 1, 9, 11, 0, 0, 0); // Mon 2026-02-09 11:00
    expect(calculateBusinessHours(start, end)).toBe(14);
  });

  it('should exercise the >7 middle days fast path (Mon - following Wed = 64h)', () => {
    // Mon 2026-02-02 09:00 -> Wed 2026-02-11 17:00
    // First day 8h + middle days Tue-Fri,Mon-Tue (6 * 8h = 48h) + last day 8h = 64h
    const start = new Date(2026, 1, 2, 9, 0, 0, 0); // Mon 2026-02-02 09:00
    const end = new Date(2026, 1, 11, 17, 0, 0, 0); // Wed 2026-02-11 17:00
    expect(calculateBusinessHours(start, end)).toBe(64);
  });

  it('should respect the fast path with a Saturday start (Sat - following Wed = 64h)', () => {
    // Sat 2026-02-07 10:00 -> Wed 2026-02-18 17:00
    // Sat/Sun contribute 0; full work days Mon 09, Tue 10, Wed 11, Thu 12, Fri 13,
    // Mon 16, Tue 17, Wed 18 (09:00-17:00) = 8 * 8h = 64h
    const start = new Date(2026, 1, 7, 10, 0, 0, 0); // Sat 2026-02-07 10:00
    const end = new Date(2026, 1, 18, 17, 0, 0, 0); // Wed 2026-02-18 17:00
    expect(calculateBusinessHours(start, end)).toBe(64);
  });

  it('should return 0 when start is after end', () => {
    const start = new Date(2026, 1, 4, 17, 0, 0, 0);
    const end = new Date(2026, 1, 2, 9, 0, 0, 0);
    expect(calculateBusinessHours(start, end)).toBe(0);
  });
});

describe('calculateWorkingDays', () => {
  it('should count only Monday for Sat -> next Mon', () => {
    // Sat 2026-02-07 -> Mon 2026-02-09 (inclusive): Sat(0) + Sun(0) + Mon(1) = 1
    const start = new Date(2026, 1, 7, 0, 0, 0, 0);
    const end = new Date(2026, 1, 9, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(1);
  });

  it('should count 5 working days for Sat -> following Fri (iterative path)', () => {
    // Sat 2026-02-07 -> Fri 2026-02-13 (inclusive): Mon-Fri = 5
    const start = new Date(2026, 1, 7, 0, 0, 0, 0);
    const end = new Date(2026, 1, 13, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(5);
  });

  it('should count 5 working days for Sat -> following Fri (mathematical path)', () => {
    // Sat 2026-02-07 -> Fri 2026-02-27 (inclusive, 21 days > 14 => fast path):
    // weeks of Mon-Fri on Feb 9-13, 16-20, 23-27 = 15
    const start = new Date(2026, 1, 7, 0, 0, 0, 0);
    const end = new Date(2026, 1, 27, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(15);
  });

  it('should count 15 working days for Sun -> 3 weeks later Sunday (fast path)', () => {
    // Sun 2026-02-08 -> Sun 2026-03-01 (inclusive, 22 days > 14):
    // Mon-Fri x3 = 15
    const start = new Date(2026, 1, 8, 0, 0, 0, 0);
    const end = new Date(2026, 2, 1, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(15);
  });

  it('should match the iterative path for a Monday start (fast path consistency)', () => {
    // Mon 2026-02-02 -> Fri 2026-02-27 (inclusive, 26 days):
    // Feb 2-6, 9-13, 16-20, 23-27 = 20 working days
    const start = new Date(2026, 1, 2, 0, 0, 0, 0);
    const end = new Date(2026, 1, 27, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(20);
  });

  it('should exclude national holidays (Labour Day 2026-05-01 is a Friday)', () => {
    // Mon 2026-04-27 -> Fri 2026-05-01 (inclusive): 5 weekdays minus May 1st = 4
    const start = new Date(2026, 3, 27, 0, 0, 0, 0);
    const end = new Date(2026, 4, 1, 0, 0, 0, 0);
    expect(calculateWorkingDays(start, end)).toBe(4);
  });
});
