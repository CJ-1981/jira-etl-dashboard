/**
 * usePeriodAnalysis Hook
 *
 * Detects preset periods, manages data truncation, and tracks available start dates.
 *
 * Extracted from KpiDashboard.tsx (lines 118-140) as part of SPEC-KPI-DASH-002 Phase 2.3
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { presetPeriod, requiresTruncation, validateDateRange } = usePeriodAnalysis(
 *     dateFrom,
 *     dateTo,
 *     masterDatasetInfo
 *   );
 *   return <div>Preset: {presetPeriod} days</div>;
 * }
 * ```
 */
import { useMemo, useCallback } from 'react';

export interface MasterDatasetInfo {
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface UsePeriodAnalysisResult {
  presetPeriod: number | null; // days: 7, 14, 30, 60, 90, 180, 365
  requiresTruncation: boolean;
  availableStartDate: Date | null;
  isPresetRange: boolean;
  validateDateRange: (from: Date, to: Date) => boolean;
}

/**
 * Hook for analyzing date periods and detecting preset ranges
 *
 * @param dateFrom - Start date of the selected period
 * @param dateTo - End date of the selected period
 * @param masterDatasetInfo - Dataset metadata including available date range
 * @returns Period analysis results
 */
export function usePeriodAnalysis(
  dateFrom: Date,
  dateTo: Date,
  masterDatasetInfo: MasterDatasetInfo | null
): UsePeriodAnalysisResult {
  const presetPeriod = useMemo<number | null>(() => {
    // Calculate day difference (using Math.round as in original)
    const diffTime = dateTo.getTime() - dateFrom.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // Check if matches preset periods
    const presets = [7, 14, 30, 60, 90, 180, 365];
    return presets.includes(diffDays) ? diffDays : null;
  }, [dateFrom, dateTo]);

  const isPresetRange = useMemo(() => {
    return presetPeriod !== null;
  }, [presetPeriod]);

  const requiresTruncation = useMemo(() => {
    // Extract available start date from masterDatasetInfo
    const masterStart = masterDatasetInfo?.dateRange?.from
      ? new Date(masterDatasetInfo.dateRange.from)
      : null;

    // Normalize dates to midnight for accurate comparison
    const fromDateNormalized = new Date(
      dateFrom.getFullYear(),
      dateFrom.getMonth(),
      dateFrom.getDate()
    );
    const masterStartNormalized = masterStart
      ? new Date(
          masterStart.getFullYear(),
          masterStart.getMonth(),
          masterStart.getDate()
        )
      : null;

    // Check if requested start is before available start
    const isTruncated =
      masterStartNormalized &&
      fromDateNormalized &&
      fromDateNormalized < masterStartNormalized;

    return !!isTruncated;
  }, [dateFrom, masterDatasetInfo]);

  const availableStartDate = useMemo(() => {
    // Extract available start date from masterDatasetInfo
    const masterStart = masterDatasetInfo?.dateRange?.from
      ? new Date(masterDatasetInfo.dateRange.from)
      : null;

    return masterStart;
  }, [masterDatasetInfo]);

  const validateDateRange = useCallback((from: Date, to: Date) => {
    // Basic validation: from must be before to
    return from < to;
  }, []);

  return {
    presetPeriod,
    requiresTruncation,
    availableStartDate,
    isPresetRange,
    validateDateRange,
  };
}
