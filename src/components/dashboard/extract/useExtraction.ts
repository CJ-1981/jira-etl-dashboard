import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { localConfig, CustomExtractField } from '@/lib/config/local-store';
import { useAppStore } from '@/store/app-store';

// Parses a response body as JSON, tolerating the HTML error page Next.js serves
// for API routes while webpack is (re)compiling. That transient state is treated
// as "server busy" rather than a real error so callers can retry.
export async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const contentType = res.headers.get('content-type') || '';
    const trimmed = text.trimStart();
    const isHtml = contentType.includes('text/html') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');
    if (isHtml) {
      console.warn(`[ExtractPanel] Server returned HTML instead of JSON (status ${res.status}) — likely compiling or restarting. Retry shortly.`);
      return { success: false, serverBusy: true, error: 'Server is busy compiling. Please try again in a moment.' };
    }
    console.error('Failed to parse JSON:', text.substring(0, 500));
    return { success: false, error: `Server error (${res.status})` };
  }
}

// @MX:NOTE: Retries only when the dev server returns HTML instead of JSON (webpack recompiling).
// @MX:REASON: During development, Next.js serves an HTML error page while recompiling after file
// changes. This is a transient state, not a real error, so we retry a few times with a delay.
export async function fetchWithDevServerRetry(url: string, init: RequestInit, attempts = 3, delayMs = 1500) {
  let res = await fetch(url, init);
  let data = await safeJson(res);
  for (let i = 1; i < attempts && data.serverBusy; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    res = await fetch(url, init);
    data = await safeJson(res);
  }
  return { res, data };
}

export interface UseExtractionOptions {
  jql: string;
  quickPullDays: number | null;
  saveThisExtraction: boolean;
  updateOnly: boolean;
  customFields: CustomExtractField[];
  /**
   * Reads the current polling-enabled flag. A getter (not a value) breaks the
   * otherwise circular dependency between useExtraction and usePolling.
   */
  getPollEnabled: () => boolean;
}

