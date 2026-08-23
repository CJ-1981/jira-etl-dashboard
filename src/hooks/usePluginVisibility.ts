/**
 * usePluginVisibility Hook
 *
 * Manages active plugins ordering and plugin filtering logic.
 *
 * Thin wrapper around the generic usePersistedList hook, which implements the
 * shared localStorage persistence / cross-instance synchronization mechanics.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { activePlugins, filteredPlugins, reorderPlugins, togglePluginVisibility } = usePluginVisibility(
 *     allPlugins,
 *     'kpi-plugins'
 *   );
 *   return <div>{filteredPlugins.map(id => <Plugin key={id} id={id} />)}</div>;
 * }
 * ```
 */
import { useState, useCallback, useMemo } from 'react';
import { usePersistedList } from './usePersistedList';

export interface UsePluginVisibilityResult {
  /** Array of active plugin IDs in current order */
  activePlugins: string[];
  /** Filtered array of active plugins based on current filter */
  filteredPlugins: string[];
  /** Reorder plugin from sourceIndex to destIndex */
  reorderPlugins: (sourceIndex: number, destIndex: number) => void;
  /** Toggle plugin visibility (add if inactive, remove if active) */
  togglePluginVisibility: (pluginId: string) => void;
  /** Set filter string for searching plugins */
  setPluginFilter: (filter: string) => void;
}

// Structural validation for values read back from storage
const isStringArray = (parsed: unknown): boolean =>
  Array.isArray(parsed) && parsed.every(item => typeof item === 'string');

/**
 * Hook for managing plugin visibility and ordering.
 *
 * @param allPlugins - Complete list of available plugin IDs
 * @param storageKey - localStorage key for persistence
 * @returns Plugin visibility state and operations
 *
 * @remarks
 * - Initializes from localStorage if available, otherwise uses allPlugins
 * - Persists activePlugins to localStorage on every change
 * - Filters plugins case-insensitively by search term
 * - Toggles plugin visibility (add/remove from active list)
 */
// @MX:NOTE: Main hook implementation for plugin visibility management
// @MX:REASON: Centralizes plugin ordering and filtering logic extracted from KpiDashboard
export function usePluginVisibility(
  allPlugins: string[],
  storageKey: string
): UsePluginVisibilityResult {
  const [filter, setFilter] = useState<string>('');

  // Rebuild the options only when the fallback list changes; keeps the generic
  // hook's storage-key effect stable across unrelated re-renders.
  const options = useMemo(
    () => ({
      fallback: allPlugins,
      isValid: isStringArray,
      // Re-sync immediately on mount / storageKey change (e.g. Plugin Config
      // tab saves a new selection, then user returns to Dashboard).
      syncOnMount: true,
      // An externally removed key means "never configured" → all plugins active.
      resetOnMissingKey: true,
      // The self-write flag must stay up through synchronously-dispatched
      // storage events from other writers (e.g. PluginsPanel's save).
      deferSelfWriteReset: true,
    }),
    [allPlugins]
  );

  const { list, reorder, toggle } = usePersistedList<string>(storageKey, options);

  // Filter plugins based on search term
  const filteredPlugins = useMemo(() => {
    if (!filter) return list;
    return list.filter(id =>
      id.toLowerCase().includes(filter.toLowerCase())
    );
  }, [list, filter]);

  const setPluginFilter = useCallback((newFilter: string) => {
    setFilter(newFilter);
  }, []);

  return {
    activePlugins: list,
    filteredPlugins,
    reorderPlugins: reorder,
    togglePluginVisibility: toggle,
    setPluginFilter,
  };
}
