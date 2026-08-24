import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { localConfig, CustomExtractField } from '@/lib/config/local-store';
import { PollingStatus } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';

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
}

export function usePolling(options: UsePollingOptions) {
  const { extracting, dateFrom, dateTo, jql, quickPullDays, customFields, updateOnly, onRunCompleted } = options;
  const { connections, activeConnectionId, settings, storageConfig } = useAppStore();

  const [polling, setPolling] = useState<PollingStatus | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollInterval, setPollInterval] = useState('15');
  const [pollSaving, setPollSaving] = useState(false);
  // Last background-run id we refreshed the list for, so each completed run
  // triggers exactly one silent reload of the displayed tickets.
  const lastRefreshedRunIdRef = useRef<number | null>(null);

  // Load polling status on a 5 second interval.
  useEffect(() => {
    let isMounted = true;
    const loadPolling = () => {
      if (extracting) return;

      fetch('/api/jira/poll')
        .then((r) => r.json())
        .then((d) => {
          if (isMounted && d.success) {
            // Deep-equality guard avoids re-render churn from identical payloads.
            setPolling(prev => JSON.stringify(prev) === JSON.stringify(d.polling) ? prev : d.polling);
            setPollEnabled(d.polling.enabled);
            setPollInterval(String(d.polling.intervalMinutes));
          }
        })
        .catch(() => {
          // Silent catch to prevent unhandled rejection during dev/reloads
          // Failures are expected when the server is restarting/compiling
        });
    };
    loadPolling();
    const timer = setInterval(loadPolling, 5000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [extracting]);

  // Shared POST helper. includeInterval=false is used by the date/JQL sync effect
  // so it never overwrites the server's interval with a stale local value.
  const postPollingState = useCallback(async (nextEnabled: boolean, intervalToUse?: string, includeInterval = true) => {
    const activeConn = connections.find(c => c.id === activeConnectionId);
    if (nextEnabled && !activeConn) {
      toast.error('Select a connection first');
      setPollEnabled(false);
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
        setPolling(data.polling);
        setPollEnabled(data.polling.enabled);
        // Only the toggle path announces the change; the sync effect stays quiet.
        if (includeInterval) {
          toast.success(data.polling.enabled ? 'Polling started' : 'Polling stopped');
        }
      } else {
        toast.error(data.error);
        setPollEnabled(polling?.enabled || false);
      }
    } catch {
      toast.error('Failed to update polling');
      setPollEnabled(polling?.enabled || false);
    }
    setPollSaving(false);
  }, [connections, activeConnectionId, settings, storageConfig, pollInterval, dateFrom, dateTo, jql, quickPullDays, customFields, updateOnly, polling]);

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
      postPollingState(true);
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
