'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EyeOff, Zap, TrendingUp, CheckCircle2, Clock, Calendar, Target, AlertTriangle, BarChart3, Loader2, Download, Trash2, ChevronUp, ChevronDown, Settings, Pencil, Check, X as XIcon } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store/app-store';
import { KpiCalcResult, ChartConfig, JqlFilter } from '@/types/dashboard';
import { JqlFilterSettings } from './jql/JqlFilterSettings';
import { PluginInfoIcon } from './PluginInfoIcon';
import {
  transformForBarChart,
  transformForPieChart,
  transformForLineChart,
  getKpiOptions,
  isTimeSeriesPlugin,
  getRecommendedChartType,
  type KpiResult,
} from '@/lib/chart-data-utils';
import { AGE_CATEGORY_COLORS, BarChartRenderer } from './chart/BarChartRenderer';
import { LineChartRenderer } from './chart/LineChartRenderer';
import { AreaChartRenderer } from './chart/AreaChartRenderer';
import { PieChartRenderer } from './chart/PieChartRenderer';
import { ChartConfigControls } from './chart/ChartConfigControls';
import { useChartZoom } from './chart/chart-zoom';
import type { ChartLegendEntry } from './chart/chart-shared';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';

// ─── KPI Card (Single Widget) ────────────────────────────────────────────────
interface KpiCardProps {
  result: {
    name: string;
    value: number;
    unit: string;
    dimensions?: Record<string, string>;
    details?: Array<{ label: string; value: number | string; unit?: string }>;
    ticketKeys?: string[];
    comparison?: { value: number; change: number; label: string };
  };
  pluginId: string;
  onHide?: () => void;
  onClick?: () => void;
  // @MX:NOTE: Per-view custom widget title support
  customTitle?: string;
  onTitleChange?: (newTitle: string) => void;
}

/** Detail row shape used by the age-breakdown section of KpiCard. */
type KpiDetail = NonNullable<KpiCalcResult['results'][0]['details']>[number];

/** Format a detail value the way the age breakdown displays it. */
function formatDetailValue(detail: KpiDetail | undefined): number | string | undefined {
  if (typeof detail?.value === 'number' && detail.value % 1 !== 0) {
    return detail.value.toFixed(2);
  }
  return detail?.value;
}

