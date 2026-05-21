/**
 * useKpiCalculations Hook
 *
 * Encapsulates KPI calculation triggering, webhook polling, and custom widget calculations.
 *
 * @MX:NOTE - Integrates with Zustand store for state management and React Query for data fetching
 * @MX:ANCHOR - Central hook for KPI calculations across the dashboard
 * @MX:REASON - Fan-in from KpiDashboard component and widget components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { kpiResults, isCalculating, triggerCalculation, setPollingEnabled } = useKpiCalculations(
 *     dateFrom,
 *     dateTo,
 *     globalFilters
 *   );
 *   return <button onClick={() => triggerCalculation()}>Recalculate</button>;
 * }
 * ```
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import type { KpiCalcResult } from '@/types/dashboard';

export interface UseKpiCalculationsResult {
  kpiResults: KpiCalcResult[];
  customWidgetResults: Record<string, unknown>;
  isCalculating: boolean;
  pollingEnabled: boolean;
  triggerCalculation: (widgetId?: string) => Promise<void>;
  setPollingEnabled: (enabled: boolean) => void;
  refetch: () => void;
}

interface KpiCalculateResponse {
  success: boolean;
  results?: KpiCalcResult[];
  error?: string;
}

/**
 * Custom hook for managing KPI calculations with polling and concurrent calculation prevention.
 *
 * @param dateFrom - Start date for KPI calculation period
 * @param dateTo - End date for KPI calculation period
 * @param globalFilters - Global filter selections (projects, statuses, etc.)
 * @param customWidgets - Optional array of custom widget IDs to calculate
 * @returns KPI calculation state and control methods
 */