export function useExtraction(options: UseExtractionOptions) {
  const { jql, quickPullDays, saveThisExtraction, updateOnly, customFields, getPollEnabled } = options;
  const {
    connections,
    activeConnectionId,
    settings,
    storageConfig,
    dateFrom,
    dateTo,
    setExtractionResult,
    setMasterDatasetInfo,
    setKpiResults,
  } = useAppStore();

  const [extracting, setExtracting] = useState(false);
  // Track when the last extraction returned no results for persistent empty state
  const [lastExtractionEmpty, setLastExtractionEmpty] = useState(false);

  const handleExtract = useCallback(async (daysBack?: number) => {
    if (!activeConnectionId) { toast.error('Please select a connection in the Connections tab'); return; }
    setExtracting(true); setKpiResults([]);

    const loadingToast = toast.loading('Extracting issues from Jira...', { duration: 0 });

    try {
      const activeConn = connections.find(c => c.id === activeConnectionId);
      if (!activeConn) throw new Error('Selected connection not found');

      // When a quick-pull preset is active, extract with a rolling window that is
      // recomputed against the real current date, instead of the frozen dates
      // shown in the inputs. Manual "Quick Update" passes its own daysBack.
      const effectiveDaysBack = daysBack || (quickPullDays ?? undefined);

      const body: Record<string, unknown> = {
        connectionRef: activeConnectionId,
        jiraCredentials: {
          baseUrl: activeConn.baseUrl,
          email: activeConn.email,
          apiToken: activeConn.apiToken,
          projectKeys: activeConn.projectKeys
        },
        rateLimit: settings?.rateLimit,
        generalSettings: settings?.general,
        customPlugins: localConfig.getKpiPlugins(),
        jql: jql || undefined,
        // Omit absolute dates when using a rolling window so the extract route
        // derives them from "now".
        ...(effectiveDaysBack
          ? { daysBack: effectiveDaysBack }
          : { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
        saveExtraction: saveThisExtraction,
        updateOnly,
        customFieldIds: customFields.map(f => f.fieldId),
        storyPointsFieldId: customFields.find(f => f.role === 'storyPoints')?.fieldId,
        issueOwnerTeamFieldId: customFields.find(f => f.role === 'issueOwnerTeam')?.fieldId,
        storageConfig
      };

      const res = await fetch('/api/jira/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      toast.dismiss(loadingToast);

      const data = await safeJson(res);

      if (res.ok && data.success) {
        const extractedCount = data.summary.totalExtracted;

        if (extractedCount === 0) {
          toast('No issues found matching your criteria. Try adjusting your JQL query, date range, or project key.', { duration: 5000 });
          setLastExtractionEmpty(true);
        } else {
          setLastExtractionEmpty(false);
          const { added, updated, unchanged, deleted } = data.summary;
          const stats = [
            added > 0 ? `${added} added` : null,
            updated > 0 ? `${updated} updated` : null,
            unchanged > 0 ? `${unchanged} unchanged` : null,
            deleted > 0 ? `${deleted} deleted` : null
          ].filter(Boolean).join(', ');

          const saveMsg = saveThisExtraction ? ' and synced to master dataset' : '';
          toast.success(`Extracted ${extractedCount} issues${saveMsg}${stats ? ` (${stats})` : ''}`);
        }

        if (extractedCount === 0) {
          setExtractionResult(null);
        } else {
          setExtractionResult({ total: extractedCount, etlRunId: data.etlRunId, issues: data.issues });
        }

        try {
          // Retry when the dev server responds with HTML while recompiling —
          // the extraction itself already succeeded, only this refresh failed.
          const { res: masterRes, data: masterData } = await fetchWithDevServerRetry(
            `/api/jira/master/${activeConnectionId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'get', storageConfig })
            }
          );

          if (masterRes.ok && masterData.success && masterData.data) {
            setMasterDatasetInfo({
              totalExtracted: masterData.data.totalExtracted,
              dateRange: masterData.data.dateRange,
              lastUpdated: masterData.data.lastUpdated,
              issues: masterData.data.issues
            });

            if (getPollEnabled()) {
              await fetch('/api/jira/poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ping' })
              }).catch(e => console.warn('Failed to ping polling system:', e));
            }
          }
        } catch (error) {
          console.log('Failed to reload master dataset info:', error);
        }
      } else {
        if (res.status === 401) {
          toast.error('Authentication failed. Please check your Jira credentials.', { description: data.error, duration: 5000 });
        } else if (res.status === 429) {
          toast.error('Rate limit exceeded. Increase delay in settings and try again.', { description: data.error, duration: 5000 });
        } else if (res.status === 503 || res.status === 504) {
          toast.error('Jira server unavailable or timeout. Try reducing the date range or batch size.', { description: data.error, duration: 5000 });
        } else {
          toast.error(data.error || `Extraction failed (${res.status})`, { duration: 5000 });
        }
      }
    } catch (networkError) {
      toast.dismiss(loadingToast);
      console.error('Network error:', networkError);
      toast.error('Network error: Unable to reach the server. Check your connection.', { duration: 5000 });
    } finally {
      setExtracting(false);
    }
  }, [activeConnectionId, connections, settings, storageConfig, dateFrom, dateTo, jql, quickPullDays, saveThisExtraction, updateOnly, customFields, getPollEnabled, setExtractionResult, setMasterDatasetInfo, setKpiResults]);

  const handleShowAllTickets = useCallback(async () => {
    if (!activeConnectionId) { toast.error('Please select a connection first'); return; }
    setExtracting(true);
    const loadingToast = toast.loading('Fetching all tickets from database...', { duration: 0 });

    try {
      const { res, data } = await fetchWithDevServerRetry(
        `/api/jira/master/${activeConnectionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', storageConfig })
        }
      );

      toast.dismiss(loadingToast);

      if (res.ok && data.success && data.data) {
        setExtractionResult({
          total: data.data.totalExtracted,
          issues: data.data.issues,
          isAllTickets: true
        });
        setMasterDatasetInfo({
          totalExtracted: data.data.totalExtracted,
          dateRange: data.data.dateRange,
          lastUpdated: data.data.lastUpdated,
          issues: data.data.issues
        });
        toast.success(`Loaded all ${data.data.totalExtracted} tickets from database`);
      } else {
        toast.error(data.error || 'Failed to fetch tickets');
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error('Network error while fetching tickets');
    } finally {
      setExtracting(false);
    }
  }, [activeConnectionId, storageConfig, setExtractionResult, setMasterDatasetInfo]);

  // Silent reload of the master dataset after a background polling run finishes,
  // so the displayed ticket list reflects newly pulled issues without user action.
  const refreshMasterData = useCallback(async () => {
    if (!activeConnectionId || extracting) return;
    try {
      const res = await fetch(`/api/jira/master/${activeConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig })
      });
      const data = await safeJson(res);
      if (res.ok && data.success && data.data) {
        setMasterDatasetInfo({
          totalExtracted: data.data.totalExtracted,
          dateRange: data.data.dateRange,
          lastUpdated: data.data.lastUpdated,
          issues: data.data.issues
        });
        setExtractionResult({
          total: data.data.totalExtracted,
          issues: data.data.issues,
          isAllTickets: true
        });
      }
    } catch (e) {
      // Background refresh is best-effort; don't surface errors to the user.
      console.log('Silent master dataset refresh failed:', e);
    }
  }, [activeConnectionId, extracting, storageConfig, setMasterDatasetInfo, setExtractionResult]);

  return {
    extracting,
    lastExtractionEmpty,
    handleExtract,
    handleShowAllTickets,
    refreshMasterData,
  };
}
