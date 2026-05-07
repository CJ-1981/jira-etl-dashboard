'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { EyeOff, Edit2, Zap, TrendingUp, CheckCircle2, Clock, Calendar, Target, AlertTriangle, BarChart3, Loader2, Download, Trash2, ChevronUp, ChevronDown, Settings } from 'lucide-react';
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
export function KpiCard({ result, pluginId, onHide, onClick }: { 
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
}) {
  const { settings } = useAppStore();
  const alertConfig = settings?.alerts?.thresholds?.[pluginId];
  
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
          <p className={`text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${isClickable ? 'group-hover:text-blue-500 group-hover:underline' : ''}`}>
            {result.name}
          </p>
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
        {/* Weekly Breakdown Section */}
        {result.details && result.details.some((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => ['This Week', 'Previous Week'].includes(d.label)) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            {result.details.find((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => d.label === 'This Week') && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">This Week</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {(() => {
                    const d = result.details.find((det: any) => det.label === 'This Week');
                    return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                  })()}
                  <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                </p>
              </div>
            )}
            {result.details.find((d: NonNullable<KpiCalcResult['results'][0]['details']>[0]) => d.label === 'Previous Week') && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Prev. Week</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {(() => {
                    const d = result.details.find((det: any) => det.label === 'Previous Week');
                    return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                  })()}
                  <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {result.details && <><Separator className="my-3 bg-gray-100 dark:bg-slate-800" /><div className="space-y-1.5">{result.details.map((d: any, i: number) => (<div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-400 dark:text-slate-500">{d.label}</span><span className="font-mono text-slate-700 dark:text-slate-300">{d.value}{d.unit ? ` ${d.unit}` : ''}</span></div>))}</div></>}
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

  // Get custom widget results and calculating state from store
  const { customWidgetResults, calculatingWidgets } = useAppStore();

  // Check if selected KPI is a time-series plugin
  const isTimeSeries = config.kpiId ? isTimeSeriesPlugin(config.kpiId) : false;

  // Determine which results to use (custom or global)
  const effectiveResults = useMemo(() => {
    if (config.jqlFilter?.enabled && customWidgetResults.has(config.id)) {
      return customWidgetResults.get(config.id) || [];
    }
    return kpiResults;
  }, [config.jqlFilter?.enabled, customWidgetResults, config.id, kpiResults]);

  const selectedKpiData = useMemo(() => {
    if (!config.kpiId) return null;

    switch (config.type) {
      case 'bar':
        return transformForBarChart(effectiveResults, config.kpiId);
      case 'pie':
        return transformForPieChart(effectiveResults, config.kpiId);
      case 'line':
        return transformForLineChart(effectiveResults, config.kpiId);
      case 'area':
        return transformForLineChart(effectiveResults, config.kpiId);
      default:
        return [];
    }
  }, [config.kpiId, config.type, effectiveResults]);

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
    onChange(config.id, { ...config, jqlFilter: filter });

    // Trigger calculation if custom JQL is enabled
    if (filter.enabled && filter.query && calculateWidgetJql) {
      console.log('[ChartCard] Triggering calculation for widget:', config.id);
      await calculateWidgetJql(config.id, filter);
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

    // Dynamic height based on width
    const chartHeight = {
      sm: 250,   // Narrow
      md: 300,   // Medium
      lg: 350,   // Wide
      full: 400, // Full
    }[config.width] || 300;

    const kpi = kpiResults.find((k) => k.pluginId === config.kpiId);
    const unit = kpi?.results?.[0]?.unit || '';

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

    switch (config.type) {
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
                  formatter={(value: number) => formatChartValue(value, unit)}
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
        const hasWeeklyLayers = visibleBarData.some(d => (d.thisWeek && d.thisWeek !== 0) || (d.prevWeek && d.prevWeek !== 0));

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={visibleBarData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number) => formatChartValue(value, unit)}
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
              <Bar 
                dataKey="value" 
                name="Total Period" 
                radius={[4, 4, 0, 0]} 
                hide={hiddenDimensions.has(`${config.kpiId}|Total Period`)}
                cursor="pointer"
                onClick={(data) => {
                  if (data && data.ticketKeys) {
                    onClick(data.ticketKeys, data.name || 'Total Period');
                  }
                }}
              >
                {visibleBarData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]}
                    fillOpacity={entry.isComplete === false ? 0.4 : 1}
                  />
                ))}
              </Bar>
              {hasWeeklyLayers && (
                <>
                  <Bar 
                    dataKey="thisWeek" 
                    name="This Week" 
                    fill="#3b82f6" 
                    radius={[4, 4, 0, 0]} 
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
                    name="Prev Week" 
                    fill="#94a3b8" 
                    radius={[4, 4, 0, 0]} 
                    hide={hiddenDimensions.has(`${config.kpiId}|Prev Week`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "Prev Week");
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
          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
                <YAxis className="text-xs" />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => formatChartValue(value, unit)}
                />
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend} 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
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
              </LineChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={selectedKpiData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number) => formatChartValue(value, unit)}
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
              <AreaChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
                <YAxis className="text-xs" />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => formatChartValue(value, unit)}
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
              </AreaChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={selectedKpiData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
              <YAxis className="text-xs" />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number) => formatChartValue(value, unit)}
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
                formatter={(value: number, name: string, props: any) => [formatChartValue(value, props.payload.unit), name]}
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
              <CardTitle className="text-lg">Chart Visualization</CardTitle>
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
      <CardContent className="space-y-4">
        {/* Inline Controls */}
        <div className="flex flex-wrap gap-3" data-export-ignore="true">
          <div className="flex-1 min-w-[200px]">
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
              value={config.type}
              onValueChange={(type: 'bar' | 'line' | 'pie' | 'area') => onChange(config.id, { ...config, type })}
              disabled={!config.kpiId}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
                <SelectItem value="area">Area Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
        </div>

        {/* Chart Area */}
        <div className="mt-4">{renderChart()}</div>
      </CardContent>
    </Card>
  );
}
