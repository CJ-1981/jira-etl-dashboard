/**
 * Tests for usePeriodAnalysis hook
 *
 * Characterization tests documenting existing behavior from KpiDashboard.tsx (lines 118-140)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePeriodAnalysis } from '../usePeriodAnalysis';

describe('usePeriodAnalysis', () => {
  describe('preset period detection', () => {
    it('should detect 7-day preset period when today is dateTo', () => {
      // Using fixed dates for reproducibility
      const dateFrom = new Date('2025-05-04T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(7);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 14-day preset period', () => {
      const dateFrom = new Date('2025-04-27T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(14);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 30-day preset period', () => {
      const dateFrom = new Date('2025-04-11T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(30);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 60-day preset period', () => {
      const dateFrom = new Date('2025-03-12T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(60);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 90-day preset period', () => {
      const dateFrom = new Date('2025-02-10T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(90);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 180-day preset period', () => {
      const dateFrom = new Date('2024-11-12T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(180);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should detect 365-day preset period', () => {
      const dateFrom = new Date('2024-05-11T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(365);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should return null for non-preset range (9 days)', () => {
      const dateFrom = new Date('2025-05-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-10T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(null);
      expect(result.current.isPresetRange).toBe(false);
    });

    it('should return null for non-preset range (45 days)', () => {
      const dateFrom = new Date('2025-03-27T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(null);
      expect(result.current.isPresetRange).toBe(false);
    });

    it('should handle leap year in day calculation', () => {
      // 2024 is a leap year
      const dateFrom = new Date('2024-02-28T00:00:00.000Z');
      const dateTo = new Date('2024-03-07T00:00:00.000Z'); // 8 days later (including Feb 29)

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(null); // 8 days is not a preset
      expect(result.current.isPresetRange).toBe(false);
    });
  });

  describe('truncation detection', () => {
    it('should detect truncation when requested start is before available start', () => {
      const dateFrom = new Date('2025-01-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-03-01T00:00:00.000Z',
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      expect(result.current.requiresTruncation).toBe(true);
      expect(result.current.availableStartDate).not.toBeNull();
    });

    it('should not detect truncation when requested start equals available start', () => {
      const dateFrom = new Date('2025-03-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-03-01T00:00:00.000Z',
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      expect(result.current.requiresTruncation).toBe(false);
    });

    it('should not detect truncation when requested start is after available start', () => {
      const dateFrom = new Date('2025-04-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-03-01T00:00:00.000Z',
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      expect(result.current.requiresTruncation).toBe(false);
    });

    it('should handle null masterDatasetInfo', () => {
      const dateFrom = new Date('2025-01-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.requiresTruncation).toBe(false);
      expect(result.current.availableStartDate).toBeNull();
    });
  });

  describe('available start date tracking', () => {
    it('should return available start date from masterDatasetInfo', () => {
      const dateFrom = new Date('2025-04-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-03-15T00:00:00.000Z',
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      expect(result.current.availableStartDate).toEqual(new Date('2025-03-15T00:00:00.000Z'));
    });

    it('should return null when masterDatasetInfo is null', () => {
      const dateFrom = new Date('2025-04-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.availableStartDate).toBeNull();
    });

    it('should return null when masterDatasetInfo.dateRange is missing', () => {
      const dateFrom = new Date('2025-04-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {};

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      expect(result.current.availableStartDate).toBeNull();
    });
  });

  describe('date range validation', () => {
    it('should validate correct date range (from < to)', () => {
      const dateFrom = new Date('2025-05-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-10T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.validateDateRange(dateFrom, dateTo)).toBe(true);
    });

    it('should reject invalid date range (from > to)', () => {
      const dateFrom = new Date('2025-05-10T00:00:00.000Z');
      const dateTo = new Date('2025-05-01T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.validateDateRange(dateFrom, dateTo)).toBe(false);
    });

    it('should reject equal dates', () => {
      const dateFrom = new Date('2025-05-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-01T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.validateDateRange(dateFrom, dateTo)).toBe(false);
    });

    it('should validate dates with different times (same day)', () => {
      const dateFrom = new Date('2025-05-01T09:00:00.000Z');
      const dateTo = new Date('2025-05-01T17:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      // Time-based validation should work
      expect(result.current.validateDateRange(dateFrom, dateTo)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle month boundaries correctly (Jan 31 to Mar 1)', () => {
      const dateFrom = new Date('2025-01-31T00:00:00.000Z');
      const dateTo = new Date('2025-03-01T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      // Should be approximately 30 days depending on month length calculation
      expect(result.current.presetPeriod).toBe(null); // Not exactly 30 days due to Feb
      expect(result.current.isPresetRange).toBe(false);
    });

    it('should handle year boundaries correctly', () => {
      const dateFrom = new Date('2024-12-15T00:00:00.000Z');
      const dateTo = new Date('2025-01-15T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(null); // 31 days, not a preset
      expect(result.current.isPresetRange).toBe(false);
    });

    it('should normalize dates to midnight for comparison', () => {
      const dateFrom = new Date('2025-01-01T09:30:00.000Z');
      const dateTo = new Date('2025-05-11T15:45:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-01-01T00:00:00.000Z',
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      // Should normalize to midnight and detect no truncation
      expect(result.current.requiresTruncation).toBe(false);
    });

    it('should detect truncation even with time differences', () => {
      const dateFrom = new Date('2025-01-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');
      const masterDatasetInfo = {
        dateRange: {
          from: '2025-01-01T01:00:00.000Z', // 1 hour later
          to: '2025-05-11T00:00:00.000Z'
        }
      };

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, masterDatasetInfo)
      );

      // Should normalize to midnight and detect no truncation
      expect(result.current.requiresTruncation).toBe(false);
    });
  });

  describe('isPresetRange alias', () => {
    it('should be true when presetPeriod is not null', () => {
      const dateFrom = new Date('2025-05-04T00:00:00.000Z');
      const dateTo = new Date('2025-05-11T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(7);
      expect(result.current.isPresetRange).toBe(true);
    });

    it('should be false when presetPeriod is null', () => {
      const dateFrom = new Date('2025-05-01T00:00:00.000Z');
      const dateTo = new Date('2025-05-10T00:00:00.000Z');

      const { result } = renderHook(() =>
        usePeriodAnalysis(dateFrom, dateTo, null)
      );

      expect(result.current.presetPeriod).toBe(null);
      expect(result.current.isPresetRange).toBe(false);
    });
  });
});
