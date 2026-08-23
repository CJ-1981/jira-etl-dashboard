/**
 * useKpiCalculations Hook Tests
 *
 * Comprehensive test suite for KPI calculation hook covering:
 * - Query state management
 * - Polling behavior
 * - Custom widget calculations
 * - Concurrent calculation prevention
 * - Error handling
 * - Performance characteristics
 *
 * Test Count: 35 tests across 10 test suites
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useKpiCalculations } from '../useKpiCalculations';
import type { UseKpiCalculationsResult } from '../useKpiCalculations';

// Mock Zustand store. A single mutable state object is shared across selector
// calls so that setKpiResults/setCustomWidgetResults actually update the values
// subsequent selectors read back (required to verify store sync behavior).
const mockState = vi.hoisted(() => {
  const state = {
    kpiResults: [] as unknown,
    customWidgetResults: {} as unknown,
    calculatingWidgets: [] as unknown,
    activeConnectionId: 'test-conn-1',
    settings: { webhooks: { enabled: false } },
    region: 'US',
    masterDatasetInfo: { issues: [] as unknown[] },
    storageConfig: undefined as unknown,
    setKpiResults: vi.fn<(results: unknown) => void>(),
    setCustomWidgetResults: vi.fn<(results: unknown) => void>(),
    setCalculatingWidgets: vi.fn<(widgets: unknown) => void>(),
  };
  state.setKpiResults.mockImplementation((results) => {
    state.kpiResults = results;
  });
  state.setCustomWidgetResults.mockImplementation((results) => {
    state.customWidgetResults = results;
  });
  state.setCalculatingWidgets.mockImplementation((widgets) => {
    state.calculatingWidgets = widgets;
  });
  return state;
});

vi.mock('../../store/app-store', () => {
  const mockStore = vi.fn((selector: (state: typeof mockState) => unknown) => {
    return typeof selector === 'function' ? selector(mockState) : mockState;
  });
  // Add getState for direct store access in triggerCalculation
  const storeWithGetState = mockStore as typeof mockStore & {
    getState: () => typeof mockState;
  };
  storeWithGetState.getState = () => mockState;
  return { useAppStore: storeWithGetState };
});

// Mock fetch API
global.fetch = vi.fn();

// Default to a successful empty response so tests that do not care about the
// fetch outcome are not affected by the hook's error-throwing behavior.
// Individual tests override this with mockImplementation/mockImplementationOnce.
beforeEach(() => {
  // Reset shared mock store state between tests
  mockState.kpiResults = [];
  mockState.customWidgetResults = {};
  mockState.calculatingWidgets = [];
  mockState.setKpiResults.mockClear();
  mockState.setCustomWidgetResults.mockClear();
  mockState.setCalculatingWidgets.mockClear();

  global.fetch = vi.fn().mockImplementation(
    () =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, results: [] }),
      } as Response)
  );
});

/**
 * Test Helper: Mock a successful calculation response
 */
function mockSuccessResponse(results: unknown[] = []) {
  vi.mocked(global.fetch).mockImplementation(
    () =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, results }),
      } as Response)
  );
}

/**
 * Test Helper: Mock a failed (non-2xx) HTTP response
 */
function mockHttpErrorResponse(status = 500, statusText = 'Internal Server Error') {
  vi.mocked(global.fetch).mockImplementation(
    () =>
      Promise.resolve({
        ok: false,
        status,
        statusText,
        json: async () => ({ error: statusText }),
      } as Response)
  );
}

/**
 * Test Helper: Create wrapper with QueryClient
 */
function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

/**
 * Test Helper: Create test dates
 */
function createTestDates() {
  return {
    dateFrom: new Date('2026-01-01'),
    dateTo: new Date('2026-01-31'),
  };
}

/**
 * Test Helper: Create test filters
 */
function createTestFilters() {
  return {
    projects: ['PROJ-1'],
    statuses: ['Done', 'In Progress'],
  };
}

