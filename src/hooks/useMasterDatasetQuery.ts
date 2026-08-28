'use client';

import { useQuery } from '@tanstack/react-query';
import type { StorageConfig } from '@/lib/config/local-store';
import { getDataSource, type MasterDatasetData } from '@/lib/datasource';

export type { MasterDatasetData };

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
 * Shared React Query source for the persisted master dataset. page.tsx mounts it to
 * load/restore the dataset and syncs the result into the app store; other
 * hooks trigger silent refreshes via `invalidateQueries` on the shared key.
 *
 * @MX:NOTE: Goes through the DataSource seam — server mode POSTs
 * /api/jira/master/:connectionId, relay mode GETs the relay /dataset
 * (full rawData incl. changelog, gzipped).
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
      try {
        return await getDataSource().loadMasterDataset(connectionId, { storageConfig });
      } catch (e) {
        // Relay mode surfaces network errors when the relay is not running —
        // treat like the server path treats transient errors: empty result.
        console.warn('[useMasterDatasetQuery] load failed:', e);
        return null;
      }
    },
    // Client-only data source: `window` is undefined during SSR, so the query is
    // disabled on the server and only loads after hydration.
    enabled: typeof window !== 'undefined' && (enabled ?? !!connectionId),
    refetchOnWindowFocus: false,
    retry: false,
    // Every explicit load/invalidate should hit the data source; there is no
    // interval-based polling on this query.
    staleTime: 0,
  });
}
