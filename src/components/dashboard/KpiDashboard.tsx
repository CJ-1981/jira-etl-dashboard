'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import useKpiDashboard from '@/hooks/use-kpi-dashboard';
import { KpiDashboardToolbar } from './KpiDashboardToolbar';
import { KpiMetricsGrid } from './KpiMetricsGrid';
import { KpiDrilldownDrawer } from './KpiDrilldownDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Sliders, Loader2, BarChart3, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { localConfig } from '@/lib/config/local-store';

export default function KpiDashboard() {
  const {
    activeConnectionId, theme,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    globalFilters, setGlobalFilters,
    filterPanelOpen, setFilterPanelOpen,
    showFloatingBar, setShowFloatingBar,
    masterDatasetInfo,
    hiddenDimensions, setHiddenDimensions,
    dashboardJqlQuery, setDashboardJqlQuery
  } = useAppStore();

  const hook = useKpiDashboard();

  // @MX:NOTE: Restore scroll listener for floating bar visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingBar(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [setShowFloatingBar]);

  if (!activeConnectionId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-slate-100 dark:bg-slate-800/50 p-6 rounded-full mb-4">
          <BarChart3 className="h-10 w-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-bold mb-2">No Connection Selected</h3>
        <p className="text-slate-500 max-w-xs">Please select a Jira connection in the Settings tab to view KPI analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 relative">
      <KpiDashboardToolbar
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        globalFilters={globalFilters}
        calculating={hook.calculating}
        runCalculation={hook.runCalculation}
        masterDatasetInfo={masterDatasetInfo}
        filterPanelOpen={filterPanelOpen}
        setFilterPanelOpen={setFilterPanelOpen}
        onPrint={hook.handlePrint}
        onSavePreset={hook.handleSavePreset}
        onLoadPreset={hook.handleLoadPreset}
        onUpdatePreset={hook.handleUpdatePreset}
        onDeletePreset={hook.handleDeletePreset}
        presets={hook.presets}
        periodAnalysis={hook.periodAnalysis}
        setEditingJqlId={hook.setEditingJqlId}
        dashboardJqls={hook.dashboardJqls}
        jqlInputRef={hook.jqlInputRef}
        filterOptions={hook.filterOptions}
        saveDashboardJqls={(updated) => {
          hook.setDashboardJqls(updated);
          localConfig.saveDashboardJqls(updated);
        }}
        jqlToDelete={hook.jqlToDelete}
        setJqlToDelete={hook.setJqlToDelete}
        handleClearAll={hook.handleClearAll}
        newPresetName={hook.newPresetName}
        setNewPresetName={hook.setNewPresetName}
        presetPopoverOpen={hook.presetPopoverOpen}
        setPresetPopoverOpen={hook.setPresetPopoverOpen}
        pendingFilters={hook.pendingFilters}
        handleUpdatePendingFilter={hook.handleUpdatePendingFilter}
        handleApplyFilters={hook.handleApplyFilters}
        jqlQuery={dashboardJqlQuery}
        setJqlQuery={setDashboardJqlQuery}
        editingJqlId={hook.editingJqlId}
      />

      <KpiMetricsGrid
        kpiResults={hook.kpiResults}
        mainKpis={hook.mainKpis}
        statusKpis={hook.statusKpis}
        distributionKpis={hook.distributionKpis}
        priorityKpis={hook.priorityKpis}
        slaStatusKpis={hook.slaStatusKpis}
        assigneeKpis={hook.assigneeKpis}
        tableKpiResults={hook.tableKpiResults}
        viewMode={hook.viewMode}
        setViewMode={hook.setViewMode}
        handleExportKpis={hook.handleExportKpis}
        hiddenDimensions={hiddenDimensions}
        setHiddenDimensions={setHiddenDimensions}
        toggleDimension={hook.toggleDimension}
        handleDrillDown={hook.handleDrillDown}
        charts={hook.filteredCharts}
        handleAddChart={hook.handleAddChart}
        handleRemoveChart={hook.handleRemoveChart}
        handleUpdateChart={hook.handleUpdateChart}
        handleMoveChart={hook.handleMoveChart}
        theme={theme as any}
        calculating={hook.calculating}
      />

      <KpiDrilldownDrawer
        drillDownKeys={hook.drillDownKeys}
        setDrillDownKeys={hook.setDrillDownKeys}
        drillDownTitle={hook.drillDownTitle}
      />

      {/* @MX:NOTE: Restored Recalculating Popup */}
      <AnimatePresence>
        {hook.calculating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-slate-950/20 backdrop-blur-[2px] flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 flex flex-col items-center gap-4 pointer-events-auto"
            >
              <div className="relative">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="h-4 w-4 text-blue-400/50" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold">Recalculating KPIs</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Processing master dataset & plugins...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* @MX:NOTE: Restored Floating Menu */}
      <AnimatePresence>
        {showFloatingBar && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] no-print"
          >
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-2xl rounded-full px-4 py-2 flex items-center gap-3">
              <div className="flex items-center gap-2 pr-3 border-r border-slate-200 dark:border-slate-800">
                <div className="bg-emerald-500/10 p-1.5 rounded-full">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs font-bold whitespace-nowrap">Dashboard</span>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={hook.runCalculation}
                  disabled={hook.calculating}
                  className="h-8 px-3 text-xs gap-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 text-slate-600 dark:text-slate-400 hover:text-blue-500"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${hook.calculating ? 'animate-spin' : ''}`} />
                  Recalculate
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                  className={`h-8 px-3 text-xs gap-2 rounded-full transition-all ${filterPanelOpen ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'}`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Filters
                  {Object.keys(globalFilters).length > 0 && (
                    <Badge className="bg-emerald-500 h-4 min-w-[16px] p-0 flex items-center justify-center text-[8px]">
                      {Object.values(globalFilters).flat().length}
                    </Badge>
                  )}
                </Button>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                <div className="flex items-center gap-2 px-2 text-[10px] text-slate-500 font-medium">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(dateFrom).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {new Date(dateTo).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
