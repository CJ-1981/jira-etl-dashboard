'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  Download, RefreshCw, Server, RotateCw, Clock, HardDrive, LayoutGrid, Trash2, Search, X,
  ExternalLink, CheckCircle2, Loader2, Save, Plus, Tag, Sparkles, ChevronDown
} from 'lucide-react';
import { localConfig, JiraConnection, SavedJql, CustomExtractField } from '@/lib/config/local-store';
import { DEFAULT_FIELD_CONFIG } from '@/lib/jira/field-config';
import { PollingStatus } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { AppSettings } from '@/lib/config/local-store';

// Resolve built-in custom field IDs (client-side safe — uses static defaults)
const getStoryPointsFieldId = () => DEFAULT_FIELD_CONFIG.storyPointsField;
const getIssueOwnerTeamFieldId = () => DEFAULT_FIELD_CONFIG.issueOwnerTeamField;

export const ExtractPanel = React.memo(function ExtractPanel() {
  const {
    connections,
    extractionResult,
    setExtractionResult,
    masterDatasetInfo,
    setMasterDatasetInfo,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    activeConnectionId,
    settings,
    setSettings,
    setKpiResults,
    storageConfig
  } = useAppStore();
  const [jql, setJql] = useState('');
  const [extracting, setExtracting] = useState(false);
  // Active quick-pull preset (days back, e.g. 1 for "Since yesterday").
  // While set, scheduled pulls recompute the window against the real current
  // date instead of reusing frozen dates; null means manual date selection.
  const [quickPullDays, setQuickPullDays] = useState<number | null>(null);

  // Saved JQL state
  const [savedJqls, setSavedJqls] = useState<SavedJql[]>([]);
  const [newJqlName, setNewJqlName] = useState('');
  const [isSavingJql, setIsSavingJql] = useState(false);

  useEffect(() => {
    setSavedJqls(localConfig.getSavedJqls());
  }, []);

  const handleSaveJql = () => {
    if (!jql.trim()) { toast.error('Enter a JQL query first'); return; }
    if (!newJqlName.trim()) { toast.error('Enter a name for this query'); return; }

    const newSavedJql: SavedJql = {
      id: `jql-${Date.now()}`,
      name: newJqlName.trim(),
      query: jql.trim()
    };

    const updated = [...savedJqls, newSavedJql];
    setSavedJqls(updated);
    localConfig.saveJqls(updated);
    setNewJqlName('');
    setIsSavingJql(false);
    toast.success('JQL query saved');
  };

  const handleDeleteJql = (id: string) => {
    const updated = savedJqls.filter(j => j.id !== id);
    setSavedJqls(updated);
    localConfig.saveJqls(updated);
    toast.success('Saved JQL deleted');
  };

  // Persistence state
  const [saveThisExtraction, setSaveThisExtraction] = useState(true);
  const [updateOnly, setUpdateOnly] = useState(false);

  // Polling state
  const [polling, setPolling] = useState<PollingStatus | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollInterval, setPollInterval] = useState('15');
  const [pollSaving, setPollSaving] = useState(false);
  // Last background-run id we refreshed the list for, so each completed run
  // triggers exactly one silent reload of the displayed tickets.
  const lastRefreshedRunIdRef = useRef<number | null>(null);

  // List filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState('created-desc');

  // Track when the last extraction returned no results for persistent empty state
  const [lastExtractionEmpty, setLastExtractionEmpty] = useState(false);

  // Custom extract fields state
  const [customFields, setCustomFields] = useState<CustomExtractField[]>([]);
  const [newFieldId, setNewFieldId] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [showCustomFields, setShowCustomFields] = useState(false);

  // Auto-discover state
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredFields, setDiscoveredFields] = useState<Array<{ fieldId: string; name: string; type: string }>>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [discoverSearch, setDiscoverSearch] = useState('');

  // Load custom extract fields
  useEffect(() => {
    setCustomFields(localConfig.getCustomExtractFields() as CustomExtractField[]);
  }, []);

  const handleDiscover = async () => {
    if (!activeConnectionId) { toast.error('Select a connection first'); return; }
    const activeConn = connections.find(c => c.id === activeConnectionId);
    if (!activeConn) { toast.error('Active connection not found'); return; }

    setDiscovering(true);
    setDiscoveredFields([]);
    setSelectedDiscovered(new Set());
    setDiscoverSearch('');
    setDiscoverOpen(true);

    try {
      const res = await fetch('/api/jira/fields/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraCredentials: {
            baseUrl: activeConn.baseUrl,
            email: activeConn.email,
            apiToken: activeConn.apiToken,
            projectKeys: activeConn.projectKeys,
          },
          jql: jql || '',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch fields');
      setDiscoveredFields(data.fields || []);
    } catch (e: any) {
      toast.error(`Discover failed: ${e.message}`);
      setDiscoverOpen(false);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddDiscovered = () => {
    const alreadyConfigured = new Set(customFields.map(f => f.fieldId));
    const toAdd: CustomExtractField[] = [];

    selectedDiscovered.forEach(fieldId => {
      if (alreadyConfigured.has(fieldId)) return;
      const found = discoveredFields.find(f => f.fieldId === fieldId);
      if (!found) return;
      toAdd.push({
        id: `cf-${Date.now()}-${fieldId}`,
        fieldId: found.fieldId,
        label: found.name,
        role: undefined,
      });
    });

    if (toAdd.length === 0) {
      toast.info('No new fields to add');
      return;
    }

    const updated = [...customFields, ...toAdd];
    setCustomFields(updated);
    localConfig.saveCustomExtractFields(updated);
    toast.success(`Added ${toAdd.length} custom field${toAdd.length > 1 ? 's' : ''}`);
    setDiscoverOpen(false);
  };

  // Load polling status
  useEffect(() => {
    let isMounted = true;
    const loadPolling = () => {
      if (extracting) return;
      
      fetch('/api/jira/poll')
        .then((r) => r.json())
        .then((d) => {
          if (isMounted && d.success) {
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

  useEffect(() => {
    const savedSettings = localConfig.getSettings();
    setSaveThisExtraction(savedSettings.persistence?.autoSave ?? true);
    setUpdateOnly(localConfig.getEtlUpdateOnly());

    // Restore the extract panel's date range / JQL across page reloads. When a
    // quick-pull preset was active, recompute its window against the real
    // current date instead of restoring stale frozen dates.
    const savedJql = localConfig.getExtractJql();
    if (savedJql) setJql(savedJql);
    const savedDays = localConfig.getQuickPullDays();
    if (savedDays && savedDays > 0) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - savedDays);
      setDateFrom(from.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
      setQuickPullDays(savedDays);
    } else {
      const savedDates = localConfig.getExtractDates();
      if (savedDates.dateFrom) setDateFrom(savedDates.dateFrom);
      if (savedDates.dateTo) setDateTo(savedDates.dateTo);
    }
  }, []);

  // Persist manual date/JQL selections so they survive page reloads.
  useEffect(() => {
    localConfig.saveExtractDates({ dateFrom: dateFrom || '', dateTo: dateTo || '' });
    localConfig.saveExtractJql(jql);
  }, [dateFrom, dateTo, jql]);

  useEffect(() => {
    localConfig.saveEtlUpdateOnly(updateOnly);
  }, [updateOnly]);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // In dev, the Next.js server serves an HTML error page for API routes
      // while webpack is (re)compiling — especially after file changes.
      // Treat this as a transient "server busy" state rather than a real error.
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
  };

  // @MX:NOTE: Retries only when the dev server returns HTML instead of JSON (webpack recompiling).
  // @MX:REASON: During development, Next.js serves an HTML error page while recompiling after file
  // changes. This is a transient state, not a real error, so we retry a few times with a delay.
  const fetchWithDevServerRetry = async (url: string, init: RequestInit, attempts = 3, delayMs = 1500) => {
    let res = await fetch(url, init);
    let data = await safeJson(res);
    for (let i = 1; i < attempts && data.serverBusy; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      res = await fetch(url, init);
      data = await safeJson(res);
    }
    return { res, data };
  };

  const handleExtract = async (daysBack?: number) => {
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

            if (pollEnabled) {
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
  };

  const handleQuickPull = (days: number) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
    // Remember the preset so scheduled pulls keep sliding this window forward
    // with the real date instead of freezing on today's values.
    setQuickPullDays(days);
    localConfig.saveQuickPullDays(days);
  };

  const handleCustomDaysBack = () => {
    const days = parseInt((document.getElementById('customDaysBack') as HTMLInputElement)?.value || '0', 10);
    if (days > 0) {
      handleQuickPull(days);
      toast.success(`Set date range to last ${days} days`);
    } else {
      toast.error('Please enter a valid number of days');
    }
  };

  // Shared POST helper. includeInterval=false is used by the date/JQL sync effect
  // so it never overwrites the server's interval with a stale local value.
  const postPollingState = async (nextEnabled: boolean, intervalToUse?: string, includeInterval = true) => {
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
          ...(nextEnabled ? {
            jiraCredentials: {
              baseUrl: activeConn!.baseUrl,
              email: activeConn!.email,
              apiToken: activeConn!.apiToken,
              projectKeys: activeConn!.projectKeys,
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
  };

  const handleTogglePolling = async (targetState?: boolean, overrideInterval?: string) => {
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !pollEnabled;
    const intervalToUse = overrideInterval || pollInterval;
    await postPollingState(nextEnabled, intervalToUse, true);
  };

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
  }, [dateFrom, dateTo, jql, quickPullDays]);

  const handleShowAllTickets = async () => {
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
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Network error while fetching tickets');
    } finally {
      setExtracting(false);
    }
  };

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

  // When a scheduled background run completes, refresh the displayed list once.
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
      refreshMasterData();
    }
  }, [polling, refreshMasterData]);

  const quickPullButtons = [
    { label: 'Since yesterday', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 365 days', days: 365 },
  ];

  const intervalOptions = [
    { label: '1 min', value: '1' },
    { label: '5 min', value: '5' },
    { label: '15 min', value: '15' },
    { label: '30 min', value: '30' },
    { label: '1 hr', value: '60' },
    { label: '4 hr', value: '240' },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-400" /> Jira Extract</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Extract issues from Jira with full changelog for KPI analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 p-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                {activeConnectionId ? (
                  <div>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-400">
                      {connections.find(c => c.id === activeConnectionId)?.name}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-500">
                      {connections.find(c => c.id === activeConnectionId)?.projectKeys}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700 dark:text-emerald-500">
                    No connection selected. Go to <span className="font-semibold">Connections tab</span> to select one.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-700 dark:text-slate-300">Custom JQL Query <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">(optional)</span></Label>
              <div className="flex gap-2">
                {savedJqls.length > 0 && (
                  <Select onValueChange={(val) => setJql(savedJqls.find(j => j.id === val)?.query || '')}>
                    <SelectTrigger className="h-7 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-[150px]">
                      <SelectValue placeholder="Load saved..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedJqls.map(j => (
                        <div key={j.id} className="flex items-center justify-between group px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer">
                          <SelectItem value={j.id} className="flex-1 cursor-pointer">{j.name}</SelectItem>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteJql(j.id); }}
                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  onClick={() => setIsSavingJql(!isSavingJql)}
                >
                  <Save className="h-3 w-3 mr-1" /> Save Query
                </Button>
              </div>
            </div>
            
            <textarea 
              className="w-full min-h-[80px] rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-800 dark:text-slate-200 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
              placeholder='project = "PROJ" AND created >= "2024-01-01" ORDER BY created DESC' 
              value={jql} 
              onChange={(e) => setJql(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Escape') setJql('');
              }}
            />
            
            {isSavingJql && (
              <div className="flex items-center gap-2 mt-2 animate-in slide-in-from-top-1 duration-200">
                <Input 
                  placeholder="Query name (e.g. Bug Filter)" 
                  value={newJqlName} 
                  onChange={(e) => setNewJqlName(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
                <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600" onClick={handleSaveJql}>Confirm Save</Button>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setIsSavingJql(false)}>Cancel</Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center h-6">
                <Label className="text-slate-700 dark:text-slate-300">Date From</Label>
              </div>
              <Input type="date" value={dateFrom || ''} onChange={(e) => { setDateFrom(e.target.value); setQuickPullDays(null); localConfig.saveQuickPullDays(null); }} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center h-6">
                <Label className="text-slate-700 dark:text-slate-300">Date To</Label>
              </div>
              <Input type="date" value={dateTo || ''} onChange={(e) => { setDateTo(e.target.value); setQuickPullDays(null); localConfig.saveQuickPullDays(null); }} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
            </div>
          </div>

          {settings && !(settings as AppSettings).persistence?.autoSave && (
            <div className="flex items-center space-x-2 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
              <Checkbox
                id="saveThisExtraction"
                checked={!!saveThisExtraction}
                onCheckedChange={(checked) => setSaveThisExtraction(checked as boolean)}
              />
              <div className="flex-1">
                <label
                  htmlFor="saveThisExtraction"
                  className="text-sm font-medium text-amber-900 dark:text-amber-400 cursor-pointer"
                >
                  Save this extraction
                </label>
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Override global setting for this extraction only
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200/50 dark:border-blue-500/20">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="update-only" className="text-sm font-semibold text-blue-900 dark:text-blue-400 cursor-pointer">Update Only Mode</Label>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-500">
                Upsert existing/new tickets without deleting anything. Uses "updated" field for filtering.
              </p>
            </div>
            <Switch 
              id="update-only" 
              checked={updateOnly} 
              onCheckedChange={setUpdateOnly} 
            />
          </div>

          {/* Custom Extract Fields */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center bg-slate-50 dark:bg-slate-800/50 border-b border-transparent">
              <button
                type="button"
                className="flex-1 flex items-center gap-2 p-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                onClick={() => setShowCustomFields(!showCustomFields)}
              >
                <Tag className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Custom Extract Fields</span>
                {customFields.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                    {customFields.length}
                  </Badge>
                )}
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ml-auto ${showCustomFields ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-full px-3 rounded-none border-l border-slate-200 dark:border-slate-700 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 gap-1.5 text-xs"
                onClick={handleDiscover}
                title="Auto-discover custom fields from your Jira instance"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Discover
              </Button>
            </div>

            {showCustomFields && (
              <div className="p-3 space-y-3 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-1 duration-200">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Define custom Jira field IDs (e.g. <code className="text-violet-500 bg-violet-50 dark:bg-violet-500/10 px-1 rounded">customfield_12345</code>) to include in extraction.
                </p>

                {/* User-defined custom fields */}
                {customFields.length > 0 && (
                  <div className="space-y-1.5">
                    {customFields.map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-violet-50/50 dark:bg-violet-500/5 border border-violet-200/50 dark:border-violet-500/15 group"
                      >
                        <code className="text-xs font-mono text-violet-600 dark:text-violet-400 shrink-0">{field.fieldId}</code>
                        <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{field.label}</span>
                        {field.role === 'storyPoints' && <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-400/30 text-amber-500 dark:text-amber-400 shrink-0">Story Points</Badge>}
                        {field.role === 'issueOwnerTeam' && <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-blue-400/30 text-blue-500 dark:text-blue-400 shrink-0">Issue Owner Team</Badge>}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = customFields.filter(f => f.id !== field.id);
                            setCustomFields(updated);
                            localConfig.saveCustomExtractFields(updated);
                            toast.success(`Removed field: ${field.label}`);
                          }}
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new field form */}
                <div className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-700 pt-2">
                  <div className="flex items-center gap-2">
                  <Input
                    placeholder="customfield_12345"
                    value={newFieldId}
                    onChange={(e) => setNewFieldId(e.target.value)}
                    className="h-8 text-xs font-mono bg-white dark:bg-slate-900 flex-1"
                  />
                  <Input
                    placeholder="Display label"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-slate-900 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs border-violet-500/30 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 shrink-0"
                    onClick={() => {
                      const trimmedId = newFieldId.trim();
                      const trimmedLabel = newFieldLabel.trim();
                      if (!trimmedId) { toast.error('Field ID is required'); return; }
                      if (!trimmedLabel) { toast.error('Display label is required'); return; }
                      if (customFields.some(f => f.fieldId === trimmedId)) {
                        toast.error('This field ID is already added');
                        return;
                      }
                      const roleVal = (document.getElementById('newFieldRole') as HTMLSelectElement)?.value || 'none';
                      const newField: CustomExtractField = {
                        id: `cf-${Date.now()}`,
                        fieldId: trimmedId,
                        label: trimmedLabel,
                        role: roleVal === 'storyPoints' ? 'storyPoints'
                          : roleVal === 'issueOwnerTeam' ? 'issueOwnerTeam'
                          : roleVal === 'custom' ? 'custom'
                          : undefined,
                      };
                      const updated = [...customFields, newField];
                      setCustomFields(updated);
                      localConfig.saveCustomExtractFields(updated);
                      setNewFieldId('');
                      setNewFieldLabel('');
                      toast.success(`Added custom field: ${trimmedLabel}`);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    id="newFieldRole"
                    className="h-7 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded px-2 w-full max-w-[200px]"
                  >
                    <option value="none">No special role (Normal custom field)</option>
                    <option value="storyPoints">Map to Story Points</option>
                    <option value="issueOwnerTeam">Map to Issue Owner Team</option>
                  </select>
                  <span className="text-[10px] text-slate-500">Optional: Maps this field to built-in KPI logic</span>
                </div>
              </div>
              </div>
            )}
          </div>

          <Separator className="bg-slate-200 dark:bg-slate-800" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-emerald-400" />
              <Label className="text-sm font-semibold">Quick Date Selection</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickPullButtons.map((btn) => {
                const todayStr = new Date().toISOString().split('T')[0];
                const isToday = dateTo === todayStr;
                const fromDate = dateFrom ? new Date(dateFrom) : null;
                const toDate = dateTo ? new Date(dateTo) : null;
                const diffDays = (fromDate && toDate) ? Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                const isActive = isToday && diffDays === btn.days;

                return (
                  <Button 
                    key={btn.days} 
                    variant={isActive ? "default" : "outline"} 
                    size="sm"
                    className={`h-8 text-[11px] border-slate-200 dark:border-slate-700 ${
                      isActive 
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                        : 'hover:bg-gray-200 dark:hover:bg-slate-700'
                    }`} 
                    onClick={() => handleQuickPull(btn.days)}
                  >
                    {btn.label}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Input id="customDaysBack" type="number" placeholder="Days back" className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-28 h-8 text-xs" min="1" />
              <Button variant="outline" size="sm" className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-100 dark:bg-emerald-500/10" onClick={handleCustomDaysBack}>
                Set Range
              </Button>
              {updateOnly && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-100 dark:bg-blue-500/10"
                  onClick={() => {
                    const days = parseInt((document.getElementById('customDaysBack') as HTMLInputElement)?.value || '0', 10);
                    if (days > 0) {
                      handleExtract(days);
                    } else {
                      toast.error('Please enter a valid number of days');
                    }
                  }}
                >
                  Quick Update
                </Button>
              )}
            </div>
          </div>

          <Separator className="bg-slate-200 dark:bg-slate-800" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-emerald-400" /> Scheduled Pulling
              </Label>
              <div className="flex items-center gap-2">
                {polling?.enabled && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] animate-pulse bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    LIVE
                  </Badge>
                )}
                <Switch checked={pollEnabled} onCheckedChange={(checked) => handleTogglePolling(checked)} disabled={pollSaving || !activeConnectionId} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[120px]">
                <Select value={pollInterval} onValueChange={(v) => { setPollInterval(v); if(pollEnabled) handleTogglePolling(true, v); }} disabled={pollSaving}>
                  <SelectTrigger className="h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Interval" />
                  </SelectTrigger>
                  <SelectContent>
                    {intervalOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[180px] rounded-md bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-2">
                <div className="flex flex-col gap-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Run:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{polling?.lastRunAt ? new Date(polling.lastRunAt).toLocaleTimeString() : 'Never'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Next Run:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{polling?.nextRunAt ? new Date(polling.nextRunAt).toLocaleTimeString() : '-'}</span>
                  </div>
                  {polling?.lastError && (
                    <div className="text-red-400 truncate mt-1 border-t border-red-500/10 pt-1">
                      Error: {polling.lastError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => handleExtract()} disabled={extracting || !activeConnectionId || !dateFrom || !dateTo} className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2">
            {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting Issues...</> : <><RefreshCw className="mr-2 h-4 w-4" />Run Jira Extraction</>}
          </Button>
        </CardContent>
      </Card>

      {masterDatasetInfo && (
        <Card className="border-blue-500/20 bg-blue-50 dark:bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg"><HardDrive className="h-5 w-5 text-blue-400" /> Master Dataset</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">Total tickets accumulated from all extractions for this connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Total Unique Tickets:</span>
              <span className="font-bold text-blue-400">{masterDatasetInfo.totalExtracted}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Date Range:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {masterDatasetInfo.dateRange?.from ? `${new Date(masterDatasetInfo.dateRange.from).toLocaleDateString()} - ${new Date(masterDatasetInfo.dateRange.to).toLocaleDateString()}` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Last Updated:</span>
              <span className="text-slate-700 dark:text-slate-300">{new Date(masterDatasetInfo.lastUpdated).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={handleShowAllTickets}
                disabled={extracting || !activeConnectionId || (masterDatasetInfo && masterDatasetInfo.totalExtracted === 0)}
              >
                <LayoutGrid className="mr-1 h-3 w-3" /> Show All Tickets
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={async () => {
                  if (confirm('Are you sure you want to clear the entire master dataset for this connection? This cannot be undone.')) {
                    try {
                      const res = await fetch(`/api/jira/master/${activeConnectionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'delete', storageConfig })
                      });
                      const data = await res.json();
                      if (data.success) {
                        toast.success(data.message);
                        setMasterDatasetInfo({ totalExtracted: 0, lastUpdated: new Date().toISOString() });
                        setExtractionResult(null);
                        setKpiResults([]);
                      }
                    } catch (e) {
                      toast.error('Failed to clear master dataset');
                    }
                  }
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Clear Master Dataset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when last extraction returned no results */}
      {lastExtractionEmpty && !extractionResult && (
        <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-500/5">
          <CardContent className="py-8">
            <div className="text-center">
              <Search className="h-12 w-12 mx-auto mb-3 text-amber-400 opacity-50" />
              <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-300 mb-2">No Issues Found</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400 max-w-md mx-auto">
                No tickets matched your extraction criteria. Try adjusting your JQL query, expanding the date range, or verifying the project key.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {extractionResult && (extractionResult.total > 0 || (extractionResult.issues && extractionResult.issues.length > 0)) && (
        <Card className={`border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 ${extracting ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              {extractionResult.isAllTickets ? (
                <><HardDrive className="h-5 w-5" /> Master Dataset</>
              ) : (
                <><CheckCircle2 className="h-5 w-5" /> Extraction Complete</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{extractionResult.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Extracted</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">
                  {(extractionResult.issues || []).filter((i: any) => {
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    const category = (i.statusCategory || '').toLowerCase();
                    return category === 'done' || ['done', 'closed', 'close', 'resolved', 'completed', 'ready to close'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {(extractionResult.issues || []).filter((i: any) => {
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    const category = (i.statusCategory || '').toLowerCase();
                    return category !== 'done' && !['done', 'closed', 'close', 'resolved', 'completed', 'ready to close'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Oldest</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(() => {
                    const issues = extractionResult.issues || [];
                    const dates = issues
                      .map((i: any) => i.fields?.created || i.created)
                      .filter((d: any) => d)
                      .map((d: any) => new Date(d).getTime());
                    const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
                    return oldestDate ? oldestDate.toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Newest</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(() => {
                    const issues = extractionResult.issues || [];
                    const dates = issues
                      .map((i: any) => i.fields?.created || i.created)
                      .filter((d: any) => d)
                      .map((d: any) => new Date(d).getTime());
                    const newestDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;
                    return newestDate ? newestDate.toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by key or summary..."
                    className="pl-9 pr-8 bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={sortOption} onValueChange={setSortOption}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Order</SelectItem>
                    <SelectItem value="key-asc">Key (A-Z)</SelectItem>
                    <SelectItem value="key-desc">Key (Z-A)</SelectItem>
                    <SelectItem value="created-desc">Newest Created</SelectItem>
                    <SelectItem value="created-asc">Oldest Created</SelectItem>
                    <SelectItem value="updated-desc">Newest Update</SelectItem>
                    <SelectItem value="updated-asc">Oldest Update</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full sm:w-[160px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0 justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedStatuses.length ? `${selectedStatuses.length} selected` : 'All Statuses'}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="end">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-[10px] justify-start px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => setSelectedStatuses([])}
                      >
                        Clear Selection
                      </Button>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
                      {Array.from(new Set<string>((extractionResult.issues || []).map((i: any) => (i.fields?.status?.name || i.status) as string))).sort().map((status: string) => (
                        <div
                          key={status}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm"
                          onClick={() =>
                            setSelectedStatuses(prev =>
                              prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                            )
                          }
                        >
                          <Checkbox
                            checked={selectedStatuses.includes(status)}
                            className="pointer-events-none"
                          />
                          <span className="text-xs truncate">{status}</span>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div 
                className="space-y-1 overflow-y-auto pr-1 custom-scrollbar"
                style={{ maxHeight: `${(settings as AppSettings).general?.listMaxHeight || 400}px` }}
              >
                {(extractionResult.issues || []).filter((issue: any) => {
                  const key = (issue.key || '').toLowerCase();
                  const summary = (issue.fields?.summary || issue.summary || '').toLowerCase();
                  const status = issue.fields?.status?.name || issue.status;
                  const matchesSearch = key.includes(searchQuery.toLowerCase()) || summary.includes(searchQuery.toLowerCase());
                  const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(status);
                  return matchesSearch && matchesStatus;
                }).sort((a: any, b: any) => {
                  if (sortOption === 'key-asc') {
                    return (a.key || '').localeCompare(b.key || '', undefined, { numeric: true });
                  } else if (sortOption === 'key-desc') {
                    return (b.key || '').localeCompare(a.key || '', undefined, { numeric: true });
                  } else if (sortOption === 'created-desc') {
                    const dateA = new Date(a.fields?.created || a.created || 0).getTime();
                    const dateB = new Date(b.fields?.created || b.created || 0).getTime();
                    return dateB - dateA;
                  } else if (sortOption === 'created-asc') {
                    const dateA = new Date(a.fields?.created || a.created || 0).getTime();
                    const dateB = new Date(b.fields?.created || b.created || 0).getTime();
                    return dateA - dateB;
                  } else if (sortOption === 'updated-desc') {
                    const dateA = new Date(a.fields?.updated || a.updated || a.fields?.created || a.created || 0).getTime();
                    const dateB = new Date(b.fields?.updated || b.updated || b.fields?.created || b.created || 0).getTime();
                    return dateB - dateA;
                  } else if (sortOption === 'updated-asc') {
                    const dateA = new Date(a.fields?.updated || a.updated || a.fields?.created || a.created || 0).getTime();
                    const dateB = new Date(b.fields?.updated || b.updated || b.fields?.created || b.created || 0).getTime();
                    return dateA - dateB;
                  }
                  return 0;
                }).map((issue: any) => {
                  const activeConnection = connections.find(c => c.id === activeConnectionId);
                  const baseUrl = activeConnection?.baseUrl || '';
                  const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                  const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                  const isResolved = (() => {
                    const status = (issue.fields?.status?.name || issue.status || '').toLowerCase();
                    const category = (issue.statusCategory || '').toLowerCase();
                    return category === 'done' || ['done', 'closed', 'close', 'resolved', 'completed', 'ready to close'].includes(status);
                  })();

                  return (
                    <div key={issue.key} className="flex items-center gap-3 py-2 px-3 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-slate-700/40 dark:bg-slate-800/20 text-sm group">
                      <a
                        href={jiraUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-xs font-mono shrink-0 flex items-center gap-1 transition-colors"
                      >
                        {issue.key}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      <span className="truncate text-slate-700 dark:text-slate-300 flex-1">{issue.fields?.summary || issue.summary}</span>
                      <span className="truncate text-slate-500 dark:text-slate-400 text-xs w-28 sm:w-36 shrink-0">{issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned'}</span>
                      <Badge variant={isResolved ? 'default' : 'secondary'} className={`text-xs shrink-0 ${isResolved ? 'bg-blue-600' : ''}`}>{issue.fields?.status?.name || issue.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Auto-Discover Custom Fields Dialog ── */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Discovered Custom Fields
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 text-xs">
              {jql
                ? 'Fields found on tickets matching your current JQL.'
                : 'All custom fields defined in your Jira instance (no JQL configured — showing full list).'}
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search by name or field ID…"
              value={discoverSearch}
              onChange={e => setDiscoverSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Field list */}
          <ScrollArea className="h-72 rounded-md border border-slate-200 dark:border-slate-700">
            {discovering ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-10 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                <span className="text-xs">Fetching fields from Jira…</span>
              </div>
            ) : discoveredFields.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 py-10">
                No custom fields found.
              </div>
            ) : (() => {
              const alreadyConfigured = new Set(customFields.map(f => f.fieldId));
              const lower = discoverSearch.toLowerCase();
              const filtered = discoveredFields.filter(f =>
                !lower || f.fieldId.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower)
              );
              if (filtered.length === 0) return (
                <div className="flex items-center justify-center h-full text-xs text-slate-400 py-10">
                  No fields match your search.
                </div>
              );
              return (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(field => {
                    const isAlready = alreadyConfigured.has(field.fieldId);
                    const isSelected = selectedDiscovered.has(field.fieldId);
                    return (
                      <label
                        key={field.fieldId}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          isAlready
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-violet-50/50 dark:hover:bg-violet-500/5'
                        }`}
                      >
                        <Checkbox
                          checked={isAlready ? false : isSelected}
                          disabled={isAlready}
                          onCheckedChange={checked => {
                            if (isAlready) return;
                            setSelectedDiscovered(prev => {
                              const next = new Set(prev);
                              checked ? next.add(field.fieldId) : next.delete(field.fieldId);
                              return next;
                            });
                          }}
                          className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{field.name}</p>
                          <code className="text-[10px] text-slate-400 dark:text-slate-500">{field.fieldId}</code>
                        </div>
                        {isAlready && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-slate-300/50 text-slate-400 shrink-0">Added</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </ScrollArea>

          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
            <p className="text-xs text-slate-400">
              {selectedDiscovered.size > 0
                ? `${selectedDiscovered.size} field${selectedDiscovered.size > 1 ? 's' : ''} selected`
                : `${discoveredFields.length} field${discoveredFields.length !== 1 ? 's' : ''} discovered`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setDiscoverOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white"
                disabled={selectedDiscovered.size === 0}
                onClick={handleAddDiscovered}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Selected ({selectedDiscovered.size})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

