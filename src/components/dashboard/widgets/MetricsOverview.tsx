'use client';

import { Activity, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import type { KpiCalcResult } from '@/types/dashboard';
import { KpiDataTable } from '../KpiDataTable';

export interface MetricsOverviewProps {
  /** Whether the overview body is expanded. */
  isExpanded: boolean;
  /** Toggle collapse for the fixed `metrics-overview` widget id. */
  onToggleCollapse: () => void;
  /** Sorted (visible) KPI results rendered in the table. */
  results: KpiCalcResult[];
  /** Total row count shown next to the header while collapsed. */
  totalRows: number;
  onExport: () => void;
  onDrillDown: (keys: string[], title: string) => void;
  getPluginName: (pluginId: string) => string;
}

/**
 * "Metrics Overview" section: collapsible KPI data table with an Export CSV
 * action. The collapse state lives in the shared collapsedWidgets store under
 * the fixed `metrics-overview` id.
 */
export function MetricsOverview({
  isExpanded,
  onToggleCollapse,
  results,
  totalRows,
  onExport,
  onDrillDown,
  getPluginName,
}: MetricsOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 group text-left"
          aria-expanded={isExpanded}
        >
          <Activity className="h-5 w-5 text-emerald-500 shrink-0" />
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Metrics Overview
          </h3>
          {isExpanded
            ? <ChevronUp className="h-4 w-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
            : <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />}
          <span className="text-xs text-slate-400 font-normal ml-1">
            {isExpanded ? '' : `(${totalRows} rows)`}
          </span>
        </button>

        {isExpanded && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="h-8 text-[10px] uppercase tracking-wider font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="metrics-table"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <KpiDataTable
              results={results}
              onDrillDown={onDrillDown}
              getPluginName={getPluginName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
