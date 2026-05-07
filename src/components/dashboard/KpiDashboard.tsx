'use client';

import React from 'react';
import { KpiDashboardToolbar } from './KpiDashboardToolbar';
import { KpiMetricsGrid } from './KpiMetricsGrid';
import { KpiDrilldownDrawer } from './KpiDrilldownDrawer';
import { useKpiDashboard } from '@/hooks/use-kpi-dashboard';
import { useAppStore } from '@/store/app-store';
import { localConfig } from '@/lib/config/local-store';

export default function KpiDashboard() {
  const {
    activeConnectionId, theme,
    globalFilters, setGlobalFilters,
    hiddenDimensions, setHiddenDimensions,
    dashboardCharts, setDashboardCharts,
    dashboardJqlQuery, setDashboardJqlQuery,
    kpiResults
  } = useAppStore();

  const hook = useKpiDashboard();

  const onPrint = () => window.print();

  if (!activeConnectionId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
        <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
          <img src="/logo.svg" alt="Jira ETL" className="h-16 w-16 opacity-20 grayscale" />
        </div>
        <h2 className="text-2xl font-bold text-slate-400 dark:text-slate-600 mb-2">No Active Connection</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Please select or create a Jira connection in the sidebar to view the analytics dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <KpiDashboardToolbar
        calculating={hook.calculating}
        runCalculation={hook.runCalculation}
        masterDatasetInfo={useAppStore.getState().masterDatasetInfo}
        filterPanelOpen={useAppStore.getState().filterPanelOpen}
        setFilterPanelOpen={useAppStore.getState().setFilterPanelOpen}
        globalFilters={globalFilters}
        onPrint={onPrint}
        periodAnalysis={hook.periodAnalysis}
        dateFrom={useAppStore.getState().dateFrom}
        setDateFrom={useAppStore.getState().setDateFrom}
        dateTo={useAppStore.getState().dateTo}
        setDateTo={useAppStore.getState().setDateTo}
        presets={hook.presets}
        handleLoadPreset={hook.handleLoadPreset}
        handleUpdatePreset={hook.handleUpdatePreset}
        handleDeletePreset={hook.handleDeletePreset}
        newPresetName={hook.newPresetName}
        setNewPresetName={hook.setNewPresetName}
        handleSavePreset={hook.handleSavePreset}
        presetPopoverOpen={hook.presetPopoverOpen}
        setPresetPopoverOpen={hook.setPresetPopoverOpen}
        pendingFilters={hook.pendingFilters}
        handleUpdatePendingFilter={hook.handleUpdatePendingFilter}
        handleApplyFilters={hook.handleApplyFilters}
        jqlQuery={dashboardJqlQuery}
        setJqlQuery={setDashboardJqlQuery}
        editingJqlId={hook.editingJqlId}
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
      />

      <KpiMetricsGrid
        kpiResults={kpiResults}
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
        charts={dashboardCharts}
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
    </div>
  );
}
