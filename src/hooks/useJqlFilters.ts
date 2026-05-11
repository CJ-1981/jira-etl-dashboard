/**
 * useJqlFilters Hook
 *
 * Manages dashboard JQL list, editing, deletion, and multi-select staging.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { jqlList, addJql, editJql, deleteJql, stagingFilters, applyStagingFilters } = useJqlFilters(
 *     'kpi-jql-filters'
 *   );
 *   return <div>{jqlList.map(jql => <JqlItem key={jql.id} jql={jql} />)}</div>;
 * }
 * ```
 */
import { useState, useCallback, useEffect } from 'react';

export interface SavedJql {
  id: string;
  name: string;
  jql: string;
}

export interface UseJqlFiltersResult {
  jqlList: SavedJql[];
  stagingFilters: string[];
  addJql: (jql: string, name: string) => void;
  editJql: (id: string, jql: string, name: string) => void;
  deleteJql: (id: string) => void;
  toggleStagingFilter: (filterId: string) => void;
  clearStagingFilters: () => void;
  applyStagingFilters: () => void;
}

// TODO: Implement hook logic (Phase 2.5)
export function useJqlFilters(storageKey: string): UseJqlFiltersResult {
  // Initialize from local storage
  const [jqlList, setJqlList] = useState<SavedJql[]>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : [];
  });

  const [stagingFilters, setStagingFilters] = useState<string[]>([]);

  // Persist to local storage on change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(jqlList));
  }, [jqlList, storageKey]);

  const addJql = useCallback((jql: string, name: string) => {
    const newJql: SavedJql = {
      id: `jql-${Date.now()}`,
      name,
      jql,
    };
    setJqlList(prev => [...prev, newJql]);
  }, []);

  const editJql = useCallback((id: string, jql: string, name: string) => {
    setJqlList(prev =>
      prev.map(item =>
        item.id === id ? { ...item, name, jql } : item
      )
    );
  }, []);

  const deleteJql = useCallback((id: string) => {
    setJqlList(prev => prev.filter(item => item.id !== id));
  }, []);

  const toggleStagingFilter = useCallback((filterId: string) => {
    setStagingFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(id => id !== filterId)
        : [...prev, filterId]
    );
  }, []);

  const clearStagingFilters = useCallback(() => {
    setStagingFilters([]);
  }, []);

  const applyStagingFilters = useCallback(() => {
    // TODO: Implement apply logic (integrate with Zustand store)
  }, []);

  return {
    jqlList,
    stagingFilters,
    addJql,
    editJql,
    deleteJql,
    toggleStagingFilter,
    clearStagingFilters,
    applyStagingFilters,
  };
}
