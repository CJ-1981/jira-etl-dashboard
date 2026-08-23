'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowUp, BarChart3, Calendar, RefreshCw, Sliders,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DashboardFloatingBarProps {
  /** True when the bar should be shown (floating bar enabled and no drill-down open). */
  visible: boolean;
  dateFrom: string;
  dateTo: string;
  globalFilters: Record<string, string[]>;
  /** Plugin ids surfaced in the "Active Plugins" tooltip. */
  pluginIds: string[];
  calculating: boolean;
  onScrollToPeriod: () => void;
  onOpenFilters: () => void;
  onGoToPlugins: () => void;
  onRecalculate: () => void;
}

/**
 * Fixed bottom bar with the active period, applied filters, active plugins
 * and quick Recalculate / scroll-to-top actions.
 */
export function DashboardFloatingBar({
  visible,
  dateFrom,
  dateTo,
  globalFilters,
  pluginIds,
  calculating,
  onScrollToPeriod,
  onOpenFilters,
  onGoToPlugins,
  onRecalculate,
}: DashboardFloatingBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 pb-4"
        >
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-full shadow-2xl p-1.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 px-3">
              <div
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 transition-colors"
                onClick={onScrollToPeriod}
              >
                <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                {dateFrom && dateTo ? `${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}` : 'No Period'}
              </div>
              <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-slate-800" />
              <TooltipProvider delayDuration={0}>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 transition-colors"
                      onClick={onOpenFilters}
                    >
                      <Sliders className="h-3.5 w-3.5 text-emerald-500" />
                      {Object.values(globalFilters).flat().length} Filters
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs z-[70]" hideArrow={true}>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Applied Filters</p>
                      {Object.keys(globalFilters).length > 0 ? (
                        <div className="space-y-2">
                          {(Object.entries(globalFilters) as [string, string[]][]).map(([key, values]) => (
                            <div key={key} className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">{key}</span>
                              <div className="flex flex-wrap gap-1">
                                {values.map(v => (
                                  <Badge key={v} variant="secondary" className="text-[10px] py-0 h-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none">
                                    {v}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No active filters</p>
                      )}
                    </div>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
              <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-slate-800" />
              <TooltipProvider delayDuration={0}>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 transition-colors"
                      onClick={onGoToPlugins}
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                      {pluginIds.length} Plugins
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs z-[70] rounded-lg" sideOffset={8} hideArrow={true}>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Active Plugins</p>
                      {pluginIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {pluginIds.map(pluginId => (
                            <Badge key={pluginId} variant="secondary" className="text-[9px] py-0 h-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-none">
                              {pluginId}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No active plugins</p>
                      )}
                    </div>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-1.5 pr-1.5">
              <Button
                size="sm"
                className="rounded-full h-8 px-4 bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-lg shadow-blue-600/20 gap-2"
                onClick={onRecalculate}
                disabled={calculating}
              >
                <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                Recalculate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 px-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 gap-1"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                Top
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
