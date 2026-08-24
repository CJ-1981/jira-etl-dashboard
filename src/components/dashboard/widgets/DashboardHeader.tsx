'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle, Calendar, Database, Download, RefreshCw, Sliders,
} from 'lucide-react';
import { ViewManager } from '../ViewManager';
import { KpiFilterPanel } from '../KpiFilterPanel';

/** Master-dataset inventory info shown in the header badge. */
export interface DashboardHeaderDatasetInfo {
  dateRange?: { from: string; to: string };
  totalExtracted: number;
  lastUpdated: string;
}

/** Period-analysis truncation details for the warning badge/tooltip. */
export interface DashboardHeaderPeriodAnalysis {
  requiresTruncation: boolean;
  availableStartDate: Date | null;
}

export interface DashboardHeaderProps {
  masterDatasetInfo: DashboardHeaderDatasetInfo | null;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  periodAnalysis: DashboardHeaderPeriodAnalysis;
  /** Preset selection; receives the computed from/to dates and the label. */
  onSelectPreset: (label: string, fromStr: string, toStr: string) => void;
  calculating: boolean;
  onRecalculate: () => void;
  onPrint: () => void;
  globalFilters: Record<string, string[]>;
  filterPanelOpen: boolean;
  onToggleFilterPanel: () => void;
  // ── KpiFilterPanel pass-through props (rendered when the panel is open) ──
  filterPanel: React.ComponentProps<typeof KpiFilterPanel>;
}

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
  { label: '180D', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'MAX', days: 0 },
];

/**
 * Dashboard header card: KPI Analytics title, dataset inventory badge,
 * Filters/Print controls, the analysis-period inputs with quick presets and
 * the collapsible KpiFilterPanel. Pure presentational — all state changes go
 * through callbacks owned by KpiDashboard.
 */