// @MX:NOTE: Wrapped with React.memo to prevent unnecessary re-renders
// @MX:REASON: KpiCard is expensive due to chart rendering, only re-render when result changes
export const KpiCard = React.memo(function KpiCard({ result, pluginId, onHide, onClick, customTitle, onTitleChange }: KpiCardProps) {
  const { settings } = useAppStore();
  const alertConfig = settings?.alerts?.thresholds?.[pluginId];

  // @MX:NOTE: Expanded state for widget collapse/expand
  const [expanded, setExpanded] = useState(true);

  // @MX:NOTE: Inline title editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const displayTitle = customTitle || result.name;

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTitleDraft(displayTitle);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const handleCommitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== result.name) {
      onTitleChange?.(trimmed);
    } else if (!trimmed) {
      // Empty => revert to plugin default
      onTitleChange?.('');
    }
    setEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setEditingTitle(false);
  };


  const getAlertStatus = () => {
    if (!alertConfig) return null;
    const { warning, critical, operator } = alertConfig;

    // Short-circuit if thresholds are not valid numbers
    if (isNaN(warning) || isNaN(critical)) return null;

    const val = result.value;

    if (operator === '>') {
      if (val >= critical) return 'critical';
      if (val >= warning) return 'warning';
    } else {
      if (val <= critical) return 'critical';
      if (val <= warning) return 'warning';
    }
    return null;
  };

  const alertStatus = getAlertStatus();

  const getColor = () => {
    if (result.unit === '%') { if (result.value >= 80) return 'text-emerald-400'; if (result.value >= 50) return 'text-amber-400'; return 'text-red-400'; }
    if (result.unit === 'hours') { if (result.value <= 40) return 'text-emerald-400'; if (result.value <= 80) return 'text-amber-400'; return 'text-red-400'; }
    return 'text-blue-400';
  };

  const isClickable = !!onClick || (result.ticketKeys && result.ticketKeys.length > 0);

  const getIcon = () => {
    if (result.name.includes('Processing')) return <Clock className="h-5 w-5" />;
    if (result.name.includes('Working Days')) return <Calendar className="h-5 w-5" />;
    if (result.name.includes('SLA')) return <Target className="h-5 w-5" />;
    if (result.name.includes('Throughput')) return <TrendingUp className="h-5 w-5" />;
    if (result.name.includes('Resolution')) return <CheckCircle2 className="h-5 w-5" />;
    if (result.name.includes('Reassign')) return <AlertTriangle className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };

  const thisWeekDetail = result.details?.find((d: KpiDetail) => d.label === 'This Week');
  const lastWeekDetail = result.details?.find((d: KpiDetail) => d.label === '1 week old' || d.label === 'Previous Week');
  const existingDetail = result.details?.find((d: KpiDetail) => d.label === '2+ weeks old');

  return (
    <Card
      className={`border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700 transition-colors group relative ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1 mr-2" onClick={(e) => e.stopPropagation()}>
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitTitle();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                className="text-xs font-bold uppercase tracking-wider bg-transparent border-b border-blue-400 outline-none text-slate-700 dark:text-slate-200 w-full min-w-0"
                placeholder={result.name}
              />
              <button onClick={handleCommitTitle} className="text-emerald-500 hover:text-emerald-600 p-0.5 shrink-0" title="Confirm">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={handleCancelEdit} className="text-slate-400 hover:text-red-400 p-0.5 shrink-0" title="Cancel">
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group/title flex-1">
              <p className={`text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate ${isClickable ? 'group-hover:text-blue-500 group-hover:underline' : ''}`}>
                {displayTitle}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 shrink-0"
                title={expanded ? "Collapse" : "Expand"}
                aria-label={expanded ? "Collapse widget" : "Expand widget"}
              >
                {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              </button>
              {onTitleChange && (
                <button
                  onClick={handleStartEdit}
                  className="opacity-0 group-hover/title:opacity-100 text-slate-300 hover:text-blue-400 transition-opacity p-0.5 shrink-0"
                  title="Rename widget"
                  aria-label="Rename widget"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {alertStatus && (
              <TooltipProvider delayDuration={0}>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Badge className={`h-5 px-1.5 gap-1 animate-pulse border-none ${alertStatus === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-[10px] font-bold">{alertStatus.toUpperCase()}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="p-2 text-xs">
                    <p className="font-bold mb-1">Metric Alert Triggered</p>
                    <p>Current: <span className="font-mono">{result.value}{result.unit}</span></p>
                    <p>{alertStatus === 'critical' ? 'Critical' : 'Warning'} threshold: <span className="font-mono">{alertConfig.operator}{alertStatus === 'critical' ? alertConfig.critical : alertConfig.warning}</span></p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
            <Badge variant="outline" className="text-[10px] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800" title={pluginId}>
              {pluginId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </Badge>
            {onHide && (
              <button
                onClick={(e) => { e.stopPropagation(); onHide(); }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity p-0.5"
                title="Hide widget"
                aria-label="Hide widget"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-gray-100 dark:bg-slate-800/50">
                <div className={getColor()}>{getIcon()}</div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className={`text-3xl font-bold font-mono tracking-tight ${getColor()}`}>
                  {result.value % 1 !== 0 ? result.value.toFixed(2) : result.value}
                </p>
                {result.unit && <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{result.unit}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between mb-1">
              {result.ticketKeys && result.ticketKeys.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-400 border-none">
                  {result.ticketKeys.length} tickets
                </Badge>
              )}
            </div>
            {/* Weekly Breakdown Section - Age Categories */}
            {result.details && result.details.some((d: KpiDetail) =>
              ['This Week', '1 week old', '2+ weeks old', 'Previous Week'].includes(d.label)) && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-2">Age Breakdown</p>
                <div className="grid grid-cols-3 gap-2">
                  {thisWeekDetail && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.this_week }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">This Week</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {formatDetailValue(thisWeekDetail)}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                  {lastWeekDetail && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.last_week }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">1 Week</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {formatDetailValue(lastWeekDetail)}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                  {existingDetail && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.existing }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">2+ Weeks</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {formatDetailValue(existingDetail)}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.details && <><Separator className="my-3 bg-gray-100 dark:bg-slate-800" /><div className="space-y-1.5">{result.details.map((d: KpiDetail, i: number) => (<div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-400 dark:text-slate-500">{d.label}</span><span className="font-mono text-slate-700 dark:text-slate-300">{d.value}{d.unit ? ` ${d.unit}` : ''}</span></div>))}</div></>}
          </>
        )}
      </CardContent>
    </Card>
  );
});

