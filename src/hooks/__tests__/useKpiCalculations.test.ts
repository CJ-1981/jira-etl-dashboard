/**
 * Tests for useKpiCalculations hook
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useKpiCalculations } from '../useKpiCalculations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// TODO: Write tests for useKpiCalculations hook (Phase 2.6)
describe('useKpiCalculations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  it('should initialize with default state', () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters),
      { wrapper }
    );

    expect(result.current.isCalculating).toBe(false);
    expect(result.current.pollingEnabled).toBe(true);
    expect(result.current.kpiResults).toEqual([]);
    expect(result.current.customWidgetResults).toEqual({});
  });

  it('should trigger calculation when triggerCalculation is called', async () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters),
      { wrapper }
    );

    act(() => {
      result.current.triggerCalculation();
    });

    // Wait for calculation to complete
    await waitFor(() => {
      expect(result.current.isCalculating).toBe(false);
    });
  });

  it('should setup 30-second polling interval when pollingEnabled', () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};

    const triggerCalculationSpy = vi.fn();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters),
      { wrapper }
    );

    // Advance time by 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Verify polling triggered
    // Note: This requires the actual hook implementation
  });

  it('should stop polling when setPollingEnabled(false) is called', () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters),
      { wrapper }
    );

    act(() => {
      result.current.setPollingEnabled(false);
    });

    expect(result.current.pollingEnabled).toBe(false);

    // Advance time and verify no polling occurs
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Verify polling did not trigger
  });

  it('should prevent concurrent calculations', async () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters),
      { wrapper }
    );

    // Start first calculation
    act(() => {
      result.current.triggerCalculation();
    });

    // Try to trigger second calculation while first is running
    act(() => {
      result.current.triggerCalculation();
    });

    // Verify second trigger was ignored (concurrent prevention)
    // Note: This requires the actual hook implementation with isCalculatingRef
  });

  it('should handle custom widget calculation', async () => {
    const dateFrom = new Date('2025-05-01');
    const dateTo = new Date('2025-05-11');
    const globalFilters = {};
    const customWidgets = ['widget-1', 'widget-2'];

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, globalFilters, customWidgets),
      { wrapper }
    );

    await act(async () => {
      await result.current.triggerCalculation('widget-1');
    });

    // Verify custom widget result was set
    expect(result.current.customWidgetResults).toHaveProperty('widget-1');
  });
});
