'use client';

import { useQuery } from '@tanstack/react-query';
import { runtimeFeatures } from '@/lib/runtime/mode';

export interface PluginEventsResponse {
  success: boolean;
  timestamp: number;
  eventCounter: number;
  hasChanges: boolean;
  message?: string;
}

/**
 * Cache key for GET /api/kpi/plugins/events. Any component watching plugin
 * file changes shares this single polling stream through the query cache.
 */
export const PLUGIN_EVENTS_QUERY_KEY = ['plugin-events'] as const;

export interface UsePluginEventsQueryOptions {
  enabled?: boolean;
  /** Poll cadence in ms — matches the previous setInterval cadence. */
  intervalMs?: number;
}

/**
 * Shared polling source for plugin file-change events
 * (GET /api/kpi/plugins/events). Never throws: transient failures resolve to
 * `null`, mirroring the silent catch of the previous in-component interval.
 */
export function usePluginEventsQuery(options: UsePluginEventsQueryOptions = {}) {
  const { enabled = true, intervalMs = 5000 } = options;

  return useQuery<PluginEventsResponse | null>({
    queryKey: PLUGIN_EVENTS_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await fetch('/api/kpi/plugins/events');
        const data = await res.json();
        if (data?.success) return data as PluginEventsResponse;
        return null;
      } catch {
        // Expected while the dev server restarts/compiles — stay silent.
        return null;
      }
    },
    // Client-only endpoint: `window` is undefined during SSR, so the query is
    // disabled on the server and only polls after hydration. File-watcher
    // events are a server-only feature — no polling in relay mode.
    enabled: typeof window !== 'undefined' && enabled && runtimeFeatures.hasFilePlugins,
    refetchInterval: intervalMs,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
}
