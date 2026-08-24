import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { localConfig, CustomExtractField } from '@/lib/config/local-store';
import { PollingStatus } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { useJiraPollQuery, JIRA_POLL_QUERY_KEY, JiraPollResponse } from '@/hooks/useJiraPollQuery';

export interface UsePollingOptions {
  extracting: boolean;
  dateFrom: string;
  dateTo: string;
  jql: string;
  quickPullDays: number | null;
  customFields: CustomExtractField[];
  updateOnly: boolean;
  /**
   * Called once per completed background run. Must be referentially stable
   * (e.g. a useCallback) — it is part of the run-completion effect's deps.
   */
  onRunCompleted: () => void;
  /** Poll cadence override (ms). Defaults to the shared 5000ms. */
  pollIntervalMs?: number;
}

export function usePolling(options: UsePollingOptions) {
  const { extracting, dateFrom, dateTo, jql, quickPullDays, customFields, updateOnly, onRunCompleted, pollIntervalMs } = options;
  const { connections, activeConnectionId, settings, storageConfig } = useAppStore();
  const queryClient = useQueryClient();

  // Shared React Query source for GET /api/jira/poll. Every consumer mounted at
  // the same time (page-level notifications + this panel) reads the same cache
  // entry, so only one request stream hits the endpoint. Polling pauses while
  // an extraction is in flight — the same semantics as the old interval guard.
  const { data: pollData } = useJiraPollQuery({ enabled: !extracting, intervalMs: pollIntervalMs });
  const polling: PollingStatus | null = pollData?.success ? pollData.polling : null;
  const pollEnabled = polling?.enabled ?? false;

  const [pollInterval, setPollInterval] = useState('15');
  const [pollSaving, setPollSaving] = useState(false);
  // Last background-run id we refreshed the list for, so each completed run
  // triggers exactly one silent reload of the displayed tickets.
  const lastRefreshedRunIdRef = useRef<number | null>(null);

  // Keep the interval selector in sync with the server's value. Only written
  // when it differs so the controlled input doesn't fight the user's typing.
  const serverInterval = polling ? String(polling.intervalMinutes) : null;
  useEffect(() => {
    if (serverInterval !== null && serverInterval !== pollInterval) {
      setPollInterval(serverInterval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInterval]);

  // Shared POST helper. includeInterval=false is used by the date/JQL sync effect
  // so it never overwrites the server's interval with a stale local value.
  const postPollingState = useCallback(async (nextEnabled: boolean, intervalToUse?: string, includeInterval = true) => {
    const activeConn = connections.find(c => c.id === activeConnectionId);
    if (nextEnabled && !activeConn) {
      toast.error('Select a connection first');
      return;
    }

    setPollSaving(true);
    try {
      const res = await fetch('/api/jira/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: nextEnabled ? activeConnectionId : null,
          ...(includeInterval ? { intervalMinutes: parseInt(intervalToUse || pollInterval) || 15 } : {}),
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          jql: jql || undefined,
          enabled: nextEnabled,
          // Active quick-pull preset → background runs slide the window with the
          // real date; null clears it in favor of the absolute dates above.
          ...(nextEnabled ? { daysBack: quickPullDays } : {}),
          // The server has no access to localStorage connections, so credentials
          // and extraction options must be registered here for background runs.
          // (The guard above guarantees activeConn whenever nextEnabled is true.)
          ...(nextEnabled && activeConn ? {
            jiraCredentials: {
              baseUrl: activeConn.baseUrl,
              email: activeConn.email,
              apiToken: activeConn.apiToken,
              projectKeys: activeConn.projectKeys,
            },
            rateLimit: settings?.rateLimit,
            generalSettings: settings?.general,
            customPlugins: localConfig.getKpiPlugins(),
            customFieldIds: customFields.map(f => f.fieldId),
            storyPointsFieldId: customFields.find(f => f.role === 'storyPoints')?.fieldId,
            issueOwnerTeamFieldId: customFields.find(f => f.role === 'issueOwnerTeam')?.fieldId,
            updateOnly,
            storageConfig,
          } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Update the shared cache so every consumer (notifications + this panel)
        // sees the fresh server state immediately; the next poll tick converges
        // on the same value. On failure the cache stays untouched, which keeps
        // pollEnabled on its previous value — the same rollback as before.
        queryClient.setQueryData<JiraPollResponse>(JIRA_POLL_QUERY_KEY, data);
        // Only the toggle path announces the change; the sync effect stays quiet.
        if (includeInterval) {
          toast.success(data.polling.enabled ? 'Polling started' : 'Polling stopped');
        }
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to update polling');
    }
    setPollSaving(false);
  }, [connections, activeConnectionId, settings, storageConfig, pollInterval, dateFrom, dateTo, jql, quickPullDays, customFields, updateOnly, queryClient]);

  const handleTogglePolling = useCallback(async (targetState?: boolean, overrideInterval?: string) => {
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !pollEnabled;
    const intervalToUse = overrideInterval || pollInterval;
    await postPollingState(nextEnabled, intervalToUse, true);
  }, [pollEnabled, pollInterval, postPollingState]);

  // Keep the server's polling state in sync with the panel's current date range
  // and JQL while polling is active — otherwise background runs would use the
  // values captured when polling was first enabled. Debounced so typing in the
  // JQL box doesn't spam the endpoint. Interval is intentionally NOT sent here:
  // the server keeps its own value, avoiding a race where a stale local
  // pollInterval ('15') would overwrite the user's chosen interval.
  useEffect(() => {
    if (!pollEnabled) return;
    const timer = setTimeout(() => {
      postPollingState(true, undefined, false);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, jql, quickPullDays]);

  // When a scheduled background run completes, signal a refresh exactly once.
  useEffect(() => {
    if (!polling || polling.lastError) return;
    const runId = polling.lastRunId ?? 0;
    if (lastRefreshedRunIdRef.current === null) {
      // First observation — just remember it so stale runs don't trigger reloads.
      lastRefreshedRunIdRef.current = runId;
      return;
    }
    if (runId > lastRefreshedRunIdRef.current) {
      lastRefreshedRunIdRef.current = runId;
      onRunCompleted();
    }
  }, [polling, onRunCompleted]);

  return {
    polling,
    pollEnabled,
    pollInterval,
    setPollInterval,
    pollSaving,
    handleTogglePolling,
  };
}
