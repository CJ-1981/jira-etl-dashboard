'use client';

import { useQuery } from '@tanstack/react-query';
import type { StorageConfig } from '@/lib/config/local-store';

/** The master-dataset payload returned by POST /api/jira/master/:id (action:get). */
export interface MasterDatasetData {
  totalExtracted: number;
  dateRange?: { from: string; to: string };
  lastUpdated: string;
  // Matches the app store's masterDatasetInfo.issues typing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issues?: any[];
}

/**
 * Prefix shared by every master-dataset cache entry. Invalidate with
 * `{ queryKey: MASTER_DATASET_KEY }` to refresh all connections or with
 * `[...MASTER_DATASET_KEY, connectionId]` for a single connection.
 */
export const MASTER_DATASET_KEY = ['master-dataset'] as const;

export function masterDatasetQueryKey(connectionId: string, storageConfig: StorageConfig | null | undefined) {
  return [...MASTER_DATASET_KEY, connectionId, storageConfig] as const;
}

export interface UseMasterDatasetQueryOptions {
  /** Defaults to `!!connectionId` — no connection means nothing to load. */
  enabled?: boolean;
}

/**
 * Shared React Query source for the persisted master dataset
 * (POST /api/jira/master/:connectionId, action:'get'). page.tsx mounts it to
 * load/restore the dataset and syncs the result into the app store; other
 * hooks trigger silent refreshes via `invalidateQueries` on the shared key.
 */
export function useMasterDatasetQuery(
  connectionId: string,
  storageConfig: StorageConfig | null | undefined,
  options: UseMasterDatasetQueryOptions = {}
) {
  const { enabled } = options;

  return useQuery<MasterDatasetData | null>({
    queryKey: masterDatasetQueryKey(connectionId, storageConfig),
    queryFn: async () => {
      const res = await fetch(`/api/jira/master/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data.data) return data.data as MasterDatasetData;
      // Treat "no data yet" / transient errors as an empty result rather than
      // a query failure — the old loader logged and moved on silently too.
      return null;
    },
    enabled: enabled ?? !!connectionId,
    refetchOnWindowFocus: false,
    retry: false,
    // Every explicit load/invalidate should hit the server; there is no
    // interval-based polling on this query.
    staleTime: 0,
  });
}
