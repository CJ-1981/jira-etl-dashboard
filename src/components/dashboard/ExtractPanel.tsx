'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Download, RefreshCw, Server, Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { localConfig, CustomExtractField, AppSettings } from '@/lib/config/local-store';
import { runtimeFeatures } from '@/lib/runtime/mode';
import { DEMO_CONNECTION_ID } from '@/lib/datasource/demo-data';
import { useAppStore } from '@/store/app-store';
import { JqlEditor } from './extract/JqlEditor';
import { CustomFieldDiscovery } from './extract/CustomFieldDiscovery';
import { QuickDateSelector } from './extract/QuickDateSelector';
import { PollingSettings } from './extract/PollingSettings';
import { MasterDatasetCard } from './extract/MasterDatasetCard';
import { EmptyExtractionCard } from './extract/EmptyExtractionCard';
import { ExtractionPreviewTable } from './extract/ExtractionPreviewTable';
import { useExtraction } from './extract/useExtraction';
import { usePolling } from './extract/usePolling';

export const ExtractPanel = React.memo(function ExtractPanel() {
  const {
    connections,
    extractionResult,
    masterDatasetInfo,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    activeConnectionId,
    setActiveConnectionId,
    setExtractionResult,
    setMasterDatasetInfo,
    setKpiResults,
    settings,
  } = useAppStore();

  const [jql, setJql] = useState('');
  // Demo mode serves artificial data through the DataSource seam without any
  // Jira credentials. Persisted (cfg_demo_mode) so a reload keeps the session.
  const [isDemo, setIsDemo] = useState(false);
  // Active quick-pull preset (days back, e.g. 1 for "Since yesterday").
  // While set, scheduled pulls recompute the window against the real current
  // date instead of reusing frozen dates; null means manual date selection.
  const [quickPullDays, setQuickPullDays] = useState<number | null>(null);

  // Persistence state
  const [saveThisExtraction, setSaveThisExtraction] = useState(true);
  const [updateOnly, setUpdateOnly] = useState(false);

  // Custom extract fields state (CRUD + persistence live in CustomFieldDiscovery)
  const [customFields, setCustomFields] = useState<CustomExtractField[]>([]);

  useEffect(() => {
    setCustomFields(localConfig.getCustomExtractFields() as CustomExtractField[]);
    setIsDemo(localConfig.getDemoMode());
  }, []);

  // Entering demo mode: flip the persisted flag, point the app at the synthetic
  // 'demo' connection, and open a 90-day window covering the generated data.
  // The master-dataset query then reruns for the new connection id and the
  // page's auto-populate flow fills the ticket list and dashboard.
  const handleEnterDemo = useCallback(() => {
    localConfig.saveDemoMode(true);
    setIsDemo(true);
    setQuickPullDays(null);
    localConfig.saveQuickPullDays(null);
    setActiveConnectionId(DEMO_CONNECTION_ID);
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 89);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
    toast.success('Demo mode enabled', {
      description: 'Browsing artificial demo data — no Jira credentials used.',
      duration: 5000,
    });
  }, [setActiveConnectionId, setDateFrom, setDateTo]);

  // Leaving demo mode: restore the most plausible real connection and clear
  // the in-memory demo payload. If a real connection exists its master-dataset
  // query refetches for the restored id and repopulates everything; without
  // one, the demo data is simply dropped.
  const handleExitDemo = useCallback(() => {
    localConfig.saveDemoMode(false);
    setIsDemo(false);
    setExtractionResult(null);
    setKpiResults([]);
    const next = connections.find(c => c.isActive)?.id || connections[0]?.id || '';
    if (!next) setMasterDatasetInfo(null);
    setActiveConnectionId(next);
    toast('Demo mode off', { duration: 3000 });
  }, [connections, setActiveConnectionId, setExtractionResult, setKpiResults, setMasterDatasetInfo]);

  // Ref-backed getter breaks the circular dependency between the extraction
  // hook (pings polling after a successful run) and the polling hook (pauses
  // its 5s refresh while an extraction is in flight).
  const pollEnabledRef = useRef(false);
  const getPollEnabled = useCallback(() => pollEnabledRef.current, []);

  const {
    extracting,
    lastExtractionEmpty,
    handleExtract,
    handleShowAllTickets,
    refreshMasterData,
  } = useExtraction({ jql, quickPullDays, saveThisExtraction, updateOnly, customFields, getPollEnabled });

  const {
    polling,
    pollEnabled,
    pollInterval,
    setPollInterval,
    pollSaving,
    handleTogglePolling,
  } = usePolling({
    extracting,
    dateFrom,
    dateTo,
    jql,
    quickPullDays,
    customFields,
    updateOnly,
    onRunCompleted: refreshMasterData,
  });

  useEffect(() => {
    pollEnabledRef.current = pollEnabled;
  }, [pollEnabled]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist manual date/JQL selections so they survive page reloads.
  useEffect(() => {
    localConfig.saveExtractDates({ dateFrom: dateFrom || '', dateTo: dateTo || '' });
    localConfig.saveExtractJql(jql);
  }, [dateFrom, dateTo, jql]);

  useEffect(() => {
    localConfig.saveEtlUpdateOnly(updateOnly);
  }, [updateOnly]);

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

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-400" /> Jira Extract</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Extract issues from Jira with full changelog for KPI analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDemo ? (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-300 dark:border-amber-500/30 p-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
                    Demo Mode
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    Browsing artificial demo data — no Jira connection or credentials used.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExitDemo}
                  className="h-8 shrink-0 text-xs border-amber-400/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10"
                >
                  Exit Demo Mode
                </Button>
              </div>
            </div>
          ) : (
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
                {!activeConnectionId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleEnterDemo}
                    className="h-8 shrink-0 text-xs border-amber-400/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10"
                  >
                    <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
                    Try Demo Mode
                  </Button>
                )}
              </div>
            </div>
          )}

          <JqlEditor jql={jql} onJqlChange={setJql} />

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
                Upsert existing/new tickets without deleting anything. Uses &quot;updated&quot; field for filtering.
              </p>
            </div>
            <Switch
              id="update-only"
              checked={updateOnly}
              onCheckedChange={setUpdateOnly}
            />
          </div>

          {runtimeFeatures.hasFieldDiscovery && (
            <CustomFieldDiscovery customFields={customFields} onFieldsChange={setCustomFields} jql={jql} />
          )}

          <Separator className="bg-slate-200 dark:bg-slate-800" />

          <QuickDateSelector
            dateFrom={dateFrom}
            dateTo={dateTo}
            updateOnly={updateOnly}
            onQuickPull={handleQuickPull}
            onQuickUpdate={(days) => handleExtract(days)}
          />

          {runtimeFeatures.hasPolling && (
            <>
              <Separator className="bg-slate-200 dark:bg-slate-800" />

              <PollingSettings
                polling={polling}
                pollEnabled={pollEnabled}
                pollInterval={pollInterval}
                pollSaving={pollSaving}
                // Background polling pulls from real Jira — meaningless in demo.
                toggleDisabled={!activeConnectionId || isDemo}
                onToggle={(checked) => handleTogglePolling(checked)}
                onIntervalChange={(v) => { setPollInterval(v); if (pollEnabled) handleTogglePolling(true, v); }}
              />
            </>
          )}

          <Button onClick={() => handleExtract()} disabled={extracting || !activeConnectionId || !dateFrom || !dateTo} className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2">
            {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting Issues...</> : <><RefreshCw className="mr-2 h-4 w-4" />Run Jira Extraction</>}
          </Button>
        </CardContent>
      </Card>

      {masterDatasetInfo && (
        <MasterDatasetCard
          info={masterDatasetInfo}
          extracting={extracting}
          onShowAllTickets={handleShowAllTickets}
        />
      )}

      {/* Empty state when last extraction returned no results */}
      {lastExtractionEmpty && !extractionResult && <EmptyExtractionCard />}

      {extractionResult && (extractionResult.total > 0 || (extractionResult.issues && extractionResult.issues.length > 0)) && (
        <ExtractionPreviewTable
          result={extractionResult}
          connections={connections}
          activeConnectionId={activeConnectionId}
          extracting={extracting}
          listMaxHeight={(settings as AppSettings).general?.listMaxHeight || 400}
        />
      )}
    </div>
  );
});