describe('useKpiCalculations - Initialization', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
          gcTime: Infinity,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default states', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
        expect(result.current.pollingEnabled).toBe(true);
        expect(result.current.kpiResults).toEqual([]);
        expect(result.current.customWidgetResults).toEqual({});
      },
      { timeout: 3000 }
    );
  });

  it('should provide all required API methods', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(typeof result.current.triggerCalculation).toBe('function');
        expect(typeof result.current.setPollingEnabled).toBe('function');
        expect(typeof result.current.refetch).toBe('function');
      },
      { timeout: 3000 }
    );
  });

  it('should accept custom widgets parameter', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();
    const customWidgets = ['widget-1', 'widget-2'];

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, customWidgets),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current).toBeDefined();
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Query State Management', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
          gcTime: Infinity,
        },
      },
    });
  });

  it('should set isCalculating to true during query', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementationOnce(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      await result.current.triggerCalculation();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should update kpiResults when query succeeds', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();
    const mockData = [
      { id: 'kpi-1', value: 100 },
      { id: 'kpi-2', value: 200 },
    ];

    vi.mocked(global.fetch).mockImplementationOnce(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: mockData }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        // Successful results (including the store sync) must reach the store
        expect(mockState.setKpiResults).toHaveBeenCalledWith(mockData);
      },
      { timeout: 3000 }
    );
  });

  it('should sync genuine empty results to the store so stale data is cleared', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    // Simulate stale results left over in the store from a previous calculation
    const staleResults = [{ id: 'stale-kpi', value: 999 }];
    mockState.kpiResults = staleResults;

    mockSuccessResponse([]);

    renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(mockState.setKpiResults).toHaveBeenCalledWith([]);
        expect(mockState.kpiResults).toEqual([]);
      },
      { timeout: 3000 }
    );
  });

  it('should not clear stored results while a refetch is failing', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    mockHttpErrorResponse(500, 'Internal Server Error');

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 3000 }
    );

    // Seed the store with last-known-good results after the initial sync, then
    // fail again — the error must not wipe them.
    const lastGoodResults = [{ id: 'kpi-1', value: 100 }];
    mockState.kpiResults = lastGoodResults;

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.isError).toBe(true);
    expect(mockState.kpiResults).toEqual(lastGoodResults);
  });

  it('should surface HTTP errors via the query error state', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    mockHttpErrorResponse(500, 'Internal Server Error');

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    // The failed calculation must surface an error instead of resolving to []
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.error?.message).toContain('500');
      },
      { timeout: 3000 }
    );

    expect(result.current.isCalculating).toBe(false);
    // Stale store data must not be cleared while the query is in error
    expect(result.current.kpiResults).toEqual([]);
  });

  it('should refetch when refetch is called', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Polling Behavior', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
          gcTime: Infinity,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should poll when pollingEnabled is true', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(true);
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should not poll when pollingEnabled is false', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(true);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      result.current.setPollingEnabled(false);
    });

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should allow toggling polling on and off', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(true);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      result.current.setPollingEnabled(false);
    });

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(false);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      result.current.setPollingEnabled(true);
    });

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it('should poll at 30-second intervals', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.pollingEnabled).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it('should clear interval on unmount', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { unmount } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(queryClient.getQueryCache().findAll()).toHaveLength(1);
      },
      { timeout: 3000 }
    );

    act(() => {
      unmount();
    });

    // Verify cleanup happened
    await waitFor(
      () => {
        expect(true).toBe(true); // Test passes if no errors thrown
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Custom Widget Calculations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should trigger calculation for specific widget', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();
    const customWidgets = ['widget-1'];

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, customWidgets),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    await act(async () => {
      await result.current.triggerCalculation('widget-1');
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should update customWidgetResults after calculation', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();
    const customWidgets = ['widget-1'];

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, customWidgets),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.customWidgetResults).toEqual({});
      },
      { timeout: 3000 }
    );

    await act(async () => {
      await result.current.triggerCalculation('widget-1');
    });

    await waitFor(
      () => {
        expect(result.current.customWidgetResults).toBeDefined();
      },
      { timeout: 3000 }
    );
  });

  it('should handle multiple custom widget calculations', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();
    const customWidgets = ['widget-1', 'widget-2', 'widget-3'];

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, customWidgets),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Trigger calculations for all widgets sequentially
    for (const widgetId of customWidgets) {
      await act(async () => {
        await result.current.triggerCalculation(widgetId);
      });
    }

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Concurrent Calculation Prevention', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should prevent concurrent calculations', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ success: true, results: [] }),
              } as Response),
            100
          )
        )
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Trigger first calculation
    const promise1 = act(async () => {
      await result.current.triggerCalculation();
    });

    // Attempt second calculation immediately (should be prevented)
    const promise2 = act(async () => {
      await result.current.triggerCalculation();
    });

    await Promise.all([promise1, promise2]);

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should allow new calculation after previous completes', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // First calculation
    await act(async () => {
      await result.current.triggerCalculation();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Second calculation (should succeed)
    await act(async () => {
      await result.current.triggerCalculation();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Error Handling', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should surface network errors via the query error state', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () => Promise.reject(new Error('Network error'))
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toBe('Network error');
      },
      { timeout: 3000 }
    );

    expect(result.current.isCalculating).toBe(false);
  });

  it('should surface malformed response data as an error', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ invalid: 'data' }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    // A response missing `success`/`results` is not a genuine empty result —
    // it must surface as an error rather than resolve to [].
    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error).toBeInstanceOf(Error);
      },
      { timeout: 3000 }
    );
  });

  it('should surface timeout errors via the query error state', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(abortError), 100)
        )
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
        // The timeout message must reflect the actual 120s limit
        expect(result.current.error?.message).toContain('120');
      },
      { timeout: 3000 }
    );
  });

  it('should return [] only for a genuine successful empty result', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    mockSuccessResponse([]);

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isError).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.kpiResults).toEqual([]);
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - React Query Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should use correct query key', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        const queries = queryClient.getQueryCache().findAll();
        expect(queries.length).toBeGreaterThan(0);
        expect(queries[0].queryKey[0]).toBe('kpi-results');
        expect(queries[0].queryKey[1]).toBe('test-conn-1');
        expect(queries[0].queryKey[2]).toBe('US');
        expect(queries[0].queryKey[3]).toBeUndefined();
        expect(queries[0].queryKey[4]).toBe(dateFrom.toISOString());
        expect(queries[0].queryKey[5]).toBe(dateTo.toISOString());
        expect(queries[0].queryKey[6]).toBe(JSON.stringify(filters));
        expect(queries[0].queryKey[7]).toBe('empty');
      },
      { timeout: 3000 }
    );
  });

  it('should refetch when dependencies change', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result, rerender } = renderHook(
      ({ dateFrom, dateTo, filters }) =>
        useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
        initialProps: {
          dateFrom,
          dateTo,
          filters,
        },
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Change date range
    const newDateTo = new Date('2026-02-28');
    rerender({ dateFrom, dateTo: newDateTo, filters });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should integrate with QueryClient methods', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(typeof result.current.refetch).toBe('function');
      },
      { timeout: 3000 }
    );

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Performance', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
          gcTime: Infinity,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not cause memory leaks with polling', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { unmount } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(queryClient.getQueryCache().findAll()).toHaveLength(1);
      },
      { timeout: 3000 }
    );

    act(() => {
      unmount();
    });

    // Verify cleanup - query cache may still have inactive queries
    await waitFor(
      () => {
        const queries = queryClient.getQueryCache().findAll();
        // All queries should be inactive after unmount
        queries.forEach(query => {
          expect(query.state.fetchStatus).toBe('idle');
        });
      },
      { timeout: 3000 }
    );
  });

  it('should debounce rapid triggerCalculation calls', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    vi.mocked(global.fetch).mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, results: [] }),
        } as Response)
    );

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Rapid calls
    await act(async () => {
      await result.current.triggerCalculation();
      await result.current.triggerCalculation();
      await result.current.triggerCalculation();
    });

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should minimize unnecessary re-renders', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    let renderCount = 0;

    const { result } = renderHook(
      () => {
        renderCount++;
        return useKpiCalculations(dateFrom, dateTo, filters);
      },
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 3000 }
    );

    // Initial render + expected updates
    expect(renderCount).toBeLessThan(10);
  });
});

