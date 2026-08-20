'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Watches the server-side polling state and surfaces a toast each time a
 * scheduled background pull finishes (success or failure). Mounted once at
 * page level so notifications appear regardless of the active tab.
 */
export function usePollingNotifications() {
  // lastRunId we already notified the user about; null until first poll response.
  const lastSeenRunIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const check = () => {
      fetch('/api/jira/poll')
        .then((r) => r.json())
        .then((d) => {
          if (!isMounted || !d?.success || !d.polling) return;

          const runId: number = d.polling.lastRunId ?? 0;
          // First response only seeds the marker so stale runs don't toast.
          if (lastSeenRunIdRef.current === null) {
            lastSeenRunIdRef.current = runId;
            return;
          }
          if (runId <= lastSeenRunIdRef.current) return;
          lastSeenRunIdRef.current = runId;

          const when = d.polling.lastRunAt ? new Date(d.polling.lastRunAt).toLocaleTimeString() : '';
          if (d.polling.lastError) {
            toast.error(`Scheduled pull failed${when ? ` at ${when}` : ''}: ${d.polling.lastError}`, { duration: 6000 });
          } else {
            const s = d.polling.lastRunSummary;
            toast.success(
              s
                ? `Scheduled pull completed${when ? ` at ${when}` : ''} — ${s.totalExtracted} issue${s.totalExtracted === 1 ? '' : 's'} (${s.added} added, ${s.updated} updated)`
                : `Scheduled pull completed${when ? ` at ${when}` : ''}`,
              { duration: 5000 }
            );
          }
        })
        .catch(() => {
          // Expected while the dev server restarts/compiles — stay silent.
        });
    };

    check();
    const timer = setInterval(check, 5000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);
}