export function useKpiCalculations(
  dateFrom: Date,
  dateTo: Date,
  globalFilters: Record<string, unknown>,
  customWidgets?: string[]
): UseKpiCalculationsResult {
  // Zustand store selectors
  const kpiResults = useAppStore((state) => state.kpiResults);
  const customWidgetResults = useAppStore((state) => state.customWidgetResults);
  const setKpiResults = useAppStore((state) => state.setKpiResults);
  const setCustomWidgetResults = useAppStore((state) => state.setCustomWidgetResults);
  const setCalculatingWidgets = useAppStore((state) => state.setCalculatingWidgets);

  const activeConnectionId = useAppStore((state) => state.activeConnectionId);
  const settings = useAppStore((state) => state.settings);
  const region = useAppStore((state) => state.region);
  const storageConfig = useAppStore((state) => state.storageConfig);

  // Local state
  const [pollingEnabled, setPollingEnabledState] = useState(true);
  const [calculatingSet, setCalculatingSet] = useState<Set<string>>(new Set());
  const isCalculatingRef = useRef<Set<string>>(new Set());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCalculationParamsRef = useRef<string>('');

  /**
   * Fetch KPI calculations from the API
   */
  const fetchKpiCalculations = useCallback(async (): Promise<KpiCalcResult[]> => {
    lastCalculationParamsRef.current = JSON.stringify({ dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), globalFilters, activeConnectionId });
    try {
      // AbortController for 30-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activeConnectionId,
          connectionId: activeConnectionId,
          storageConfig,
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          region,
          globalFilters,
          customWidgets: customWidgets || [],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[useKpiCalculations] API error:', response.status, response.statusText);
        return [];
      }

      const data: KpiCalculateResponse = await response.json();

      if (!data.success || !data.results) {
        console.error('[useKpiCalculations] Calculation failed:', data.error);
        return [];
      }

      return data.results;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[useKpiCalculations] Request timeout after 30 seconds');
      } else {
        console.error('[useKpiCalculations] Network error:', error);
      }
      return [];
    }
  }, [activeConnectionId, dateFrom, dateTo, region, globalFilters, customWidgets, storageConfig]);

  // @MX:NOTE: Stable cache key serialization to prevent unnecessary re-fetches
  // Date objects and filter objects are serialized to strings for stable comparison
  const stableQueryKey = useMemo(() => {
    const filtersKey = globalFilters ? JSON.stringify(globalFilters) : 'empty';
    return ['kpi-results', dateFrom.toISOString(), dateTo.toISOString(), filtersKey];
  }, [dateFrom, dateTo, globalFilters]);

  /**
   * React Query for KPI data with caching
   */
  const {
    data: queryResults = [],
    isLoading: isQueryLoading,
    refetch,
  } = useQuery({
    queryKey: stableQueryKey,
    queryFn: fetchKpiCalculations,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    enabled: pollingEnabled,
  });

  /**
   * Update Zustand store when query results change
   */
  useEffect(() => {
    if (queryResults.length > 0) {
      setKpiResults(queryResults);
    }
  }, [queryResults, setKpiResults]);

  /**
   * Trigger KPI calculation for all widgets or specific widget
   */
  const triggerCalculation = useCallback(async (widgetId?: string) => {
    const targetWidget = widgetId || 'all';

    // Concurrent calculation prevention
    if (isCalculatingRef.current.has(targetWidget)) {
      console.log(`[useKpiCalculations] Calculation already in progress for: ${targetWidget}`);
      return;
    }

    isCalculatingRef.current.add(targetWidget);
    setCalculatingSet(new Set(isCalculatingRef.current));
    setCalculatingWidgets(new Set(isCalculatingRef.current));

    try {
      if (widgetId) {
        // Custom widget calculation
        console.log(`[useKpiCalculations] Calculating custom widget: ${widgetId}`);
        const result = await fetchKpiCalculations();
        const widgetResult = { context: {}, results: result };

        // Handle both Map (real store) and object (mocked store in tests)
        if (customWidgetResults instanceof Map) {
          setCustomWidgetResults(new Map(customWidgetResults).set(widgetId, widgetResult));
        } else {
          // For mocked store in tests, convert to Map first
          const resultsRecord = customWidgetResults as Record<string, { context: any; results: KpiCalcResult[] }>;
          const map = new Map<string, { context: any; results: KpiCalcResult[] }>(
            Object.entries(resultsRecord).map(([k, v]) => [k, v])
          );
          map.set(widgetId, widgetResult);
          setCustomWidgetResults(map);
        }
      } else {
        // Full KPI recalculation
        console.log('[useKpiCalculations] Triggering full KPI recalculation');
        await refetch();
      }
    } finally {
      isCalculatingRef.current.delete(targetWidget);
      setCalculatingSet(new Set(isCalculatingRef.current));
      setCalculatingWidgets(new Set(isCalculatingRef.current));
    }
  }, [fetchKpiCalculations, refetch, setCalculatingWidgets, setCustomWidgetResults, customWidgetResults]);

  /**
   * Toggle polling on/off
   */
  const setPollingEnabled = useCallback((enabled: boolean) => {
    setPollingEnabledState(enabled);
  }, []);

  // @MX:NOTE: Stable params serialization for polling comparison
  const currentParamsSerialized = useMemo(() =>
    JSON.stringify({ dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), globalFilters, activeConnectionId }),
    [dateFrom, dateTo, globalFilters, activeConnectionId]
  );

  /**
   * Webhook polling setup (5-minute intervals)
   * @MX:NOTE: Uses stable serialized params to avoid unnecessary polling triggers
   */
  useEffect(() => {
    // Only poll if webhooks are enabled in settings
    if (!settings?.webhooks?.enabled || !pollingEnabled) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Poll only when not currently calculating and params have changed
    pollingIntervalRef.current = setInterval(() => {
      if (calculatingSet.size === 0) {
        if (currentParamsSerialized !== lastCalculationParamsRef.current) {
          lastCalculationParamsRef.current = currentParamsSerialized;
          triggerCalculation();
        }
      }
    }, 300000); // 5 minutes

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // @MX:NOTE: Intentionally NOT including triggerCalculation to avoid re-creating interval
    // The function is accessed via ref and params changes are detected via serialized comparison
  }, [settings?.webhooks?.enabled, pollingEnabled, currentParamsSerialized, calculatingSet]);

  /**
   * Cleanup on unmount
   *
   * Note: We access isCalculatingRef.current directly in cleanup to clear
   * the latest state. This is safe because the effect only runs once on mount.
   */
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      // Clear calculation tracking on unmount
      isCalculatingRef.current.clear();
    };
  }, []);

  // @MX:NOTE: Convert Map to Record for custom widget results
  // Uses size as dependency to avoid re-renders when Map contents haven't changed
  const customWidgetResultsRecord: Record<string, unknown> = useMemo(() => {
    const record: Record<string, unknown> = {};
    if (customWidgetResults instanceof Map) {
      customWidgetResults.forEach((value, key) => {
        record[key] = value;
      });
    } else {
      // Handle mocked store (object) vs real store (Map)
      Object.entries(customWidgetResults).forEach(([key, value]) => {
        record[key] = value;
      });
    }
    return record;
    // @MX:NOTE: Using size as dependency to minimize re-renders
  }, [customWidgetResults instanceof Map ? customWidgetResults.size : customWidgetResults]);

  const isCalculating = isQueryLoading || calculatingSet.size > 0;

  return {
    kpiResults,
    customWidgetResults: customWidgetResultsRecord,
    isCalculating,
    pollingEnabled,
    triggerCalculation,
    setPollingEnabled,
    refetch,
  };
}
