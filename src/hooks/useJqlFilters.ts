/**
 * useJqlFilters Hook
 *
 * Manages dashboard JQL list, editing, deletion, and multi-select staging.
 *
 * This hook extracts JQL filter management logic from KpiDashboard component.
 * It handles CRUD operations for saved JQL filters and manages staging filters
 * for multi-select without instant update.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { jqlList, addJql, editJql, deleteJql, stagingFilters, toggleStagingFilter } = useJqlFilters();
 *
 *   return (
 *     <div>
 *       {jqlList.map(jql => (
 *         <JqlItem key={jql.id} jql={jql} />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @MX:NOTE: Extracted from KpiDashboard component during Phase 2.5 modularization
 * @MX:REASON: Reduce component complexity (~300 lines removed) and improve testability
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { localConfig, type SavedJql } from '@/lib/config/local-store';

export interface UseJqlFiltersResult {
  /** List of saved JQL filters */
  jqlList: SavedJql[];
  /** Staging filters organized by category (e.g., { jql: ['query1', 'query2'], project: ['TEST'] }) */
  stagingFilters: Record<string, string[]>;
  /** Add a new JQL filter to the list */
  addJql: (jql: string, name: string) => void;
  /** Edit an existing JQL filter by ID */
  editJql: (id: string, jql: string, name: string) => void;
  /** Delete a JQL filter by ID */
  deleteJql: (id: string) => void;
  /** Toggle a filter in staging (add if not present, remove if present) */
  toggleStagingFilter: (key: string, value: string) => void;
  /** Clear all staging filters */
  clearStagingFilters: () => void;
}

/**
 * Hook for managing JQL filters and staging state
 *
 * @returns JQL filter management functions and state
 */
export function useJqlFilters(): UseJqlFiltersResult {
  // Initialize JQL list from localConfig
  const [jqlList, setJqlList] = useState<SavedJql[]>(() => {
    try {
      return localConfig.getDashboardJqls();
    } catch (error) {
      console.error('Failed to load saved JQLs:', error);
      return [];
    }
  });

  // Staging filters for multi-select without instant update
  // Organized by category: { jql: ['query1', 'query2'], project: ['TEST'] }
  const [stagingFilters, setStagingFilters] = useState<Record<string, string[]>>({});

  // Counter for generating unique IDs
  const idCounterRef = useRef(0);

  /**
   * Add a new JQL filter to the list
   * Generates ID with format: djql-{timestamp}-{counter}
   */
  const addJql = useCallback((jql: string, name: string) => {
    const newJql: SavedJql = {
      id: `djql-${Date.now()}-${++idCounterRef.current}`,
      name,
      query: jql,
    };

    setJqlList(prev => {
      const updated = [...prev, newJql];

      try {
        localConfig.saveDashboardJqls(updated);
      } catch (error) {
        console.error('Failed to save JQL:', error);
        // @MX:NOTE: QuotaExceededError is handled silently per existing behavior
      }

      return updated;
    });
  }, []);

  /**
   * Edit an existing JQL filter by ID
   * Preserves the ID and updates name and query
   */
  const editJql = useCallback((id: string, jql: string, name: string) => {
    setJqlList(prev => {
      const updated = prev.map(item =>
        item.id === id ? { ...item, name, query: jql } : item
      );

      try {
        localConfig.saveDashboardJqls(updated);
      } catch (error) {
        console.error('Failed to save JQL:', error);
      }

      return updated;
    });
  }, []);

  /**
   * Delete a JQL filter by ID
   * Removes the filter from the list and persists the change
   */
  const deleteJql = useCallback((id: string) => {
    setJqlList(prev => {
      const updated = prev.filter(item => item.id !== id);

      try {
        localConfig.saveDashboardJqls(updated);
      } catch (error) {
        console.error('Failed to save JQL:', error);
      }

      return updated;
    });
  }, []);

  /**
   * Toggle a filter in staging
   *
   * Behavior:
   * - If value is 'all', clears the entire category
   * - If value is already in staging, removes it
   * - If value is not in staging, adds it
   *
   * @param key - Filter category (e.g., 'jql', 'project', 'priority')
   * @param value - Filter value (e.g., 'project = TEST' or 'TEST')
   */
  const toggleStagingFilter = useCallback((key: string, value: string) => {
    setStagingFilters(prev => {
      // Handle 'all' value to clear category
      if (value === 'all') {
        return { ...prev, [key]: [] };
      }

      const current = prev[key] || [];

      // Toggle: remove if present, add if not present
      if (current.includes(value)) {
        const updated = { ...prev };
        updated[key] = current.filter(v => v !== value);

        // Remove empty categories
        if (updated[key].length === 0) {
          delete updated[key];
        }

        return updated;
      } else {
        return { ...prev, [key]: [...current, value] };
      }
    });
  }, []);

  /**
   * Clear all staging filters
   * Resets the staging filters to an empty object
   */
  const clearStagingFilters = useCallback(() => {
    setStagingFilters({});
  }, []);

  return {
    jqlList,
    stagingFilters,
    addJql,
    editJql,
    deleteJql,
    toggleStagingFilter,
    clearStagingFilters,
  };
}
