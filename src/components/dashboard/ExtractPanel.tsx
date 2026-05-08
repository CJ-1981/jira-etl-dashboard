'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Download, RefreshCw, Server, RotateCw, Clock, HardDrive, LayoutGrid, Trash2, Search, X, ExternalLink, CheckCircle2, Loader2, Save
} from 'lucide-react';
import { localConfig, JiraConnection, SavedJql } from '@/lib/config/local-store';
import { PollingStatus } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { AppSettings } from '@/lib/config/local-store';

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

  // List filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOption, setSortOption] = useState('default');

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
  }, []);

  useEffect(() => {
    localConfig.saveEtlUpdateOnly(updateOnly);
  }, [updateOnly]);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', text.substring(0, 500));
      return { success: false, error: `Server error (${res.status})` };
    }
  };

  const handleExtract = async (daysBack?: number) => {
    if (!activeConnectionId) { toast.error('Please select a connection in the Connections tab'); return; }
    setExtracting(true); setKpiResults([]);

    const loadingToast = toast.loading('Extracting issues from Jira...', { duration: 0 });

    try {
      const activeConn = connections.find(c => c.id === activeConnectionId);
      if (!activeConn) throw new Error('Selected connection not found');

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
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        saveExtraction: saveThisExtraction,
        updateOnly,
        storageConfig
      };
      if (daysBack) body.daysBack = daysBack;

      const res = await fetch('/api/jira/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      toast.dismiss(loadingToast);

      const data = await safeJson(res);

      if (res.ok && data.success) {
        const extractedCount = data.summary.totalExtracted;

        if (extractedCount === 0) {
          toast.warning('Extraction returned 0 issues. This could be due to: invalid/expired API token, incorrect project key, or no issues in the date range. Try testing your connection and checking credentials.', { duration: 8000 });
        } else {
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
          const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get', storageConfig })
          });
          
          const masterData = await safeJson(masterRes);
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
          toast.error('Authentication failed. Please check your Jira credentials.', { duration: 5000 });
        } else if (res.status === 429) {
          toast.error('Rate limit exceeded. Increase delay in settings and try again.', { duration: 5000 });
        } else if (res.status === 503 || res.status === 504) {
          toast.error('Jira server unavailable or timeout. Try reducing the date range or batch size.', { duration: 5000 });
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

  const handleTogglePolling = async (targetState?: boolean, overrideInterval?: string) => {
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !pollEnabled;
    const intervalToUse = overrideInterval || pollInterval;

    if (nextEnabled && !activeConnectionId) {
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
          intervalMinutes: parseInt(intervalToUse) || 15,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          jql: jql || undefined,
          enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPolling(data.polling);
        setPollEnabled(data.polling.enabled);
        toast.success(data.polling.enabled ? 'Polling started' : 'Polling stopped');
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

  const handleShowAllTickets = async () => {
    if (!activeConnectionId) { toast.error('Please select a connection first'); return; }
    setExtracting(true);
    const loadingToast = toast.loading('Fetching all tickets from database...', { duration: 0 });

    try {
      const res = await fetch(`/api/jira/master/${activeConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig })
      });
      
      toast.dismiss(loadingToast);
      const data = await safeJson(res);
      
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
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center h-6">
                <Label className="text-slate-700 dark:text-slate-300">Date To</Label>
              </div>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
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
                <Switch checked={pollEnabled} onCheckedChange={handleTogglePolling} disabled={pollSaving || !activeConnectionId} />
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
                    <SelectItem value="updated-desc">Newest Update</SelectItem>
                    <SelectItem value="updated-asc">Oldest Update</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Array.from(new Set<string>((extractionResult.issues || []).map((i: any) => (i.fields?.status?.name || i.status) as string))).sort().map((status: string) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  const matchesStatus = statusFilter === 'all' || status === statusFilter;
                  return matchesSearch && matchesStatus;
                }).sort((a: any, b: any) => {
                  if (sortOption === 'key-asc') {
                    return (a.key || '').localeCompare(b.key || '', undefined, { numeric: true });
                  } else if (sortOption === 'key-desc') {
                    return (b.key || '').localeCompare(a.key || '', undefined, { numeric: true });
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
                      <Badge variant={isResolved ? 'default' : 'secondary'} className={`text-xs shrink-0 ${isResolved ? 'bg-blue-600' : ''}`}>{issue.fields?.status?.name || issue.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
