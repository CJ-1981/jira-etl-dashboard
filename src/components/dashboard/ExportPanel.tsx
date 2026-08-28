'use client';

import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  FileSpreadsheet, Database, CheckCircle2, Info, LayoutGrid, Zap, Ticket,
  FileJson, Loader2, HardDrive, XCircle, AlertTriangle, RefreshCw
} from 'lucide-react';
import { localConfig, type PgConnection } from '@/lib/config/local-store';
import { GERMAN_STATES } from '@/lib/config/constants';
import { getDataSource } from '@/lib/datasource';
import { runtimeFeatures } from '@/lib/runtime/mode';
import { useAppStore } from '@/store/app-store';

export function ExportPanel() {
  const {
    extractionResult,
    masterDatasetInfo,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    region,
    setRegion,
    storageConfig
  } = useAppStore();
  const [exportMode, setExportMode] = useState<'file' | 'database'>('file');
  const [pgConnections, setPgConnections] = useState<PgConnection[]>([]);
  const [selectedPgConn, setSelectedPgConn] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportDataType, setExportDataType] = useState<'kpi' | 'tickets' | 'both'>('kpi');
  const [dbResult, setDbResult] = useState<{
    rowCount: number; success: boolean; error?: string;
  } | null>(null);

  // KPI file export mutation — DataSource-backed (server route / client-side
  // CSV assembly in relay mode), returns the raw blob. Driven via mutateAsync
  // from exportData so the file/both orchestration and the `exporting`
  // spinner semantics stay identical.
  const kpiFileExportMutation = useMutation({
    mutationFn: async (format: string) => {
      return getDataSource().exportKpiFile({
        issues: extractionResult?.issues || [],
        regions: region === 'all' ? [] : [region],
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        format,
      });
    },
  });

  // Database push mutation — POST /api/pg/export. Driven via mutateAsync from
  // handleDbPush so the dbResult/toast handling stays in one place.
  const dbPushMutation = useMutation({
    mutationFn: async (payload: {
      connection: PgConnection;
      issues: unknown[];
      exportDataType: 'kpi' | 'tickets' | 'both';
      holidays: { regions: string[] };
      dateFrom?: string;
      dateTo?: string;
    }) => {
      const res = await fetch('/api/pg/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
  });

  const handleQuickPull = (days: number) => {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(today.toISOString().split('T')[0]);
  };

  useEffect(() => {
    setPgConnections(localConfig.getPgConnections());
  }, []);

  const exportData = async (type: 'issues' | 'kpis', format: string) => {
    if (!extractionResult) return;
    if (type === 'issues') {
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(extractionResult.issues, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'jira-tickets-raw.json'; a.click();
        URL.revokeObjectURL(url);
        toast.success('Raw tickets JSON downloaded');
      } else {
        const issues = extractionResult.issues as any[];
        const headers = ['Key', 'Summary', 'Status', 'Priority', 'IssueType', 'Created', 'Resolved', 'Assignee'];
        const rows = [headers.join(',')];
        for (const i of issues) {
          const fields = i.fields || {};
          rows.push([
            i.key,
            `"${(fields.summary || '').replace(/"/g, '""')}"`,
            fields.status?.name || '',
            fields.priority?.name || '',
            fields.issuetype?.name || '',
            fields.created || '',
            fields.resolutiondate || '',
            fields.assignee?.displayName || ''
          ].join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'jira-tickets-raw.csv'; a.click();
        URL.revokeObjectURL(url);
        toast.success('Raw tickets CSV downloaded');
      }
    } else {
      const blob = await kpiFileExportMutation.mutateAsync(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `jira-kpi-export.${format}`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleFileExport = async (format: string) => {
    if (!extractionResult) { toast.error('No extracted data found. Please run Jira Extraction in the Extract tab first.'); return; }
    setExporting(true);

    if (exportDataType === 'both') {
      try {
        await exportData('issues', format);
        await exportData('kpis', format);
        toast.success('Export completed for both issues and metrics');
      } catch (err: any) {
        toast.error(`Export failed: ${err.message}`);
      }
      setExporting(false);
      return;
    }

    try {
      await exportData(exportDataType === 'tickets' ? 'issues' : 'kpis', format);
      toast.success('Export completed');
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    }
    setExporting(false);
  };

  const handleDbPush = async () => {
    if (!extractionResult) { toast.error('No extracted data found'); return; }
    if (!selectedPgConn) { toast.error('Select a target database'); return; }
    const conn = pgConnections.find(c => c.id === selectedPgConn);
    if (!conn) { toast.error('Selected database not found'); return; }

    setExporting(true); setDbResult(null);
    try {
      const data = await dbPushMutation.mutateAsync({
        connection: conn,
        issues: extractionResult.issues,
        exportDataType,
        holidays: { regions: region === 'all' ? [] : [region] },
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (data.success) {
        setDbResult({ rowCount: data.rowCount || 0, success: true });
        toast.success(`Successfully pushed ${data.rowCount} rows to ${conn.name}`);
      } else {
        setDbResult({ rowCount: 0, success: false, error: data.error });
        toast.error(data.error || 'Database push failed');
      }
    } catch { toast.error('Database push failed'); }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 ${runtimeFeatures.hasPgExport ? 'md:grid-cols-2' : ''} gap-6`}>
        <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'file' ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('file')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${exportMode === 'file' ? 'bg-emerald-600' : 'bg-gray-100 dark:bg-slate-800'}`}><FileSpreadsheet className={`h-5 w-5 ${exportMode === 'file' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} /></div>
              <div className="flex-1"><CardTitle className="text-base">File Export</CardTitle><CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">CSV / JSON download. Ad-hoc analysis, small datasets.</CardDescription></div>
              {exportMode === 'file' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            </div>
          </CardHeader>
        </Card>
        {runtimeFeatures.hasPgExport && (
          <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'database' ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('database')}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2.5 ${exportMode === 'database' ? 'bg-indigo-600' : 'bg-gray-100 dark:bg-slate-800'}`}><Database className={`h-5 w-5 ${exportMode === 'database' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} /></div>
                <div className="flex-1"><CardTitle className="text-base">Database Sync</CardTitle><CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">Manual push of results to external PostgreSQL / Supabase.</CardDescription></div>
                {exportMode === 'database' && <CheckCircle2 className="h-5 w-5 text-indigo-400" />}
              </div>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><Info className="h-4 w-4 text-slate-500 dark:text-slate-400" /><span className="text-sm font-medium text-slate-700 dark:text-slate-300">When to use which?</span></div>
          <div className={`grid grid-cols-1 ${runtimeFeatures.hasPgExport ? 'md:grid-cols-2' : ''} gap-4`}>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">CSV / JSON Export</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>Quick ad-hoc analysis</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>One-time Metabase imports</span></li>
              </ul>
            </div>
            {runtimeFeatures.hasPgExport && (
              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-500/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Database Sync (Manual)</p>
                <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" /><span>Manual DB-to-DB bridge</span></li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" /><span>Perfect for Metabase usage</span></li>
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-slate-500 dark:text-slate-400" /> Export Summary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Source Data</Label>
              <div className="h-10 flex items-center px-3 bg-gray-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                {extractionResult ? <div className="flex items-center gap-2 text-emerald-500"><CheckCircle2 className="h-4 w-4" /><span className="text-sm font-medium">{extractionResult.issues.length} Tickets Ready</span></div> : <div className="flex items-center gap-2 text-amber-500"><AlertTriangle className="h-4 w-4" /><span className="text-sm">Extract data first</span></div>}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between h-6">
                <Label>Period</Label>
                <div className="flex gap-1 no-print">
                  {[7, 14, 30, 60, 90, 180, 365].map((days) => (
                    <Button key={days} variant="ghost" size="sm" onClick={() => handleQuickPull(days)} className="h-6 px-2 text-[10px] text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10">{days}D</Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Input type="date" value={dateFrom || ''} onChange={(e) => setDateFrom(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full" />
                <Input type="date" value={dateTo || ''} onChange={(e) => setDateTo(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={region} onValueChange={setRegion}><SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10"><SelectValue /></SelectTrigger><SelectContent>{GERMAN_STATES.map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data to Export</Label>
            <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('kpi')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'kpi' ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-500 font-bold' : 'text-slate-500'}`}><Zap className="mr-1 h-3 w-3" />KPIs</Button>
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('tickets')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'tickets' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-400 font-bold' : 'text-slate-500'}`}><Ticket className="mr-1 h-3 w-3" />Raw</Button>
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('both')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'both' ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-500 font-bold' : 'text-slate-500'}`}><LayoutGrid className="mr-1 h-3 w-3" />Both</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          {exportMode === 'file' ? (
            <div className="flex gap-3">
              <Button onClick={() => handleFileExport('json')} disabled={exporting || !extractionResult} className="flex-1 bg-emerald-600 hover:bg-emerald-700">{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}Export JSON</Button>
              <Button onClick={() => handleFileExport('csv')} disabled={exporting || !extractionResult} variant="outline" className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700"><FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Target Database Backend</Label>
                <Select value={selectedPgConn} onValueChange={setSelectedPgConn}>
                  <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-500/20"><SelectValue placeholder="Select target database..." /></SelectTrigger>
                  <SelectContent>{pgConnections.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
                </Select>
                {pgConnections.length === 0 && <p className="text-[10px] text-amber-500">No PostgreSQL backends found. Add one in the Storage tab.</p>}
              </div>
              <Button onClick={handleDbPush} disabled={exporting || !extractionResult || !selectedPgConn} className="w-full bg-indigo-600 hover:bg-indigo-700">{exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pushing...</> : <><Database className="mr-2 h-4 w-4" />Push to Database</>}</Button>
            </div>
          )}
        </CardContent>
      </Card>
      {exportMode === 'database' && dbResult && (
        <Card className={dbResult?.success ? 'border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/5' : 'border-red-500/30 bg-red-50 dark:bg-red-500/5'}>
          <CardHeader className="pb-2"><CardTitle className={`flex items-center gap-2 text-sm ${dbResult?.success ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-400'}`}>{dbResult?.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {dbResult?.success ? 'Sync Successful' : 'Sync Failed'}</CardTitle></CardHeader>
          <CardContent><div className="flex items-center justify-between text-xs p-3 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-indigo-500/10"><div className="flex items-center gap-2"><HardDrive className="h-3.5 w-3.5 text-indigo-400" /><span className="text-slate-600 dark:text-slate-400">Rows Synchronized:</span></div><span className="font-bold text-indigo-600 dark:text-indigo-400">{dbResult?.rowCount}</span></div>{dbResult?.error && <p className="text-[10px] text-red-500 mt-2 p-2 bg-red-500/5 rounded border border-red-500/10">{dbResult.error}</p>}</CardContent>
        </Card>
      )}
    </div>
  );
}