// ─── Chart Card (Configurable Chart Component) ────────────────────────────────

interface ChartCardProps {
  config: ChartConfig;
  kpiResults: KpiCalcResult[];
  hiddenDimensions: string[];
  toggleDimension: (pluginId: string, value: string) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
  onClick: (keys: string[], title: string) => void;
  theme: 'light' | 'dark';
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  calculateWidgetJql?: (widgetId: string, jqlFilter: JqlFilter) => void | Promise<void>;
}

/** Pixel height per widget height setting. */
const CHART_HEIGHTS: Record<string, number> = {
  short: 150,  // 0.5x
  md: 300,     // 1x (default)
  tall: 600,   // 2x
  xtall: 1200, // 4x
};

export function ChartCard({ config, kpiResults, hiddenDimensions, toggleDimension, onRemove, onChange, onClick, theme, onMoveUp, onMoveDown, calculateWidgetJql }: ChartCardProps) {
  // The lib chart helpers are typed against the lib `KpiResult` shape; the
  // dashboard emits the structurally compatible `KpiCalcResult` shape (the
  // original code passed `any[]` here). Bridge once at the boundary.
  const libKpiResults = kpiResults as unknown as KpiResult[];
  const kpiOptions = useMemo(() => getKpiOptions(libKpiResults), [libKpiResults]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [jqlSettingsOpen, setJqlSettingsOpen] = useState(false);

  // @MX:NOTE: Expanded state from store (default to true if not set)
  const expanded = config.expanded !== false;
  const { toggleWidgetExpanded } = useAppStore();

  // @MX:NOTE: Inline chart title editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const displayTitle = config.customTitle || 'Chart Visualization';

  // Simple zoom state for time series charts (drag to zoom)
  const { zoomState, isZoomed, resetZoom, zoomMouseHandlers } = useChartZoom();

  const handleStartTitleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTitleDraft(displayTitle);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const handleCommitTitle = () => {
    const trimmed = titleDraft.trim();
    onChange(config.id, { ...config, customTitle: trimmed || undefined });
    setEditingTitle(false);
  };

  const handleCancelTitleEdit = () => {
    setEditingTitle(false);
  };


  // Get custom widget results and calculating state from store
  const { customWidgetResults, calculatingWidgets, dateFrom, dateTo, region, globalFilters, activeConnectionId, masterDatasetInfo, settings } = useAppStore();

  // Check if selected KPI is a time-series plugin
  const isTimeSeries = config.kpiId ? isTimeSeriesPlugin(config.kpiId) : false;

  // Helper function to get SLA target for current chart
  const getSlaTargetForChart = () => {
    if (!settings?.sla?.statusTargets || !config.kpiId) return null;

    const statusTargets = settings.sla.statusTargets;

    // Direct plugin ID match
    if (statusTargets[config.kpiId]) {
      return statusTargets[config.kpiId];
    }

    // Try to match by KPI name
    const kpi = kpiResults.find(k => k.pluginId === config.kpiId);
    if (kpi && kpi.results[0]) {
      const resultNameLower = kpi.results[0].name.toLowerCase();
      for (const [status, target] of Object.entries(statusTargets)) {
        if (status.toLowerCase() === resultNameLower ||
            resultNameLower.includes(status.toLowerCase()) ||
            status.toLowerCase().includes(resultNameLower)) {
          return target;
        }
      }
    }

    return null;
  };

  const slaTarget = getSlaTargetForChart();

  // Determine which results to use (custom or global)
  const effectiveResults = useMemo<KpiCalcResult[]>(() => {
    if (config.jqlFilter?.enabled && customWidgetResults[config.id]) {
      const entry = customWidgetResults[config.id];
      if (entry && entry.context) {
        const ctx = entry.context;
        // Verify calculation context matches exactly
        const isValid =
          ctx.query === config.jqlFilter.query &&
          ctx.mode === config.jqlFilter.mode &&
          ctx.dateFrom === dateFrom &&
          ctx.dateTo === dateTo &&
          ctx.region === region &&
          ctx.activeConnectionId === activeConnectionId &&
          ctx.issuesLength === masterDatasetInfo?.issues?.length &&
          JSON.stringify(ctx.globalFilters) === JSON.stringify((config.jqlFilter.enabled && config.jqlFilter.mode === 'override') ? undefined : globalFilters);

        if (isValid) {
          return entry.results;
        }
      } else if (Array.isArray(entry)) {
        // Fallback for transition phase if it's still an array
        return entry as KpiCalcResult[];
      }
    }
    return kpiResults;
  }, [
    config.jqlFilter,
    config.jqlFilter?.enabled,
    config.jqlFilter?.mode,
    config.jqlFilter?.query,
    customWidgetResults, // full record reference — re-runs when a new record is set in the store
    config.id,
    kpiResults,
    dateFrom,
    dateTo,
    region,
    globalFilters,
    activeConnectionId,
    masterDatasetInfo?.issues?.length
  ]);

  const effectiveChartType = useMemo(() => {
    if (isTimeSeries && (config.type === 'bar' || config.type === 'pie')) {
      return 'line';
    }
    return config.type;
  }, [isTimeSeries, config.type]);

  const selectedKpiData = useMemo(() => {
    if (!config.kpiId) return null;
    // The transform helpers are typed against the lib `KpiResult` shape; the
    // dashboard emits the structurally compatible `KpiCalcResult` shape.
    const results = effectiveResults as unknown as KpiResult[];
    switch (effectiveChartType) {
      case 'bar':  return transformForBarChart(results, config.kpiId);
      case 'pie':  return transformForPieChart(results, config.kpiId);
      case 'line':
      case 'area': return transformForLineChart(results, config.kpiId);
      default:     return [];
    }
  }, [config.kpiId, effectiveChartType, effectiveResults]);

  const handleLegendClick = (entry: ChartLegendEntry) => {
    const dimensionName = entry.id || entry.value;
    if (dimensionName) {
      toggleDimension(config.kpiId, dimensionName);
    }
  };

  const handleKpiChange = (kpiId: string) => {
    const recommendedType = getRecommendedChartType(libKpiResults, kpiId);
    onChange(config.id, { ...config, kpiId, type: recommendedType });
  };

  const handleJqlFilterSave = async (filter: JqlFilter) => {
    console.log('[ChartCard] Saving JQL filter for widget:', config.id, filter);

    // Trigger calculation if custom JQL is enabled
    if (filter.enabled && filter.query && calculateWidgetJql) {
      console.log('[ChartCard] Triggering calculation for widget:', config.id);
      try {
        await calculateWidgetJql(config.id, filter);
        onChange(config.id, { ...config, jqlFilter: filter });
      } catch (err) {
        console.error('[ChartCard] Failed to calculate custom JQL:', err);
        onChange(config.id, { ...config, jqlFilter: { enabled: false, query: '', mode: 'refine' } });
      }
    } else {
      onChange(config.id, { ...config, jqlFilter: filter });
    }
    setJqlSettingsOpen(false);
  };

  const isCalculating = calculatingWidgets.includes(config.id);
  const hasCustomFilter = config.jqlFilter?.enabled;

  const handleExportChart = useCallback(async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      // Wait for any animations to finish
      await new Promise(resolve => setTimeout(resolve, 500));

      // @MX:WARN: ref-based chart capture
      // @MX:REASON: capture depends on DOM element availability and size; hidden or non-rendered charts cannot be captured.
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        cacheBust: true,
        filter: (node: HTMLElement) => {
          if (node.getAttribute && node.getAttribute('data-export-ignore') === 'true') {
            return false;
          }
          return true;
        },
        style: {
          borderRadius: '0'
        }
      });

      const link = document.createElement('a');
      const kpiName = kpiResults.find(k => k.pluginId === config.kpiId)?.results[0]?.name || 'kpi-chart';
      link.download = `${kpiName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Chart exported as PNG');
    } catch (err) {
      console.error('Failed to export chart:', err);
      toast.error('Failed to export chart');
    } finally {
      setExporting(false);
    }
  }, [theme, kpiResults, config.kpiId]);

  const renderChart = () => {
    if (!config.kpiId || !selectedKpiData || selectedKpiData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a KPI to visualize</p>
          </div>
        </div>
      );
    }

    // Dynamic height based on height setting
    const chartHeight = CHART_HEIGHTS[config.height] || 300;

    // @MX:NOTE: Use effectiveResults (not kpiResults) so multi-series paths also reflect the custom JQL filter
    const kpi = effectiveResults.find((k) => k.pluginId === config.kpiId);
    const unit = kpi?.results?.[0]?.unit || '';
    const seriesResults = kpi?.results ?? [];

    const rendererProps = {
      kpiId: config.kpiId,
      configType: config.type,
      data: selectedKpiData,
      seriesResults,
      unit,
      chartHeight,
      theme,
      hiddenDimensions,
      onLegendClick: handleLegendClick,
      onDrillDown: onClick,
      slaTarget,
    };

    let chart: React.ReactElement;
    switch (effectiveChartType) {
      case 'bar':
        chart = <BarChartRenderer {...rendererProps} />;
        break;
      case 'line':
        chart = <LineChartRenderer {...rendererProps} zoomState={zoomState} zoomMouseHandlers={zoomMouseHandlers} />;
        break;
      case 'area':
        chart = <AreaChartRenderer {...rendererProps} zoomState={zoomState} zoomMouseHandlers={zoomMouseHandlers} />;
        break;
      case 'pie':
        chart = <PieChartRenderer {...rendererProps} />;
        break;
      default:
        return null;
    }

    // Each renderer wraps its recharts chart in a ResponsiveContainer (so the
    // chart receives injected width/height), matching the original branches.
    return chart;
  };

  return (
    <Card
      id={`chart-card-${config.id}`}
      ref={chartRef}
      className={`${hasCustomFilter ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-100 dark:ring-blue-500/20' : 'border-slate-200 dark:border-slate-800'} bg-white dark:bg-slate-900/50`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${isTimeSeries ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-emerald-100 dark:bg-emerald-500/10'}`}>
              <BarChart3 className={`h-5 w-5 ${isTimeSeries ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div className="flex items-center gap-2">
              {editingTitle ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitTitle();
                      if (e.key === 'Escape') handleCancelTitleEdit();
                    }}
                    className="text-lg font-semibold bg-transparent border-b border-blue-400 outline-none text-slate-800 dark:text-slate-100 min-w-[120px]"
                    placeholder="Chart Visualization"
                    data-export-ignore="true"
                  />
                  <button onClick={handleCommitTitle} className="text-emerald-500 hover:text-emerald-600 p-0.5" title="Confirm" data-export-ignore="true">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={handleCancelTitleEdit} className="text-slate-400 hover:text-red-400 p-0.5" title="Cancel" data-export-ignore="true">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0 group/charttitle">
                  <CardTitle className="text-lg truncate">{displayTitle}</CardTitle>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWidgetExpanded(config.id); }}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 shrink-0"
                    title={expanded ? "Collapse" : "Expand"}
                    aria-label={expanded ? "Collapse chart" : "Expand chart"}
                    data-export-ignore="true"
                  >
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={handleStartTitleEdit}
                    className="opacity-0 group-hover/charttitle:opacity-100 text-slate-300 hover:text-blue-400 transition-opacity p-0.5"
                    title="Rename chart"
                    aria-label="Rename chart"
                    data-export-ignore="true"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <PluginInfoIcon pluginId={config.kpiId} />
                </div>
              )}
              {isTimeSeries && (
                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30">
                  📈 Trend
                </Badge>
              )}
              {hasCustomFilter && (
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
                        🔍 Custom Filter
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-xs">{config.jqlFilter.query || 'No filter set'}</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Zoom control for time-series charts */}
            {isTimeSeries && isZoomed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetZoom}
                data-export-ignore="true"
                className="text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-500/10 h-8 px-2 text-xs"
                aria-label="Reset zoom"
                title="Reset zoom to show all data"
              >
                ↺ Reset Zoom
              </Button>
            )}
            {config.kpiId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportChart}
                disabled={exporting}
                data-export-ignore="true"
                className="text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                aria-label="Export chart as PNG"
                title="Export chart as PNG"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
            )}
            <div className="flex items-center border-l border-slate-100 dark:border-slate-800 ml-1 pl-1">
              {onMoveUp && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMoveUp(config.id)}
                  data-export-ignore="true"
                  className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 h-8 w-8 p-0"
                  aria-label="Move chart up"
                  title="Move chart up"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
              )}
              {onMoveDown && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMoveDown(config.id)}
                  data-export-ignore="true"
                  className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 h-8 w-8 p-0"
                  aria-label="Move chart down"
                  title="Move chart down"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Popover open={jqlSettingsOpen} onOpenChange={setJqlSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-export-ignore="true"
                  className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 h-8 w-8 p-0 border border-indigo-200 dark:border-indigo-500/30"
                  aria-label="JQL filter settings"
                  title="Configure JQL filter for this chart"
                >
                  {isCalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[400px] p-0 z-[100]" onPointerDownOutside={(e) => {
                // @MX:NOTE: Outside-click closing stays blocked to prevent accidental loss of
                // unsaved filter edits; the popover provides a visible Cancel button instead.
                console.log('[ChartCard] Popover onPointerDownOutside - preventing default');
                e.preventDefault();
              }}>
                <JqlFilterSettings
                  widgetId={config.id}
                  widgetType="chart"
                  currentFilter={config.jqlFilter || { enabled: false, query: '', mode: 'refine' }}
                  onSave={handleJqlFilterSave}
                  onCancel={() => {
                    console.log('[ChartCard] JqlFilterSettings onCancel');
                    setJqlSettingsOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(config.id)}
              data-export-ignore="true"
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              aria-label="Remove chart"
              title="Remove chart"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent className="space-y-4">
          {/* Inline Controls */}
          <ChartConfigControls
            config={config}
            kpiOptions={kpiOptions}
            effectiveChartType={effectiveChartType}
            isTimeSeries={isTimeSeries}
            onKpiChange={handleKpiChange}
            onChange={onChange}
          />

        {/* Chart Area */}
        <div className="mt-4">{renderChart()}</div>
        </CardContent>
      ) : null}
    </Card>
  );
}
