'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ReferenceLine, ReferenceArea
} from 'recharts';
import { EyeOff, Edit2, Zap, TrendingUp, CheckCircle2, Clock, Calendar, Target, AlertTriangle, BarChart3, Loader2, Download, Trash2, ChevronUp, ChevronDown, Settings, Pencil, Check, X as XIcon } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AppSettings } from '@/lib/config/local-store';
import { useAppStore } from '@/store/app-store';
import { KpiCalcResult, ChartConfig } from '@/types/dashboard';
import { JqlFilterSettings } from './jql/JqlFilterSettings';
import {
  transformForBarChart,
  transformForPieChart,
  transformForLineChart,
  formatChartValue,
  CHART_COLORS,
  getKpiOptions,
  isTimeSeriesPlugin,
  getRecommendedChartType
} from '@/lib/chart-data-utils';

// @MX:NOTE: Age category colors for open tickets visualization
// Green (fresh) → Orange (aging) → Red (stale)
const AGE_CATEGORY_COLORS = {
  'this_week': '#22c55e',    // green-500
  'last_week': '#f59e0b',    // amber-500
  'existing': '#ef4444',     // red-500
} as const;
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectValue,
} from '@/components/ui/select';

// ─── KPI Card (Single Widget) ────────────────────────────────────────────────
export function KpiCard({ result, pluginId, onHide, onClick, customTitle, onTitleChange }: {
  result: {
    name: string;
    value: number;
    unit: string;
    dimensions?: any;
    details?: any[];
    ticketKeys?: string[];
    comparison?: { value: number; change: number; label: string };
  };
  pluginId: string;
  onHide?: () => void;
  onClick?: () => void;
  // @MX:NOTE: Per-view custom widget title support
  customTitle?: string;
  onTitleChange?: (newTitle: string) => void;
}) {
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

  // Helper function to get SLA target for current plugin
  const getSlaTarget = () => {
    if (!settings?.sla?.statusTargets || !pluginId) return null;

    // Try to match plugin ID or result name with status targets
    const statusTargets = settings.sla.statusTargets;

    // Direct plugin ID match
    if (statusTargets[pluginId]) {
      return statusTargets[pluginId];
    }

    // Try to match by result name (handle cases like "In Progress", "Done", etc.)
    const resultNameLower = result.name.toLowerCase();
    for (const [status, target] of Object.entries(statusTargets)) {
      if (status.toLowerCase() === resultNameLower ||
          resultNameLower.includes(status.toLowerCase()) ||
          status.toLowerCase().includes(resultNameLower)) {
        return target;
      }
    }

    return null;
  };

  const slaTarget = getSlaTarget();

  const getIcon = () => {
    if (result.name.includes('Processing')) return <Clock className="h-5 w-5" />;
    if (result.name.includes('Working Days')) return <Calendar className="h-5 w-5" />;
    if (result.name.includes('SLA')) return <Target className="h-5 w-5" />;
    if (result.name.includes('Throughput')) return <TrendingUp className="h-5 w-5" />;
    if (result.name.includes('Resolution')) return <CheckCircle2 className="h-5 w-5" />;
    if (result.name.includes('Reassign')) return <AlertTriangle className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };
  const getColor = () => {
    if (result.unit === '%') { if (result.value >= 80) return 'text-emerald-400'; if (result.value >= 50) return 'text-amber-400'; return 'text-red-400'; }
    if (result.unit === 'hours') { if (result.value <= 40) return 'text-emerald-400'; if (result.value <= 80) return 'text-amber-400'; return 'text-red-400'; }
    return 'text-blue-400';
  };

  const isClickable = !!onClick || (result.ticketKeys && result.ticketKeys.length > 0);

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
            {result.details && result.details.some((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) =>
              ['This Week', '1 week old', '2+ weeks old', 'Previous Week'].includes(d.label)) && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-2">Age Breakdown</p>
                <div className="grid grid-cols-3 gap-2">
                  {result.details.find((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => d.label === 'This Week') && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.this_week }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">This Week</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {(() => {
                          const d = result.details.find((det: any) => det.label === 'This Week');
                          return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                        })()}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                  {result.details.find((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => d.label === '1 week old' || d.label === 'Previous Week') && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.last_week }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">1 Week</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {(() => {
                          const d = result.details.find((det: any) => det.label === '1 week old' || det.label === 'Previous Week');
                          return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                        })()}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                  {result.details.find((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => d.label === '2+ weeks old') && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGE_CATEGORY_COLORS.existing }} />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">2+ Weeks</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {(() => {
                          const d = result.details.find((det: any) => det.label === '2+ weeks old');
                          return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                        })()}
                        <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.details && <><Separator className="my-3 bg-gray-100 dark:bg-slate-800" /><div className="space-y-1.5">{result.details.map((d: any, i: number) => (<div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-400 dark:text-slate-500">{d.label}</span><span className="font-mono text-slate-700 dark:text-slate-300">{d.value}{d.unit ? ` ${d.unit}` : ''}</span></div>))}</div></>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chart Card (Configurable Chart Component) ────────────────────────────────

interface ChartCardProps {
  config: ChartConfig;
  kpiResults: any[];
  hiddenDimensions: Set<string>;
  toggleDimension: (pluginId: string, value: string) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
  onClick: (keys: string[], title: string) => void;
  theme: 'light' | 'dark';
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  calculateWidgetJql?: (widgetId: string, jqlFilter: any) => void;
}

export function ChartCard({ config, kpiResults, hiddenDimensions, toggleDimension, onRemove, onChange, onClick, theme, onMoveUp, onMoveDown, calculateWidgetJql }: ChartCardProps) {
  const kpiOptions = useMemo(() => getKpiOptions(kpiResults), [kpiResults]);
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
  const [zoomState, setZoomState] = useState<{
    leftIndex: number | null;
    rightIndex: number | null;
    refAreaLeft: number | undefined;
    refAreaRight: number | undefined;
  }>({
    leftIndex: null,
    rightIndex: null,
    refAreaLeft: undefined,
    refAreaRight: undefined,
  });

  const resetZoom = useCallback(() => {
    setZoomState({
      leftIndex: null,
      rightIndex: null,
      refAreaLeft: undefined,
      refAreaRight: undefined,
    });
  }, []);

  const handleZoom = useCallback(() => {
    setZoomState(prev => {
      const { refAreaLeft, refAreaRight } = prev;

      if (refAreaLeft === undefined || refAreaRight === undefined || refAreaLeft === refAreaRight) {
        return {
          ...prev,
          refAreaLeft: undefined,
          refAreaRight: undefined,
        };
      }

      // Ensure left < right
      let leftIndex = Math.min(refAreaLeft, refAreaRight);
      let rightIndex = Math.max(refAreaLeft, refAreaRight);

      return {
        ...prev,
        refAreaLeft: undefined,
        refAreaRight: undefined,
        leftIndex,
        rightIndex,
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: any) => {
    if (e && e.activeTooltipIndex !== undefined) {
      setZoomState(prev => ({
        ...prev,
        refAreaLeft: e.activeTooltipIndex,
      }));
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (e && e.activeTooltipIndex !== undefined) {
      setZoomState(prev => {
        if (prev.refAreaLeft !== undefined) {
          return { ...prev, refAreaRight: e.activeTooltipIndex };
        }
        return prev;
      });
    }
  }, []);

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
  const effectiveResults = useMemo(() => {
    if (config.jqlFilter?.enabled && customWidgetResults.has(config.id)) {
      const entry = customWidgetResults.get(config.id) as any;
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
        return entry;
      }
    }
    return kpiResults;
  }, [
    config.jqlFilter,
    config.jqlFilter?.enabled,
    config.jqlFilter?.mode,
    config.jqlFilter?.query,
    customWidgetResults, // full Map reference — re-runs when a new Map is set in the store
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
    switch (effectiveChartType) {
      case 'bar':  return transformForBarChart(effectiveResults, config.kpiId);
      case 'pie':  return transformForPieChart(effectiveResults, config.kpiId);
      case 'line':
      case 'area': return transformForLineChart(effectiveResults, config.kpiId);
      default:     return [];
    }
  }, [config.kpiId, effectiveChartType, effectiveResults]);

  const handleLegendClick = (e: any) => {
    const dimensionName = e.id || e.value;
    if (dimensionName) {
      toggleDimension(config.kpiId, dimensionName);
    }
  };

  const handleKpiChange = (kpiId: string) => {
    const recommendedType = getRecommendedChartType(kpiResults, kpiId);
    onChange(config.id, { ...config, kpiId, type: recommendedType });
  };

  const handleJqlFilterSave = async (filter: any) => {
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

  const isCalculating = calculatingWidgets.has(config.id);
  const hasCustomFilter = config.jqlFilter?.enabled;

  const handleExportChart = async () => {
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
        filter: (node: any) => {
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
  };

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
    const chartHeight = {
      short: 150,  // 0.5x
      md: 300,     // 1x (default)
      tall: 600,   // 2x
      xtall: 1200, // 4x
    }[config.height] || 300;

    // @MX:NOTE: Use effectiveResults (not kpiResults) so multi-series paths also reflect the custom JQL filter
    const kpi = effectiveResults.find((k) => k.pluginId === config.kpiId);
    const unit = kpi?.results?.[0]?.unit || '';

    // Custom tooltip content for line/area charts
    const CustomLineAreaTooltip = ({ active, payload }: any) => {
      if (!active || !payload || !payload.length) return null;

      let orderedPayload = payload;

      // For area charts, reverse the payload to match visual stacking (top to bottom)
      if (config.type === 'area') {
        orderedPayload = [...payload].reverse();
      }
      // For line charts, sort by Y value to match visual position (top to bottom)
      else if (config.type === 'line') {
        orderedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);
      }

      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{payload[0].payload.name}</p>
          {orderedPayload.map((entry: any, index: number) => {
            // Skip zero values
            if (entry.value === 0 || entry.value === undefined || entry.value === null) return null;

            let color = '#3b82f6'; // default blue for single series

            // Get series index from dataKey (series0, series1, etc.) for multi-series charts
            if (entry.dataKey.startsWith('series')) {
              const seriesMatch = entry.dataKey.match(/series(\d+)/);
              const seriesIndex = seriesMatch ? parseInt(seriesMatch[1]) : 0;
              color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
            }

            return (
              <div key={index} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-slate-600 dark:text-slate-400">{entry.name}</span>
                </div>
                <span className="font-mono text-slate-700 dark:text-slate-300">{formatChartValue(entry.value, unit)}</span>
              </div>
            );
          })}
        </div>
      );
    };

    // Custom tooltip content for bar charts
    const CustomBarTooltip = ({ active, payload }: any) => {
      if (!active || !payload || !payload.length) return null;

      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{payload[0].payload.name}</p>
          {payload.map((entry: any, index: number) => {
            // Skip zero values
            if (entry.value === 0 || entry.value === undefined || entry.value === null) return null;

            // Get color from payload or use default
            let color = entry.color || '#3b82f6';

            return (
              <div key={index} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-slate-600 dark:text-slate-400">{entry.name}</span>
                </div>
                <span className="font-mono text-slate-700 dark:text-slate-300">{formatChartValue(entry.value, entry.payload?.unit || unit)}</span>
              </div>
            );
          })}
        </div>
      );
    };

    // Custom tooltip content for pie charts
    const CustomPieTooltip = ({ active, payload }: any) => {
      if (!active || !payload) return null;

      const entry = payload[0];
      if (!entry) return null;

      // Skip zero values
      if (entry.value === 0 || entry.value === undefined || entry.value === null) return null;

      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{entry.name}</p>
          <div className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload?.fill || '#3b82f6' }} />
              <span className="text-slate-600 dark:text-slate-400">Value</span>
            </div>
            <span className="font-mono text-slate-700 dark:text-slate-300">{formatChartValue(entry.value, entry.payload?.unit || unit)}</span>
          </div>
        </div>
      );
    };

    const tooltipStyle = {
      contentStyle: {
        backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        border: theme === 'dark' ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: '8px',
      },
      labelStyle: { color: theme === 'dark' ? '#e2e8f0' : '#1e293b' },
      itemStyle: { color: theme === 'dark' ? '#e2e8f0' : '#1e293b' },
    };

    const renderLegend = (value: any) => {
      const isHidden = hiddenDimensions.has(`${config.kpiId}|${value}`);
      return (
        <span 
          className={`
            text-[10px] font-medium transition-all cursor-pointer select-none
            hover:text-blue-500 hover:underline
            ${isHidden ? 'opacity-30 line-through text-slate-500' : 'text-slate-700 dark:text-slate-300'}
          `}
        >
          {value}
        </span>
      );
    };

    switch (effectiveChartType) {
      case 'bar': {
        const hasMultipleSeriesBar = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every((r: KpiCalcResult['results'][0]) => r.timeSeries && r.timeSeries.length > 0);

        // @MX:NOTE: Multi-series bar chart merging logic
        if (hasMultipleSeriesBar) {
          const allPeriods = new Set<string>();
          kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
            result.timeSeries?.forEach((point: any) => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            let isComplete = true;
            kpi.results.forEach((result: KpiCalcResult['results'][0], idx: number) => {
              const point = result.timeSeries?.find((p: any) => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
              dataPoint[`ticketKeys${idx}`] = (point as any)?.ticketKeys || [];
              if (point && point.isComplete === false) isComplete = false;
            });
            dataPoint.isComplete = isComplete;
            return dataPoint;
          });

          // @MX:ANCHOR: Bar Chart Rendering
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
                <YAxis className="text-xs" />
                <Tooltip
                  {...tooltipStyle}
                  content={<CustomLineAreaTooltip />}
                />
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend} 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => (
                  <Bar
                    key={result.name || idx}
                    dataKey={`series${idx}`}
                    name={result.name}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    hide={hiddenDimensions.has(`${config.kpiId}|${result.name}`)}
                    cursor="pointer"
                    onClick={(data) => {
                      const keys = data[`ticketKeys${idx}`] || data.ticketKeys;
                      if (keys && keys.length > 0) {
                        onClick(keys, `${result.name} - ${data.name}`);
                      }
                    }}
                  >
                    {mergedData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        fillOpacity={entry.isComplete === false ? 0.4 : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        }

        const visibleBarData = selectedKpiData.filter(d => !hiddenDimensions.has(`${config.kpiId}|${d.name}`));
        // Check for age breakdown layers in data (thisWeek, prevWeek, existing fields)
        // OR check if the KPI results contain age breakdown patterns
        const hasAgeBreakdownInResults = kpi?.results?.some((r: any) =>
          r.dimensions?.ageCategory ||
          r.name?.includes('(Existing)') ||
          r.name?.includes('(Last Week)') ||
          r.name?.includes('(This Week)') ||
          r.details?.some((d: any) => ['This Week', '1 week old', '2+ weeks old'].includes(d.label))
        );

        // @MX:NOTE: Check for age breakdown fields regardless of values (even zeros should render layers)
        // @MX:REASON: hasWeeklyLayers determines which rendering path to use; should be based on structure, not content
        const hasWeeklyLayers = hasAgeBreakdownInResults || visibleBarData.some(d =>
          d.thisWeek !== undefined ||
          d.prevWeek !== undefined ||
          d.existing !== undefined
        );

        // Debug logging
        if (process.env.NODE_ENV === 'development' && config.kpiId?.includes('open_tickets_by')) {
          console.log('[ChartCard] Bar rendering debug:', {
            kpiId: config.kpiId,
            hasAgeBreakdownInResults,
            hasWeeklyLayers,
            kpiResults: kpi?.results?.length,
            visibleBarData: visibleBarData.length,
            sampleData: visibleBarData[0],
            allDataFields: visibleBarData.map(d => ({
              name: d.name,
              thisWeek: d.thisWeek,
              prevWeek: d.prevWeek,
              existing: d.existing,
              totalValue: d.value
            })),
            rawDataStructure: visibleBarData.map(d => ({
              keys: Object.keys(d),
              values: Object.values(d)
            })),
            hiddenDimensions: Array.from(hiddenDimensions),
            shouldRenderStandardBar: !hasWeeklyLayers,
            shouldRenderAgeBreakdownBars: hasWeeklyLayers
          });
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={visibleBarData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                content={<CustomBarTooltip />}
              />
              {(hasWeeklyLayers || selectedKpiData.length > 1) && (
                <Legend
                  onClick={handleLegendClick}
                  cursor="pointer"
                  formatter={renderLegend}
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                  payload={[
                    // Age breakdown legends FIRST (at the beginning)
                    ...(hasWeeklyLayers ? [
                      {
                        value: 'This Week',
                        type: 'rect' as any,
                        id: 'This Week',
                        color: AGE_CATEGORY_COLORS.this_week
                      },
                      {
                        value: '1 week old',
                        type: 'rect' as any,
                        id: '1 week old',
                        color: AGE_CATEGORY_COLORS.last_week
                      },
                      {
                        value: '2+ weeks old',
                        type: 'rect' as any,
                        id: '2+ weeks old',
                        color: AGE_CATEGORY_COLORS.existing
                      }
                    ] : []),
                    // THEN data legends (assignee names, priorities, statuses)
                    ...selectedKpiData.map((d, idx) => ({
                      value: d.name,
                      type: 'rect' as any,
                      id: d.name,
                      color: d.fill || CHART_COLORS[idx % CHART_COLORS.length]
                    }))
                  ]}
                />
              )}
              {/* @MX:ANCHOR: Bar Chart (Standard) */}
              {!hasWeeklyLayers && (
                <Bar
                  dataKey="value"
                  name="Total Period"
                  fill="#3b82f6"
                  hide={hiddenDimensions.has(`${config.kpiId}|Total Period`)}
                  cursor="pointer"
                  onClick={(data) => {
                    if (data && data.ticketKeys) {
                      onClick(data.ticketKeys, data.name || 'Total Period');
                    }
                  }}
                />
              )}
              {hasWeeklyLayers && (
                <>
                  <Bar
                    dataKey="thisWeek"
                    name="This Week"
                    fill={AGE_CATEGORY_COLORS.this_week}
                    stackId="ageBreakdown"
                    hide={hiddenDimensions.has(`${config.kpiId}|This Week`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "This Week");
                      }
                    }}
                  />
                  <Bar
                    dataKey="prevWeek"
                    name="1 week old"
                    fill={AGE_CATEGORY_COLORS.last_week}
                    stackId="ageBreakdown"
                    hide={hiddenDimensions.has(`${config.kpiId}|1 week old`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "1 week old");
                      }
                    }}
                  />
                  <Bar
                    dataKey="existing"
                    name="2+ weeks old"
                    fill={AGE_CATEGORY_COLORS.existing}
                    stackId="ageBreakdown"
                    hide={hiddenDimensions.has(`${config.kpiId}|2+ weeks old`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "2+ weeks old");
                      }
                    }}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        );
      }


      case 'line': {
        const hasMultipleSeries = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every((r: KpiCalcResult['results'][0]) => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeries) {
          const allPeriods = new Set<string>();
          kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
            result.timeSeries?.forEach((point: any) => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            let isComplete = true;
            kpi.results.forEach((result: KpiCalcResult['results'][0], idx: number) => {
              const point = result.timeSeries?.find((p: any) => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
              dataPoint[`ticketKeys${idx}`] = (point as any)?.ticketKeys || [];
              if (point && point.isComplete === false) isComplete = false;
            });
            dataPoint.isComplete = isComplete;
            return dataPoint;
          });

          // @MX:ANCHOR: Line Chart Rendering
          // Filter data based on zoom state
          const zoomedData = zoomState.leftIndex !== null && zoomState.rightIndex !== null
            ? mergedData.slice(zoomState.leftIndex, zoomState.rightIndex + 1)
            : mergedData;

          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart
                data={zoomedData}
                margin={{ top: 20, right: 60, left: 20, bottom: 80 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleZoom}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  dataKey="name"
                  className="text-xs"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  interval="preserveStartEnd"
                />
                <YAxis className="text-xs" />
                <Tooltip
                  {...tooltipStyle}
                  content={<CustomLineAreaTooltip />}
                />
                <Legend
                  onClick={handleLegendClick}
                  cursor="pointer"
                  formatter={renderLegend}
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                {zoomState.refAreaLeft !== undefined && zoomState.refAreaRight !== undefined && (
                  <ReferenceArea
                    x1={mergedData[zoomState.refAreaLeft]?.name}
                    x2={mergedData[zoomState.refAreaRight]?.name}
                    stroke="none"
                    fillOpacity={0.3}
                    fill="purple"
                  />
                )}
                {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <Line
                      key={result.name || idx}
                      type="monotone"
                      dataKey={`series${idx}`}
                      name={result.name}
                      stroke={color}
                      strokeWidth={2}
                      activeDot={{
                        onClick: (_e: any, payload: any) => {
                          const keys = payload.payload[`ticketKeys${idx}`];
                          if (keys && keys.length > 0) {
                            onClick(keys, `${result.name} - ${payload.payload.name}`);
                          }
                        },
                        cursor: "pointer"
                      }}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (payload.isComplete === false) {
                          return (
                            <circle
                              key={`dot-${idx}-${payload.name}`}
                              cx={cx} cy={cy} r={4}
                              fill="transparent"
                              stroke={color}
                              strokeWidth={2}
                              strokeDasharray="2 2"
                            />
                          );
                        }
                        return <circle key={`dot-${idx}-${payload.name}`} cx={cx} cy={cy} r={4} fill={color} />;
                      }}
                      hide={hiddenDimensions.has(`${config.kpiId}|${result.name}`)}
                    />
                  );
                })}
                {/* SLA Target Reference Lines */}
                {slaTarget !== null && !isNaN(slaTarget) && kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                  if (hiddenDimensions.has(`${config.kpiId}|${result.name}`)) return null;
                  return (
                    <ReferenceLine
                      key={`sla-ref-${result.name}-${idx}`}
                      y={slaTarget}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: `${slaTarget}h`,
                        position: 'insideBottomRight',
                        fill: '#f59e0b',
                        fontSize: 10,
                        fontWeight: 600
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={selectedKpiData} margin={{ top: 20, right: 60, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                content={<CustomLineAreaTooltip />}
              />
              {/* @MX:ANCHOR: Line Chart (Standard) */}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                activeDot={{
                  onClick: (_e: any, payload: any) => {
                    const keys = payload.payload.ticketKeys;
                    if (keys && keys.length > 0) {
                      onClick(keys, payload.payload.name || 'Total Period');
                    }
                  },
                  cursor: "pointer"
                }}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.isComplete === false) {
                    return (
                      <circle
                        key={`dot-${payload.name}`}
                        cx={cx} cy={cy} r={4} 
                        fill="transparent" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        strokeDasharray="2 2" 
                      />
                    );
                  }
                  return <circle key={`dot-${payload.name}`} cx={cx} cy={cy} r={4} fill="#3b82f6" />;
                }}
              />
              {/* SLA Target Reference Line */}
              {slaTarget !== null && !isNaN(slaTarget) && (
                <ReferenceLine
                  y={slaTarget}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: `SLA: ${slaTarget}h`,
                    position: 'insideBottomRight',
                    fill: '#f59e0b',
                    fontSize: 10,
                    fontWeight: 600
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        );
      }

      
      case 'area': {
        const hasMultipleSeriesArea = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every((r: KpiCalcResult['results'][0]) => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeriesArea) {
          const allPeriods = new Set<string>();
          kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
            result.timeSeries?.forEach((point: any) => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            kpi.results.forEach((result: KpiCalcResult['results'][0], idx: number) => {
              const point = result.timeSeries?.find((p: any) => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
              dataPoint[`ticketKeys${idx}`] = (point as any)?.ticketKeys || [];
            });
            return dataPoint;
          });

          // @MX:ANCHOR: Area Chart Rendering
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart data={mergedData} margin={{ top: 20, right: 60, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
                <YAxis className="text-xs" />
                <Tooltip
                  {...tooltipStyle}
                  content={<CustomLineAreaTooltip />}
                />
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend} 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => (
                  <Area
                    key={result.name || idx}
                    type="monotone"
                    dataKey={`series${idx}`}
                    name={result.name}
                    stackId="1"
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    fillOpacity={0.6}
                    hide={hiddenDimensions.has(`${config.kpiId}|${result.name}`)}
                    activeDot={{
                      onClick: (_e: any, payload: any) => {
                        const keys = payload.payload[`ticketKeys${idx}`];
                        if (keys && keys.length > 0) {
                          onClick(keys, `${result.name} - ${payload.payload.name}`);
                        }
                      },
                      cursor: "pointer"
                    }}
                  />
                ))}
                {/* SLA Target Reference Lines */}
                {slaTarget !== null && !isNaN(slaTarget) && kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                  if (hiddenDimensions.has(`${config.kpiId}|${result.name}`)) return null;
                  return (
                    <ReferenceLine
                      key={`sla-ref-area-${result.name}-${idx}`}
                      y={slaTarget}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: `SLA: ${slaTarget}h`,
                        position: 'insideBottomRight',
                        fill: '#f59e0b',
                        fontSize: 10,
                        fontWeight: 600
                      }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={selectedKpiData} margin={{ top: 20, right: 60, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                content={<CustomLineAreaTooltip />}
              />
              {/* @MX:ANCHOR: Area Chart (Standard) */}
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
                fill="#3b82f6" 
                fillOpacity={0.6} 
                activeDot={{
                  onClick: (_e: any, payload: any) => {
                    const keys = payload.payload.ticketKeys;
                    if (keys && keys.length > 0) {
                      onClick(keys, payload.payload.name || 'Total Period');
                    }
                  },
                  cursor: "pointer"
                }}
              />
              {/* SLA Target Reference Line */}
              {slaTarget !== null && !isNaN(slaTarget) && (
                <ReferenceLine
                  y={slaTarget}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: `SLA: ${slaTarget}h`,
                    position: 'insideBottomRight',
                    fill: '#f59e0b',
                    fontSize: 10,
                    fontWeight: 600
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        );
      }


      case 'pie': {
        const visiblePieData = selectedKpiData.filter(d => !hiddenDimensions.has(`${config.kpiId}|${d.name}`));

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              {/* @MX:ANCHOR: Pie Chart Rendering */}
              <Pie
                data={visiblePieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, payload }) => `${name}: ${formatChartValue(value, payload.unit)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                onClick={(entry) => {
                  const keys = entry.ticketKeys || (entry.payload && entry.payload.ticketKeys);
                  if (keys && keys.length > 0) {
                    onClick(keys, entry.name || (entry.payload && entry.payload.name) || 'Selected Item');
                  }
                }}
                cursor="pointer"
              >
                {visiblePieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Legend 
                onClick={handleLegendClick} 
                cursor="pointer" 
                formatter={renderLegend} 
                verticalAlign="top" 
                align="right"
                wrapperStyle={{ paddingBottom: '20px' }}
              />
              <Tooltip
                {...tooltipStyle}
                content={<CustomPieTooltip />}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }


      default:
        return null;
    }
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
            {isTimeSeries && (zoomState.leftIndex !== null || zoomState.rightIndex !== null) && (
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
                console.log('[ChartCard] Popover onPointerDownOutside - preventing default');
                e.preventDefault();
              }} onEscapeKeyDown={(e) => {
                console.log('[ChartCard] Popover onEscapeKeyDown - preventing default');
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
          <div className="flex flex-wrap gap-3" data-export-ignore="true">
          <div className="w-[280px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">KPI Metric</Label>
            <Select value={config.kpiId} onValueChange={handleKpiChange}>
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Select KPI..." />
              </SelectTrigger>
              <SelectContent>
                {kpiOptions.timeSeries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      📈 Time-Series Trends
                    </SelectLabel>
                    {kpiOptions.timeSeries.map((option: any) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {kpiOptions.regular.length > 0 && (
                  <>
                    {kpiOptions.timeSeries.length > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        📊 Standard KPIs
                      </SelectLabel>
                      {kpiOptions.regular.map((option: any) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[140px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Chart Type</Label>
            <Select
              value={effectiveChartType}
              onValueChange={(type: 'bar' | 'line' | 'pie' | 'area') => onChange(config.id, { ...config, type })}
              disabled={!config.kpiId}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!isTimeSeries && <SelectItem value="bar">Bar Chart</SelectItem>}
                <SelectItem value="line">Line Chart</SelectItem>
                {!isTimeSeries && <SelectItem value="pie">Pie Chart</SelectItem>}
                <SelectItem value="area">Area Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex gap-3">
            <div className="w-[120px]">
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Width</Label>
              <Select
                value={config.width}
                onValueChange={(width: 'sm' | 'md' | 'lg' | 'full') => onChange(config.id, { ...config, width })}
              >
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[120px]">
              <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Height</Label>
              <Select
                value={config.height || 'md'}
                onValueChange={(height: 'short' | 'md' | 'tall' | 'xtall') => onChange(config.id, { ...config, height })}
              >
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="tall">Tall</SelectItem>
                  <SelectItem value="xtall">Extra Tall</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="mt-4">{renderChart()}</div>
        </CardContent>
      ) : null}
    </Card>
  );
}
