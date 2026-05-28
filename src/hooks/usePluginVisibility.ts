/**
 * usePluginVisibility Hook
 *
 * Manages active plugins ordering and plugin filtering logic.
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
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

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
  // Initialize from local storage or default to all plugins
  const [activePlugins, setActivePlugins] = useState<string[]>(() => {
    if (typeof window === 'undefined') return allPlugins;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed;
      }
      return allPlugins;
    } catch (error) {
      // If localStorage is corrupted or unavailable, fall back to all plugins
      console.error(`Failed to load ${storageKey} from localStorage:`, error);
      return allPlugins;
    }
  });

  const [filter, setFilter] = useState<string>('');
  // Guard: true while this hook is writing to storage to avoid reacting to its own events
  const isSelfWriting = useRef(false);

  // Re-sync from localStorage whenever the storage key changes externally
  // (e.g. Plugin Config tab saves a new selection, then user returns to Dashboard)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromStorage = () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === null) {
          setActivePlugins(allPlugins);
          return;
        }
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
          setActivePlugins(parsed);
        } else {
          console.error(`Invalid structure in ${storageKey} localStorage data, resetting to default.`);
          setActivePlugins(allPlugins);
        }
      } catch (error) {
        console.error(`Failed to sync ${storageKey} from localStorage, resetting to default:`, error);
        setActivePlugins(allPlugins);
      }
    };

    // Immediate sync on mount / storageKey change
    syncFromStorage();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && !isSelfWriting.current) {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [storageKey, allPlugins]);

  // Persist to local storage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      isSelfWriting.current = true;
      localStorage.setItem(storageKey, JSON.stringify(activePlugins));
      // Reset on next microtask so the storage event (dispatched synchronously by PluginsPanel)
      // is processed before we clear the flag
      Promise.resolve().then(() => { isSelfWriting.current = false; });
    } catch (error) {
      isSelfWriting.current = false;
      console.error(`Failed to save ${storageKey} to localStorage:`, error);
    }
  }, [activePlugins, storageKey]);

  // Filter plugins based on search term
  const filteredPlugins = useMemo(() => {
    if (!filter) return activePlugins;
    return activePlugins.filter(id =>
      id.toLowerCase().includes(filter.toLowerCase())
    );
  }, [activePlugins, filter]);

  // Reorder plugins by moving item from sourceIndex to destIndex
  const reorderPlugins = useCallback((sourceIndex: number, destIndex: number) => {
    setActivePlugins(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(destIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Toggle plugin visibility (add if not active, remove if active)
  const togglePluginVisibility = useCallback((pluginId: string) => {
    setActivePlugins(prev => {
      if (prev.includes(pluginId)) {
        // Remove from active plugins
        return prev.filter(id => id !== pluginId);
      } else {
        // Add to active plugins
        return [...prev, pluginId];
      }
    });
  }, []);

  const setPluginFilter = useCallback((newFilter: string) => {
    setFilter(newFilter);
  }, []);

  return {
    activePlugins,
    filteredPlugins,
    reorderPlugins,
    togglePluginVisibility,
    setPluginFilter,
  };
}