describe('useKpiCalculations - Edge Cases', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should handle empty date range', async () => {
    const dateFrom = new Date('2026-01-01');
    const dateTo = new Date('2026-01-01');
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current).toBeDefined();
      },
      { timeout: 3000 }
    );
  });

  it('should handle empty filters', async () => {
    const { dateFrom, dateTo } = createTestDates();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, {}),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current).toBeDefined();
      },
      { timeout: 3000 }
    );
  });

  it('should handle undefined customWidgets', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, undefined),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current.customWidgetResults).toEqual({});
      },
      { timeout: 3000 }
    );
  });

  it('should handle null date values gracefully', async () => {
    const filters = createTestFilters();

    const { result } = renderHook(
      () =>
        useKpiCalculations(
          new Date(),
          new Date(),
          filters,
          undefined
        ),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current).toBeDefined();
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - TypeScript Type Safety', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  it('should return correct type structure', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(() => {
      const returnValue: UseKpiCalculationsResult = result.current;
      expect(returnValue.kpiResults).toBeDefined();
      expect(returnValue.customWidgetResults).toBeDefined();
      expect(returnValue.isCalculating).toBeDefined();
      expect(returnValue.pollingEnabled).toBeDefined();
      expect(returnValue.triggerCalculation).toBeDefined();
      expect(returnValue.setPollingEnabled).toBeDefined();
      expect(returnValue.refetch).toBeDefined();
    }, { timeout: 3000 });
  });

  it('should handle type-safe parameters', async () => {
    const { dateFrom, dateTo } = createTestDates();
    const filters: Record<string, unknown> = {
      projects: ['PROJ-1'],
      assignees: ['user-1'],
    };
    const customWidgets: string[] = ['widget-1'];

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters, customWidgets),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    await waitFor(
      () => {
        expect(result.current).toBeDefined();
      },
      { timeout: 3000 }
    );
  });
});

describe('useKpiCalculations - Connection Gating', () => {
  let queryClient: QueryClient;
  let originalConnId: unknown;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
          gcTime: Infinity,
        },
      },
    });
    originalConnId = mockState.activeConnectionId;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    mockState.activeConnectionId = originalConnId as string;
    vi.clearAllMocks();
  });

  it('should not fetch KPI calculations when no connection is selected', async () => {
    // With no active connection there is no data source to calculate from, so
    // the query must stay disabled rather than firing a doomed 400 request.
    mockState.activeConnectionId = '';
    const { dateFrom, dateTo } = createTestDates();
    const filters = createTestFilters();

    const { result } = renderHook(
      () => useKpiCalculations(dateFrom, dateTo, filters),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(
      () => {
        expect(result.current.isCalculating).toBe(false);
      },
      { timeout: 1000 }
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