export function DashboardHeader({
  masterDatasetInfo,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  periodAnalysis,
  onSelectPreset,
  calculating,
  onRecalculate,
  onPrint,
  globalFilters,
  filterPanelOpen,
  onToggleFilterPanel,
  filterPanel,
}: DashboardHeaderProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm overflow-visible">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-blue-600 dark:from-emerald-400 dark:to-blue-400">
                KPI Analytics
              </CardTitle>
              <div className="flex items-center gap-1 no-print">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRecalculate}
                  disabled={calculating}
                  className="h-6 px-2 text-[10px] text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 gap-1 rounded-md"
                >
                  <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                  Recalculate
                </Button>
                <ViewManager />
              </div>
            </div>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Detailed performance metrics based on the master dataset
            </CardDescription>
            {masterDatasetInfo && (
              <div className="mt-3 flex w-fit items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-full">
                <Database className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">
                  {masterDatasetInfo.dateRange?.from ? (
                    <>Data Inventory: {new Date(masterDatasetInfo.dateRange.from).toLocaleDateString()} — {new Date(masterDatasetInfo.dateRange.to || Date.now()).toLocaleDateString()}</>
                  ) : (
                    <>Data Inventory: Range Unspecified</>
                  )}
                </span>
                <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400/80 border-l border-blue-200 dark:border-blue-500/30 pl-2 ml-1">
                  {/* @MX:NOTE: lastUpdated can be absent/invalid (empty master
                      dataset responses omit it) — guard before formatting. */}
                  {masterDatasetInfo.totalExtracted.toLocaleString()} tickets
                  {masterDatasetInfo.lastUpdated && !isNaN(new Date(masterDatasetInfo.lastUpdated).getTime()) && (
                    <> • Updated {new Date(masterDatasetInfo.lastUpdated).toLocaleString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}</>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFilterPanel}
              className={`h-9 border-slate-200 dark:border-slate-700 transition-all ${filterPanelOpen ? 'bg-slate-100 dark:bg-slate-800 ring-2 ring-emerald-500/20' : ''}`}
            >
              <Sliders className={`h-4 w-4 mr-2 ${Object.keys(globalFilters).length > 0 ? 'text-emerald-500' : ''}`} />
              Filters
              {Object.keys(globalFilters).length > 0 && (
                <Badge className="ml-2 bg-emerald-500 hover:bg-emerald-600 border-none h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px]">
                  {Object.values(globalFilters).flat().length}
                </Badge>
              )}
            </Button>
            <Separator orientation="vertical" className="h-6 bg-slate-200 dark:bg-slate-800 hidden md:block" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10 no-print"
              onClick={onPrint}
            >
              <Download className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent data-period-section>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Analysis Period</Label>
              {periodAnalysis.requiresTruncation && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-4 py-0 text-[9px] border-amber-500/30 text-amber-500 gap-1 animate-pulse cursor-help">
                      <AlertTriangle className="h-2.5 w-2.5" /> Data Truncated
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs p-3 shadow-lg border-amber-200 dark:border-amber-800">
                    <p className="text-xs">
                      Your selected analysis starts on <strong className="text-amber-600 dark:text-amber-400">{new Date(dateFrom).toLocaleDateString()}</strong>, but your local dataset only contains data from <strong className="text-amber-600 dark:text-amber-400">{periodAnalysis.availableStartDate ? new Date(periodAnalysis.availableStartDate).toLocaleDateString() : 'N/A'}</strong> onwards.<br /><br />
                      The charts and metrics will still render, but will only reflect the available data.
                    </p>
                  </TooltipContent>
                </UITooltip>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 no-print">
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <Input
                      type="date"
                      value={dateFrom || ''}
                      onChange={(e) => onDateFromChange(e.target.value)}
                      className="h-9 pl-9 bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-xs w-[140px] focus:ring-emerald-500/20"
                    />
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">to</span>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <Input
                      type="date"
                      value={dateTo || ''}
                      onChange={(e) => onDateToChange(e.target.value)}
                      className="h-9 pl-9 bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-xs w-[140px] focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-[300px]">
            <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2 block">Quick Presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                const targetStart = new Date(today);
                targetStart.setDate(today.getDate() - p.days);
                targetStart.setHours(0, 0, 0, 0);

                const masterStart = masterDatasetInfo?.dateRange?.from ? new Date(masterDatasetInfo.dateRange.from) : null;
                // Safely handle masterEnd - use Date.now() if 'to' is missing or invalid
                let masterEnd: Date | null = null;
                if (masterDatasetInfo?.dateRange?.to) {
                  try {
                    const parsedEnd = new Date(masterDatasetInfo.dateRange.to);
                    if (!isNaN(parsedEnd.getTime())) {
                      masterEnd = parsedEnd;
                    }
                  } catch {
                    // Invalid date, will use null
                  }
                }

                const masterStartNormalized = masterStart ? new Date(masterStart) : null;
                const masterEndNormalized = masterEnd ? new Date(masterEnd) : null;
                if (masterStartNormalized) masterStartNormalized.setHours(0, 0, 0, 0);
                if (masterEndNormalized) masterEndNormalized.setHours(23, 59, 59, 999);

                const isAvailable = p.label === 'MAX' ? !!masterStartNormalized : (!masterStartNormalized || targetStart >= masterStartNormalized);

                const todayStr = today.toISOString().split('T')[0];
                const startStr = targetStart.toISOString().split('T')[0];
                const maxEndStr = masterEndNormalized ? masterEndNormalized.toISOString().split('T')[0] : todayStr;

                // Check if MAX should be active (must match both start AND end dates)
                const isMaxActive = masterStart && dateFrom === new Date(masterStart).toISOString().split('T')[0] && dateTo === maxEndStr;

                const isActive = p.label === 'MAX'
                  ? isMaxActive
                  : !isMaxActive && dateTo === todayStr && dateFrom === startStr;

                return (
                  <Button
                    key={p.label}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      // Skip if already active to prevent unnecessary recalculation
                      if (isActive) return;

                      if (p.label === 'MAX' && masterDatasetInfo?.dateRange) {
                        const fromStr = new Date(masterDatasetInfo.dateRange.from).toISOString().split('T')[0];
                        onSelectPreset(p.label, fromStr, maxEndStr);
                      } else {
                        onSelectPreset(p.label, startStr, todayStr);
                      }
                    }}
                    className={`h-8 px-3 text-[10px] font-bold transition-all ${isActive
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 border-transparent'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-emerald-500 hover:border-emerald-500/50 bg-transparent'
                      } ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!isAvailable}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {filterPanelOpen && (
          <KpiFilterPanel {...filterPanel} />
        )}
      </CardContent>
    </Card>
  );
}
