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
import { getDataSource } from '@/lib/datasource';
import { isRelayMode } from '@/lib/runtime/mode';
import type { KpiCalcResult } from '@/types/dashboard';

export interface UseKpiCalculationsResult {
  kpiResults: KpiCalcResult[];
  customWidgetResults: Record<string, unknown>;
  isCalculating: boolean;
  isError: boolean;
  error: Error | null;
  pollingEnabled: boolean;
  triggerCalculation: (widgetId?: string) => Promise<void>;
  setPollingEnabled: (enabled: boolean) => void;
  refetch: () => void;
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
  // Relay mode calculates client-side over the in-memory dataset.
  const masterDatasetInfo = useAppStore((state) => state.masterDatasetInfo);

  // Local state
  const [pollingEnabled, setPollingEnabledState] = useState(true);
  const [calculatingSet, setCalculatingSet] = useState<Set<string>>(new Set());
  const isCalculatingRef = useRef<Set<string>>(new Set());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCalculationParamsRef = useRef<string>('');

  // @MX:NOTE: Ref-based parameter access to prevent stale closures in triggerCalculation.
  // @MX:REASON: triggerCalculation may be called from setTimeout or event handlers that
  // captured an older version of the function. Using refs ensures we always read the
  // latest parameter values at call time rather than at capture time. The assignment
  // lives in an effect because writing refs during render breaks React Compiler.
  const paramsRef = useRef({
    activeConnectionId,
    dateFrom,
    dateTo,
    region,
    globalFilters,
    storageConfig,
    customWidgets,
    relayIssues: isRelayMode() ? masterDatasetInfo?.issues : undefined,
    settings,
  });
  useEffect(() => {
    paramsRef.current = {
      activeConnectionId,
      dateFrom,
      dateTo,
      region,
      globalFilters,
      storageConfig,
      customWidgets,
      relayIssues: isRelayMode() ? masterDatasetInfo?.issues : undefined,
      settings,
    };
  });

