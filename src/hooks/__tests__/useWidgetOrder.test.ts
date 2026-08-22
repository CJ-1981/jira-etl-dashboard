/**
 * useWidgetOrder Hook Tests
 *
 * Test suite for widget order management covering:
 * - Initialization from localStorage
 * - Reordering and visibility toggling
 * - Cross-instance synchronization (storage + custom events)
 * - Persistence lifecycle after sync (regression: isSyncing flag stuck true)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWidgetOrder } from '../useWidgetOrder';

const STORAGE_KEY = 'widget_display_order';
const WIDGET_ORDER_CHANGE_EVENT = 'widget-order-change';

describe('useWidgetOrder - Initialization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with an empty order when nothing is stored', () => {
    const { result } = renderHook(() => useWidgetOrder());
    expect(result.current.widgetOrder).toEqual([]);
  });

  it('should load the saved order from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kpi-1', 'kpi-2', 'kpi-3']));

    const { result } = renderHook(() => useWidgetOrder());

    expect(result.current.widgetOrder).toEqual(['kpi-1', 'kpi-2', 'kpi-3']);
  });

  it('should exclude panel ids when loading the saved order', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kpi-1', 'panel-summary', 'kpi-2'])
    );

    const { result } = renderHook(() => useWidgetOrder());

    expect(result.current.widgetOrder).toEqual(['kpi-1', 'kpi-2']);
  });

  it('should initialize with an empty order when stored data is corrupt', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, '{not-valid-json');

    const { result } = renderHook(() => useWidgetOrder());

    expect(result.current.widgetOrder).toEqual([]);
    consoleErrorSpy.mockRestore();
  });
});

describe('useWidgetOrder - Reordering and Visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kpi-1', 'kpi-2', 'kpi-3']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reorder widgets and persist the new order', () => {
    const { result } = renderHook(() => useWidgetOrder());

    act(() => {
      result.current.reorderWidget(0, 2);
    });

    expect(result.current.widgetOrder).toEqual(['kpi-2', 'kpi-3', 'kpi-1']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      'kpi-2',
      'kpi-3',
      'kpi-1',
    ]);
  });

  it('should toggle widget visibility off and persist', () => {
    const { result } = renderHook(() => useWidgetOrder());

    act(() => {
      result.current.toggleWidgetVisibility('kpi-2');
    });

    expect(result.current.widgetOrder).toEqual(['kpi-1', 'kpi-3']);
    expect(result.current.isWidgetVisible('kpi-2')).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      'kpi-1',
      'kpi-3',
    ]);
  });

  it('should toggle widget visibility on and persist', () => {
    const { result } = renderHook(() => useWidgetOrder());

    act(() => {
      result.current.toggleWidgetVisibility('kpi-2');
    });
    act(() => {
      result.current.toggleWidgetVisibility('kpi-2');
    });

    expect(result.current.widgetOrder).toEqual(['kpi-1', 'kpi-3', 'kpi-2']);
    expect(result.current.isWidgetVisible('kpi-2')).toBe(true);
  });
});

describe('useWidgetOrder - Cross-Instance Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kpi-1', 'kpi-2', 'kpi-3']));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Simulates another hook instance (or tab) writing a new order and
   * announcing it via the same-tab custom event.
   */
  function simulateExternalSync(newOrder: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
    act(() => {
      window.dispatchEvent(new CustomEvent(WIDGET_ORDER_CHANGE_EVENT));
    });
  }

  it('should adopt the order written by another instance on the sync event', () => {
    const { result } = renderHook(() => useWidgetOrder());

    simulateExternalSync(['kpi-3', 'kpi-2', 'kpi-1']);

    expect(result.current.widgetOrder).toEqual(['kpi-3', 'kpi-2', 'kpi-1']);
  });

  it('should not echo-write to localStorage when syncing from another instance', () => {
    const { result } = renderHook(() => useWidgetOrder());

    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    // Another instance writes the new order...
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kpi-3', 'kpi-2', 'kpi-1']));
    const callsAfterExternalWrite = setItemSpy.mock.calls.length;

    // ...and announces it
    act(() => {
      window.dispatchEvent(new CustomEvent(WIDGET_ORDER_CHANGE_EVENT));
    });

    expect(result.current.widgetOrder).toEqual(['kpi-3', 'kpi-2', 'kpi-1']);
    // The sync itself must not trigger an additional persist (no echo write)
    expect(setItemSpy.mock.calls.length).toBe(callsAfterExternalWrite);
  });

  it('should persist user-initiated changes after a sync event (regression)', () => {
    const { result } = renderHook(() => useWidgetOrder());

    // A sync from another instance used to leave isSyncing stuck at true,
    // which silently disabled persistence for all subsequent user changes.
    simulateExternalSync(['kpi-3', 'kpi-2', 'kpi-1']);
    expect(result.current.widgetOrder).toEqual(['kpi-3', 'kpi-2', 'kpi-1']);

    act(() => {
      result.current.reorderWidget(0, 2);
    });

    expect(result.current.widgetOrder).toEqual(['kpi-2', 'kpi-1', 'kpi-3']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      'kpi-2',
      'kpi-1',
      'kpi-3',
    ]);
  });

  it('should persist visibility toggles after multiple sync events (regression)', () => {
    const { result } = renderHook(() => useWidgetOrder());

    simulateExternalSync(['kpi-3', 'kpi-2', 'kpi-1']);
    simulateExternalSync(['kpi-3', 'kpi-1']);

    act(() => {
      result.current.toggleWidgetVisibility('kpi-3');
    });

    expect(result.current.widgetOrder).toEqual(['kpi-1']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['kpi-1']);
  });

  it('should adopt changes from cross-tab storage events', () => {
    const { result } = renderHook(() => useWidgetOrder());

    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kpi-2', 'kpi-1']));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: STORAGE_KEY })
      );
    });

    expect(result.current.widgetOrder).toEqual(['kpi-2', 'kpi-1']);
  });
});
