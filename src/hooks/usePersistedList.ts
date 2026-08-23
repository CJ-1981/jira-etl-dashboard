/**
 * usePersistedList Hook
 *
 * Generic localStorage-backed list hook that implements the shared mechanics
 * previously duplicated in useWidgetOrder and usePluginVisibility:
 *
 * - Initialization from localStorage with a fallback value
 * - Cross-tab synchronization via `storage` events
 * - Optional same-tab synchronization via a custom event
 * - Self-write / echo-write guard refs to avoid feedback loops
 * - Splice-based reordering and membership toggling
 *
 * Callers should pass a memoized `options` object so the storage effects do
 * not re-subscribe on every render.
 *
 * @example
 * ```tsx
 * const { list, setList, reorder, toggle } = usePersistedList<string>('my_key', {
 *   fallback: ['a', 'b'],
 * });
 * ```
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';

export interface UsePersistedListOptions<T> {
  /** Value used when nothing is stored or the stored value is unusable. */
  fallback: T[];
  /**
   * Optional predicate rejecting parsed storage values. When it returns false
   * the list falls back to `fallback`.
   */
  isValid?: (parsed: unknown) => boolean;
  /** Optional transform applied to every list loaded from storage (init and sync). */
  onLoad?: (items: T[]) => T[];
  /**
   * Optional custom event name used for same-tab synchronization between
   * multiple hook instances. Storage events only fire across tabs, so when
   * several instances share a key within one tab they coordinate through this
   * event: it is dispatched after every persist and listened to for re-syncs.
   */
  changeEvent?: string;
  /**
   * When true, a state update caused by re-syncing from storage suppresses the
   * persist it would otherwise trigger (avoids echo writes when multiple
   * instances share a key within one tab).
   */
  suppressSyncEcho?: boolean;
  /**
   * When true the hook immediately re-reads storage on mount and whenever the
   * storage key / options change (in addition to listening for storage events).
   */
  syncOnMount?: boolean;
  /**
   * When true, an externally removed storage key resets the list to `fallback`
   * during a re-sync. When false, a missing key is ignored and the current
   * state is kept.
   */
  resetOnMissingKey?: boolean;
  /**
   * When true, the self-write guard flag is cleared on the next microtask
   * instead of synchronously, so storage events dispatched synchronously by
   * other writers (e.g. synthetic events) are still ignored.
   */
  deferSelfWriteReset?: boolean;
}

export interface UsePersistedListResult<T> {
  /** Current list state. */
  list: T[];
  /** Raw state setter for updates beyond reorder/toggle (e.g. merge logic). */
  setList: Dispatch<SetStateAction<T[]>>;
  /** Move the item at `sourceIndex` to `destIndex`. */
  reorder: (sourceIndex: number, destIndex: number) => void;
  /** Add the item when absent, remove it when present. */
  toggle: (item: T) => void;
}

export function usePersistedList<T>(
  storageKey: string,
  options: UsePersistedListOptions<T>
): UsePersistedListResult<T> {
  const [list, setList] = useState<T[]>(() => {
    if (typeof window === 'undefined') return options.fallback;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!options.isValid || options.isValid(parsed)) {
          return options.onLoad ? options.onLoad(parsed) : parsed;
        }
        console.error(
          `Invalid structure in ${storageKey} localStorage data, resetting to default.`
        );
      }
      return options.fallback;
    } catch (error) {
      console.error(`Failed to load ${storageKey} from localStorage:`, error);
      return options.fallback;
    }
  });

  // Guard: true while this hook is writing to storage to avoid reacting to its own events
  const isSelfWriting = useRef(false);
  // Guard: true for exactly one persist cycle after a sync from another instance
  const isSyncing = useRef(false);

  // Re-sync from localStorage whenever the storage key changes externally
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromStorage = () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === null) {
          if (options.resetOnMissingKey) setList(options.fallback);
          return;
        }
        const parsed = JSON.parse(saved);
        if (!options.isValid || options.isValid(parsed)) {
          if (options.suppressSyncEcho) isSyncing.current = true;
          setList(options.onLoad ? options.onLoad(parsed) : parsed);
        } else {
          console.error(
            `Invalid structure in ${storageKey} localStorage data, resetting to default.`
          );
          setList(options.fallback);
        }
      } catch (error) {
        console.error(`Failed to sync ${storageKey} from localStorage:`, error);
        setList(options.fallback);
      }
    };

    // Immediate sync on mount / storageKey change (when enabled)
    if (options.syncOnMount) {
      syncFromStorage();
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && !isSelfWriting.current) {
        syncFromStorage();
      }
    };

    const handleCustomEvent = options.changeEvent
      ? () => {
          // Early return when this instance is writing to prevent feedback loop
          if (isSelfWriting.current) return;
          syncFromStorage();
        }
      : null;

    window.addEventListener('storage', handleStorageChange);
    if (options.changeEvent && handleCustomEvent) {
      window.addEventListener(options.changeEvent, handleCustomEvent);
    }
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (options.changeEvent && handleCustomEvent) {
        window.removeEventListener(options.changeEvent, handleCustomEvent);
      }
    };
    // `options` is intentionally a dependency: callers (e.g. plugin visibility)
    // re-sync whenever their fallback list changes. Callers memoize options to
    // avoid re-subscribing on unrelated renders.
  }, [storageKey, options]);

  // Persist to local storage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip exactly one persist for state updates caused by syncing from
    // another instance (avoids echo writes). Reset the flag here so that
    // subsequent user-initiated changes persist normally.
    if (options.suppressSyncEcho && isSyncing.current) {
      isSyncing.current = false;
      return;
    }

    try {
      isSelfWriting.current = true;
      localStorage.setItem(storageKey, JSON.stringify(list));
      if (options.changeEvent) {
        window.dispatchEvent(new CustomEvent(options.changeEvent));
      }
      if (options.deferSelfWriteReset) {
        // Reset on next microtask so storage events dispatched synchronously
        // by other writers are processed before the flag clears.
        Promise.resolve().then(() => {
          isSelfWriting.current = false;
        });
      } else {
        // Synchronously clear flags after dispatch
        isSelfWriting.current = false;
      }
      isSyncing.current = false;
    } catch (error) {
      isSelfWriting.current = false;
      isSyncing.current = false;
      console.error(`Failed to save ${storageKey} to localStorage:`, error);
    }
    // The behavior flags live in `options` (memoized by callers); only the list
    // and key should trigger a persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, storageKey]);

  // Reorder by moving the item at sourceIndex to destIndex
  const reorder = useCallback((sourceIndex: number, destIndex: number) => {
    setList(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(destIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Toggle membership (add if not present, remove if present)
  const toggle = useCallback((item: T) => {
    setList(prev => {
      if (prev.includes(item)) {
        return prev.filter(existing => existing !== item);
      } else {
        return [...prev, item];
      }
    });
  }, []);

  return { list, setList, reorder, toggle };
}
