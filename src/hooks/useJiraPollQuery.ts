'use client';

import { useQuery } from '@tanstack/react-query';
import type { PollingStatus } from '@/types/dashboard';

export interface JiraPollResponse {
  success: boolean;
  polling: PollingStatus;
}

/**
 * Cache key shared by every consumer of GET /api/jira/poll. React Query dedupes
 * by key, so any number of simultaneously mounted consumers (page-level
 * notifications + extract panel) share one polling request stream instead of
 * each running its own 5-second interval.
 */
export const JIRA_POLL_QUERY_KEY = ['jira-poll'] as const;

export interface UseJiraPollQueryOptions {
  /**
   * When false the query neither fetches nor polls. Consumers use this to
   * replicate their previous pause semantics (e.g. the extract panel pauses
   * status polling while an extraction is in flight).
   */
  enabled?: boolean;
  /** Poll cadence in ms — matches the previous setInterval cadence. */
  intervalMs?: number;
}

/**
 * Shared polling source for the server-side Jira background-pull state
 * (GET /api/jira/poll). Never throws: transient failures (dev server
 * restarting/compiling, malformed payloads) resolve to `null`, mirroring the
 * silent catch the old per-consumer intervals used.
 */
export function useJiraPollQuery(options: UseJiraPollQueryOptions = {}) {
  const { enabled = true, intervalMs = 5000 } = options;

  return useQuery<JiraPollResponse | null>({
    queryKey: JIRA_POLL_QUERY_KEY,
    queryFn: async () => {
      try {
        const res = await fetch('/api/jira/poll');
        const data = await res.json();
        if (data?.success && data.polling) return data as JiraPollResponse;
        return null;
      } catch {
        // Expected while the dev server restarts/compiles — stay silent.
        return null;
      }
    },
    enabled,
    refetchInterval: intervalMs,
    refetchOnWindowFocus: false,
    // Failures are transient and self-heal on the next tick; retrying would
    // only add requests between the 5s polls.
    retry: false,
    // Poll data is always considered stale so every interval tick refetches.
    staleTime: 0,
  });
}