  /**
   * Run KPI calculations via the DataSource seam
   */
  const fetchKpiCalculations = useCallback(async (): Promise<KpiCalcResult[]> => {
    // Read latest params from ref to avoid stale closure
    const params = paramsRef.current;

    try {
      const { results } = await getDataSource().calculateKpis({
        connectionId: params.activeConnectionId,
        storageConfig: params.storageConfig,
        dateFrom: params.dateFrom.toISOString(),
        dateTo: params.dateTo.toISOString(),
        region: params.region,
        globalFilters: params.globalFilters,
        settings: params.settings,
        // Relay mode computes client-side over the dataset already in memory.
        issues: params.relayIssues,
      });

      lastCalculationParamsRef.current = JSON.stringify({
        dateFrom: params.dateFrom.toISOString(),
        dateTo: params.dateTo.toISOString(),
        globalFilters: params.globalFilters,
        activeConnectionId: params.activeConnectionId,
        region: params.region,
        storageConfig: params.storageConfig,
        customWidgets: params.customWidgets || []
      });
      return results;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[useKpiCalculations] Request timeout after 120 seconds');
        throw new Error('KPI calculation request timed out after 120 seconds');
      }
      console.error('[useKpiCalculations] Calculation failed:', error);
      throw error instanceof Error ? error : new Error('KPI calculation failed');
    }
  }, []);

  // @MX:NOTE: Stable cache key serialization to prevent unnecessary re-fetches
  // Date objects and filter objects are serialized to strings for stable comparison.
  // The trailing element is the relay-mode dataset stamp (lastUpdated) so a
  // dataset refresh recalculates; it is undefined in server mode, whose key
  // prefix is therefore unchanged from the pre-seam shape.
  const stableQueryKey = useMemo(() => {
    const filtersKey = globalFilters ? JSON.stringify(globalFilters) : 'empty';
    const customWidgetsKey = customWidgets ? JSON.stringify([...customWidgets].sort()) : 'empty';
    return [
      'kpi-results',
      activeConnectionId,
      region,
      storageConfig,
      dateFrom.toISOString(),
      dateTo.toISOString(),
      filtersKey,
      customWidgetsKey,
      isRelayMode() ? masterDatasetInfo?.lastUpdated : undefined,
    ];
  }, [activeConnectionId, region, storageConfig, masterDatasetInfo?.lastUpdated, dateFrom, dateTo, globalFilters, customWidgets]);

  /**
   * React Query for KPI data with caching
   */
  const {
    data,
    isLoading: isQueryLoading,
    isError: isQueryError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: stableQueryKey,
    queryFn: fetchKpiCalculations,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    // Don't fire a calculation without a data source — server mode requires a
    // connectionId (or inline issues), and relay mode additionally needs the
    // dataset loaded in memory. Without either, the query would only produce
    // a 400/error banner on a freshly-opened KPI tab.
    enabled: pollingEnabled && !!activeConnectionId
      && (!isRelayMode() || (masterDatasetInfo?.issues?.length ?? 0) > 0),
  });

  /**
   * Update Zustand store when query results change
   * @MX:NOTE: Syncs empty results too so stale results are cleared. Skips while
   * the query has no definitive result yet (loading/disabled) or is in an error
   * state, so last good data is kept instead of being wiped by failures.
   * @MX:NOTE: This is the ONLY writer of the store's kpiResults slice during
   * normal dashboard operation — it always writes the FULL, unfiltered query
   * payload. Plugin visibility filtering is derived at render time by
   * KpiDashboard and never written back to the store.
   */
  useEffect(() => {
    if (data === undefined || isQueryError) return;
    setKpiResults(data);
  }, [data, isQueryError, setKpiResults]);

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
    setCalculatingWidgets(Array.from(isCalculatingRef.current));

    try {
      if (widgetId) {
        // Custom widget calculation
        console.log(`[useKpiCalculations] Calculating custom widget: ${widgetId}`);
        const result = await fetchKpiCalculations();
        const widgetResult = { context: {}, results: result };

        // Functional update reads the latest record — no stale-closure risk.
        setCustomWidgetResults((prev) => ({ ...prev, [widgetId]: widgetResult }));
      } else {
        // Full KPI recalculation
        console.log('[useKpiCalculations] Triggering full KPI recalculation');
        await refetch();
      }
    } finally {
      isCalculatingRef.current.delete(targetWidget);
      setCalculatingSet(new Set(isCalculatingRef.current));
      setCalculatingWidgets(Array.from(isCalculatingRef.current));
    }
  }, [fetchKpiCalculations, refetch, setCalculatingWidgets, setCustomWidgetResults]);

  /**
   * Toggle polling on/off
   */
  const setPollingEnabled = useCallback((enabled: boolean) => {
    setPollingEnabledState(enabled);
  }, []);

  // @MX:NOTE: Stable params serialization for polling comparison
  const currentParamsSerialized = useMemo(() =>
    JSON.stringify({
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      globalFilters,
      activeConnectionId,
      region,
      storageConfig,
      customWidgets: customWidgets || []
    }),
    [dateFrom, dateTo, globalFilters, activeConnectionId, region, storageConfig, customWidgets]
  );

  /**
   * Webhook polling setup (5-minute intervals)
   * @MX:NOTE: Uses isCalculatingRef (not state) inside interval to avoid re-creating interval on every calc start/stop
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

    // Use isCalculatingRef.current (ref, not state) to check without causing re-renders
    pollingIntervalRef.current = setInterval(() => {
      if (isCalculatingRef.current.size === 0) {
        triggerCalculation();
      }
    }, 300000); // 5 minutes

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // @MX:NOTE: Removed calculatingSet from deps — using isCalculatingRef inside interval instead
    // This prevents the effect from re-running (and resetting the timer) on every calc start/stop
    // The function is accessed via ref and params changes are detected via serialized comparison
  }, [settings?.webhooks?.enabled, pollingEnabled, currentParamsSerialized]);

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

  // @MX:NOTE: The store's customWidgetResults slice is already a plain record,
  // so it can be exposed to consumers as-is.
  const isCalculating = isQueryLoading || calculatingSet.size > 0;

  return {
    kpiResults,
    customWidgetResults,
    isCalculating,
    isError: isQueryError,
    error: queryError,
    pollingEnabled,
    triggerCalculation,
    setPollingEnabled,
    refetch,
  };
}
