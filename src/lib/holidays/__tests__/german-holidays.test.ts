import { describe, it, expect } from 'vitest';
import { 
  calculateBusinessHours, 
  isWorkingDay, 
  getGermanHolidays, 
  GERMAN_STATES 
} from '../german-holidays';

describe('German Holidays & Business Hours', () => {
  describe('isWorkingDay', () => {
    it('should identify weekends as non-working days', () => {
      const saturday = new Date('2026-05-09'); // Saturday
      const sunday = new Date('2026-05-10'); // Sunday
      expect(isWorkingDay(saturday)).toBe(false);
      expect(isWorkingDay(sunday)).toBe(false);
    });

    it('should identify weekdays as working days', () => {
      const monday = new Date('2026-05-11');
      expect(isWorkingDay(monday)).toBe(true);
    });

    it('should identify national holidays as non-working days', () => {
      const newYear = new Date('2026-01-01');
      expect(isWorkingDay(newYear)).toBe(false);
    });

    it('should identify regional holidays correctly', () => {
      const epiphany = new Date('2026-01-06');
      // Epiphany is a holiday in BW, BY, ST
      expect(isWorkingDay(epiphany, [GERMAN_STATES.BW])).toBe(false);
      expect(isWorkingDay(epiphany, [GERMAN_STATES.BE])).toBe(true);
    });
  });

  describe('calculateBusinessHours', () => {
    const defaultOptions = {
      workStartHour: 9,
      workEndHour: 17,
    };

    it('should calculate hours within a single working day', () => {
      const start = new Date('2026-05-11T10:00:00'); // Monday
      const end = new Date('2026-05-11T14:30:00');
      const hours = calculateBusinessHours(start, end, defaultOptions);
      expect(hours).toBe(4.5);
    });

    it('should exclude hours outside of working time on a single day', () => {
      const start = new Date('2026-05-11T07:00:00');
      const end = new Date('2026-05-11T20:00:00');
      const hours = calculateBusinessHours(start, end, defaultOptions);
      expect(hours).toBe(8); // 9:00 to 17:00
    });

    it('should handle spans across multiple working days', () => {
      const start = new Date('2026-05-11T16:00:00'); // Monday
      const end = new Date('2026-05-12T10:00:00'); // Tuesday
      const hours = calculateBusinessHours(start, end, defaultOptions);
      // Mon: 16:00-17:00 (1h)
      // Tue: 09:00-10:00 (1h)
      expect(hours).toBe(2);
    });

    it('should exclude weekends', () => {
      const start = new Date('2026-05-08T16:00:00'); // Friday
      const end = new Date('2026-05-11T10:00:00'); // Monday
      const hours = calculateBusinessHours(start, end, defaultOptions);
      // Fri: 16:00-17:00 (1h)
      // Sat: 0h
      // Sun: 0h
      // Mon: 09:00-10:00 (1h)
      expect(hours).toBe(2);
    });

    it('should exclude holidays', () => {
      const start = new Date('2025-12-24T16:00:00'); // Wednesday (not holiday but often half-day, but our logic treats it as working)
      const end = new Date('2025-12-29T10:00:00'); // Monday
      // 25 (Thu) - Holiday
      // 26 (Fri) - Holiday
      // 27 (Sat) - Weekend
      // 28 (Sun) - Weekend
      const hours = calculateBusinessHours(start, end, defaultOptions);
      // Wed: 16:00-17:00 (1h)
      // Thu: 0h
      // Fri: 0h
      // Sat: 0h
      // Sun: 0h
      // Mon: 09:00-10:00 (1h)
      expect(hours).toBe(2);
    });

    it('should handle start and end during non-working hours', () => {
      const start = new Date('2026-05-10T12:00:00'); // Sunday
      const end = new Date('2026-05-11T08:00:00'); // Monday early
      const hours = calculateBusinessHours(start, end, defaultOptions);
      expect(hours).toBe(0);
    });
  });

  describe('getGermanHolidays', () => {
    it('should return fixed holidays', () => {
      const holidays = getGermanHolidays(2026);
      const newYear = holidays.find(h => h.nameEn === "New Year's Day");
      expect(newYear?.date.getMonth()).toBe(0); // Jan
      expect(newYear?.date.getDate()).toBe(1);
    });

    it('should calculate variable Easter holidays correctly for 2026', () => {
      // Easter Sunday 2026 is April 5th
      const holidays = getGermanHolidays(2026);
      const goodFriday = holidays.find(h => h.nameEn === 'Good Friday');
      expect(goodFriday?.date.getMonth()).toBe(3); // April
      expect(goodFriday?.date.getDate()).toBe(3);
      
      const easterMonday = holidays.find(h => h.nameEn === 'Easter Monday');
      expect(easterMonday?.date.getDate()).toBe(6);
    });
  });
});
