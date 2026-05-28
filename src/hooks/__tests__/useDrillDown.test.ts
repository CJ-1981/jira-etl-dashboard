/**
 * Characterization tests for useDrillDown hook
 *
 * These tests capture the ACTUAL current behavior of drill-down in KpiDashboard
 * before refactoring to extract the hook.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrillDown } from '../useDrillDown';

describe('useDrillDown - Characterization Tests', () => {
  it('should initialize with closed state (null keys)', () => {
    const { result } = renderHook(() => useDrillDown());

    // Characterizes: Initial state is closed (null keys, empty title)
    expect(result.current.drillDownKeys).toBe(null);
    expect(result.current.drillDownTitle).toBe('');
    expect(result.current.isDrillDownOpen).toBe(false);
  });

  it('should open drill-down with ticket keys and title', () => {
    const { result } = renderHook(() => useDrillDown());

    act(() => {
      result.current.openDrillDown(['KEY-1', 'KEY-2', 'KEY-3'], 'Sample Metric');
    });

    // Characterizes: openDrillDown sets keys array and title string
    expect(result.current.drillDownKeys).toEqual(['KEY-1', 'KEY-2', 'KEY-3']);
    expect(result.current.drillDownTitle).toBe('Sample Metric');
    expect(result.current.isDrillDownOpen).toBe(true);
  });

  it('should close drill-down when closed', () => {
    const { result } = renderHook(() => useDrillDown());

    act(() => {
      result.current.openDrillDown(['KEY-1', 'KEY-2'], 'Test');
    });

    expect(result.current.isDrillDownOpen).toBe(true);

    act(() => {
      result.current.closeDrillDown();
    });

    // Characterizes: closeDrillDown resets keys to null and title to empty
    expect(result.current.drillDownKeys).toBe(null);
    expect(result.current.drillDownTitle).toBe('');
    expect(result.current.isDrillDownOpen).toBe(false);
  });

  it('should preserve context across multiple open/close cycles', () => {
    const { result } = renderHook(() => useDrillDown());

    // First cycle
    act(() => {
      result.current.openDrillDown(['KEY-1'], 'First');
    });
    expect(result.current.drillDownKeys).toEqual(['KEY-1']);
    expect(result.current.drillDownTitle).toBe('First');

    act(() => {
      result.current.closeDrillDown();
    });
    expect(result.current.drillDownKeys).toBe(null);

    // Second cycle with different data
    act(() => {
      result.current.openDrillDown(['KEY-2', 'KEY-3'], 'Second');
    });
    expect(result.current.drillDownKeys).toEqual(['KEY-2', 'KEY-3']);
    expect(result.current.drillDownTitle).toBe('Second');
  });
});
