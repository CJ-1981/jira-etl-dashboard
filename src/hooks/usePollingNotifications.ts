'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useJiraPollQuery } from './useJiraPollQuery';

export interface UsePollingNotificationsOptions {
  /** Poll cadence override (ms). Defaults to the shared 5000ms. */
  intervalMs?: number;
}

/**
 * Watches the server-side polling state and surfaces a toast each time a
 * scheduled background pull finishes (success or failure). Mounted once at
 * page level so notifications appear regardless of the active tab.
 *
 * Data comes from the shared `jira-poll` React Query cache, so this hook and
 * the extract panel's poller share one request stream.
 */
export function usePollingNotifications(options: UsePollingNotificationsOptions = {}) {
  const { data } = useJiraPollQuery({ intervalMs: options.intervalMs });

  // lastRunId we already notified the user about; null until first poll response.
  const lastSeenRunIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!data?.success || !data.polling) return;

    const runId: number = data.polling.lastRunId ?? 0;
    // First response only seeds the marker so stale runs don't toast.
    if (lastSeenRunIdRef.current === null) {
      lastSeenRunIdRef.current = runId;
      return;
    }
    if (runId <= lastSeenRunIdRef.current) return;
    lastSeenRunIdRef.current = runId;

    const when = data.polling.lastRunAt ? new Date(data.polling.lastRunAt).toLocaleTimeString() : '';
    if (data.polling.lastError) {
      toast.error(`Scheduled pull failed${when ? ` at ${when}` : ''}: ${data.polling.lastError}`, { duration: 6000 });
    } else {
      const s = data.polling.lastRunSummary;
      toast.success(
        s
          ? `Scheduled pull completed${when ? ` at ${when}` : ''} — ${s.totalExtracted} issue${s.totalExtracted === 1 ? '' : 's'} (${s.added} added, ${s.updated} updated)`
          : `Scheduled pull completed${when ? ` at ${when}` : ''}`,
        { duration: 5000 }
      );
    }
  }, [data]);
}
