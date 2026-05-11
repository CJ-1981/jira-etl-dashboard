/**
 * Test Utilities for Hooks
 *
 * Common mocks and utilities for testing custom hooks.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { vi, expect, beforeEach, afterEach } from 'vitest';

/**
 * Mock localStorage for testing hooks with persistence
 */
export const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

/**
 * Mock Zustand store for testing hooks with store integration
 */
export const mockAppStore = (() => {
  let state: Record<string, unknown> = {
    kpiResults: [],
    customWidgetResults: {},
    calculatingWidgets: [],
    dashboardJqlQuery: '',
    masterDatasetInfo: {
      availableStartDate: null,
    },
  };

  return {
    getState: () => state,
    setState: (newState: Record<string, unknown>) => {
      state = { ...state, ...newState };
    },
    // Store actions
    setKpiResults: (results: unknown[]) => {
      state.kpiResults = results;
    },
    setCustomWidgetResults: (results: Record<string, unknown>) => {
      state.customWidgetResults = results;
    },
    setCalculatingWidgets: (widgets: string[]) => {
      state.calculatingWidgets = widgets;
    },
    setDashboardJqlQuery: (query: string) => {
      state.dashboardJqlQuery = query;
    },
  };
})();

/**
 * Mock @tanstack/react-query for testing hooks with queries
 */
export const mockQueryClient = {
  invalidateQueries: vi.fn(),
  refetchQueries: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
};

/**
 * Helper to test hook updates over time
 */
export async function waitForHookUpdate<T>(
  callback: () => T,
  timeout = 1000
): Promise<T> {
  return waitFor(callback, { timeout });
}

/**
 * Helper to advance timers in tests
 */
export function advanceTimers(ms: number) {
  vi.advanceTimersByTime(ms);
}

/**
 * Setup function to run before each test
 */
export function setupTestMocks() {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
}
