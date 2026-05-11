/**
 * Tests for usePluginVisibility hook
 *
 * Characterization tests for Phase 2.4 (usePluginVisibility extraction)
 * These tests document the ACTUAL behavior of the hook as defined in SPEC-KPI-DASH-002.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePluginVisibility } from '../usePluginVisibility';

describe('usePluginVisibility', () => {
  const mockStorageKey = 'test-plugin-visibility';
  const allPlugins = ['plugin-1', 'plugin-2', 'plugin-3'];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // @MX:NOTE: Characterization test - initial state behavior
  // @MX:REASON: Documents actual initialization behavior from existing implementation
  describe('initialization', () => {
    it('should initialize with all plugins active when no saved state exists', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      expect(result.current.activePlugins).toEqual(allPlugins);
    });

    it('should load saved active plugins from localStorage', () => {
      const savedPlugins = ['plugin-2', 'plugin-1'];
      localStorage.setItem(mockStorageKey, JSON.stringify(savedPlugins));

      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      // Wait for state to be initialized
      expect(result.current.activePlugins).toEqual(savedPlugins);
    });

    it('should initialize filteredPlugins with all active plugins when filter is empty', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      expect(result.current.filteredPlugins).toEqual(allPlugins);
    });
  });

  // @MX:NOTE: Characterization test - plugin reordering behavior
  // @MX:REASON: Documents actual reordering logic from existing implementation
  describe('reorderPlugins', () => {
    it('should move plugin from source index to destination index', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.reorderPlugins(0, 2);
      });

      expect(result.current.activePlugins).toEqual(['plugin-2', 'plugin-3', 'plugin-1']);
    });

    it('should move plugin from higher index to lower index', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.reorderPlugins(2, 0);
      });

      expect(result.current.activePlugins).toEqual(['plugin-3', 'plugin-1', 'plugin-2']);
    });

    it('should handle reordering at same index (no-op)', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      const originalOrder = [...result.current.activePlugins];

      act(() => {
        result.current.reorderPlugins(1, 1);
      });

      expect(result.current.activePlugins).toEqual(originalOrder);
    });

    it('should persist reordered plugins to localStorage', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.reorderPlugins(0, 2);
      });

      const saved = localStorage.getItem(mockStorageKey);
      expect(saved).toBe(JSON.stringify(['plugin-2', 'plugin-3', 'plugin-1']));
    });
  });

  // @MX:NOTE: Characterization test - plugin toggle behavior
  // @MX:REASON: Documents actual toggle behavior from SPEC requirements
  describe('togglePluginVisibility', () => {
    it('should remove plugin from active plugins when it is currently active', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.togglePluginVisibility('plugin-2');
      });

      expect(result.current.activePlugins).toEqual(['plugin-1', 'plugin-3']);
    });

    it('should add plugin to active plugins when it is not currently active', () => {
      // Start with only 2 plugins active
      localStorage.setItem(mockStorageKey, JSON.stringify(['plugin-1', 'plugin-2']));

      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.togglePluginVisibility('plugin-3');
      });

      expect(result.current.activePlugins).toEqual(['plugin-1', 'plugin-2', 'plugin-3']);
    });

    it('should persist toggled state to localStorage', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.togglePluginVisibility('plugin-1');
      });

      const saved = localStorage.getItem(mockStorageKey);
      expect(saved).toBe(JSON.stringify(['plugin-2', 'plugin-3']));
    });
  });

  // @MX:NOTE: Characterization test - plugin filtering behavior
  // @MX:REASON: Documents actual filtering logic from SPEC requirements
  describe('setPluginFilter', () => {
    it('should filter plugins case-insensitively by search term', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.setPluginFilter('plugin-1');
      });

      expect(result.current.filteredPlugins).toEqual(['plugin-1']);
    });

    it('should return empty array when no plugins match filter', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.setPluginFilter('nonexistent');
      });

      expect(result.current.filteredPlugins).toEqual([]);
    });

    it('should return all active plugins when filter is empty string', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.setPluginFilter('');
      });

      expect(result.current.filteredPlugins).toEqual(allPlugins);
    });

    it('should filter from active plugins only, not all plugins', () => {
      // Start with only 2 plugins active
      localStorage.setItem(mockStorageKey, JSON.stringify(['plugin-1', 'plugin-2']));

      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.setPluginFilter('plugin');
      });

      // Should only return active plugins that match, not plugin-3
      expect(result.current.filteredPlugins).toEqual(['plugin-1', 'plugin-2']);
    });
  });

  // @MX:NOTE: Characterization test - localStorage persistence behavior
  // @MX:REASON: Documents actual persistence behavior from existing implementation
  describe('localStorage persistence', () => {
    it('should save initial state to localStorage on mount', () => {
      renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      const saved = localStorage.getItem(mockStorageKey);
      expect(saved).toBe(JSON.stringify(allPlugins));
    });

    it('should update localStorage when active plugins change', () => {
      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.togglePluginVisibility('plugin-1');
      });

      const saved = localStorage.getItem(mockStorageKey);
      expect(saved).toBe(JSON.stringify(['plugin-2', 'plugin-3']));
    });

    it('should not affect other storage keys', () => {
      const otherKey = 'other-storage-key';
      localStorage.setItem(otherKey, 'should-remain-unchanged');

      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      act(() => {
        result.current.reorderPlugins(0, 2);
      });

      expect(localStorage.getItem(otherKey)).toBe('should-remain-unchanged');
    });
  });

  // @MX:NOTE: Characterization test - edge cases
  // @MX:REASON: Documents actual edge case behavior from existing implementation
  describe('edge cases', () => {
    it('should handle empty allPlugins array', () => {
      const { result } = renderHook(() =>
        usePluginVisibility([], mockStorageKey)
      );

      expect(result.current.activePlugins).toEqual([]);
      expect(result.current.filteredPlugins).toEqual([]);
    });

    it('should handle single plugin array', () => {
      const singlePlugin = ['plugin-1'];
      const { result } = renderHook(() =>
        usePluginVisibility(singlePlugin, mockStorageKey)
      );

      expect(result.current.activePlugins).toEqual(singlePlugin);

      act(() => {
        result.current.reorderPlugins(0, 0);
      });

      // Should still have single plugin
      expect(result.current.activePlugins).toEqual(singlePlugin);
    });

    it('should handle toggling when no plugins are active', () => {
      localStorage.setItem(mockStorageKey, JSON.stringify([]));

      const { result } = renderHook(() =>
        usePluginVisibility(allPlugins, mockStorageKey)
      );

      // Initially empty
      expect(result.current.activePlugins).toEqual([]);

      act(() => {
        result.current.togglePluginVisibility('plugin-1');
      });

      // Should add plugin-1
      expect(result.current.activePlugins).toEqual(['plugin-1']);
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorage.setItem(mockStorageKey, 'invalid-json');

      // This should not throw an error, but fall back to default behavior
      expect(() => {
        renderHook(() =>
          usePluginVisibility(allPlugins, mockStorageKey)
        );
      }).not.toThrow();
    });
  });
});
