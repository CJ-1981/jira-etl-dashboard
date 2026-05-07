'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EyeOff, Zap, TrendingUp, CheckCircle2, Clock, Calendar, Target, AlertTriangle } from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store/app-store';
import { KpiCalcResult } from '@/types/dashboard';

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
