'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, FlaskConical, X } from 'lucide-react';
import { toast } from 'sonner';
import { QuickDateSelector } from '../extract/QuickDateSelector';
import { useExtraction } from '../extract/useExtraction';
import { useQueryClient } from '@tanstack/react-query';
import { localConfig } from '@/lib/config/local-store';
import { DEMO_CONNECTION_ID } from '@/lib/datasource/demo-data';
import { useAppStore } from '@/store/app-store';

/**
 * Simple-mode extraction bar: the essentials of the Data Center extraction
 * panel (quick date window + run button) in one compact row, shown at the top
 * of the combined KPI view. The pull window is local to the bar; the analysis
 * period defaults to the full pulled range and can be overridden from the
 * dashboard's Analysis Period controls.
 */
export const SimpleExtractionBar = React.memo(function SimpleExtractionBar() {
  const {
    connections,
    activeConnectionId,
    setActiveConnectionId,
    setExtractionResult,
    setKpiResults,
    setMasterDatasetInfo,
  } = useAppStore();

  // Demo state is inferred from the active connection id (demo always selects
  // the synthetic 'demo' connection; the wizard/exit flows keep them in sync).
  const [quickPullDays, setQuickPullDays] = useState<number | null>(
    () => localConfig.getQuickPullDays(),
  );

  // The pull window is LOCAL to the bar and independent of the analysis
  // period: picking a window here never moves the dashboard's Analysis
  // Period (which defaults to the full pulled range, overridable there).
  const dayIso = (daysBack: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().split('T')[0];
  };
  const defaultDays = localConfig.getQuickPullDays() ?? 1;
  const [pullFrom, setPullFrom] = useState(() => dayIso(defaultDays));
  const [pullTo, setPullTo] = useState(() => dayIso(0));
  const getWindow = useCallback(
    () => ({ dateFrom: pullFrom, dateTo: pullTo }),
    [pullFrom, pullTo],
  );

  const handleQuickPull = useCallback((days: number) => {
    setPullFrom(dayIso(days));
    setPullTo(dayIso(0));
    setQuickPullDays(days);
    localConfig.saveQuickPullDays(days);
  }, [setPullFrom, setPullTo]);

  const customFields = useMemo(() => localConfig.getCustomExtractFields(), []);

  const queryClient = useQueryClient();

  const {
    extracting,
    handleExtract,
  } = useExtraction({
    jql: '',
    quickPullDays,
    saveThisExtraction: true,
    updateOnly: false,
    customFields,
    // Simple mode has no polling UI — never ping the scheduler from the bar.
    getPollEnabled: () => false,
    getWindow,
  });

  // A pull wipes the store's kpiResults; the KPI query only re-runs when its
  // key changes, and re-pulling the same range changes nothing — so invalidate
  // it explicitly to recalculate against the fresh dataset.
  const runExtraction = useCallback(async () => {
    await handleExtract();
    await queryClient.invalidateQueries({ queryKey: ['kpi-results'] });
  }, [handleExtract, queryClient]);

  const exitDemo = useCallback(() => {
    // Mirror ExtractPanel's exit: drop the demo flag + in-memory demo payload
    // and fall back to the most plausible real connection.
    localConfig.saveDemoMode(false);
    setExtractionResult(null);
    setKpiResults([]);
    const next = connections.find((c) => c.isActive)?.id || connections[0]?.id || '';
    if (!next) setMasterDatasetInfo(null);
    setActiveConnectionId(next);
    toast('Demo mode off', { duration: 3000 });
  }, [connections, setActiveConnectionId, setExtractionResult, setKpiResults, setMasterDatasetInfo]);

  const connectionName = connections.find((c) => c.id === activeConnectionId)?.name;
  const isDemoConnection = activeConnectionId === DEMO_CONNECTION_ID;
  const hasConnection = !!activeConnectionId;

  return (
    <Card className="mb-5 border-emerald-500/30 bg-white dark:bg-slate-900/50">
      <CardContent className="py-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0 lg:w-56">
            <RefreshCw className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">
                {isDemoConnection ? 'Demo data' : connectionName || 'No connection'}
              </p>
              <p className="text-[10px] text-slate-400 leading-tight">
                {isDemoConnection ? 'artificial dataset' : 'pull tickets from Jira'}
              </p>
            </div>
            {isDemoConnection && (
              <button
                onClick={exitDemo}
                className="text-slate-400 hover:text-amber-500 transition-colors"
                title="Exit demo mode"
                aria-label="Exit demo mode"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <QuickDateSelector
              dateFrom={pullFrom}
              dateTo={pullTo}
              updateOnly={false}
              onQuickPull={handleQuickPull}
              onQuickUpdate={() => runExtraction()}
            />
          </div>

          <Button
            onClick={() => runExtraction()}
            disabled={extracting || !hasConnection || !pullFrom || !pullTo}
            className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            title={hasConnection ? 'Pull tickets for the selected window' : 'Select a connection or start demo mode first'}
          >
            {extracting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting...</>
              : <><RefreshCw className="mr-2 h-4 w-4" />Run Extraction</>}
          </Button>
        </div>
        {!hasConnection && !isDemoConnection && (
          <p className="text-[10px] text-amber-500 mt-2 flex items-center gap-1">
            <FlaskConical className="h-3 w-3" />
            No connection configured — use the wizard or the gear icon to set one up, then run an extraction.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
