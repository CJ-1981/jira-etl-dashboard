"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  Save, 
  Trash2, 
  Plus, 
  ChevronDown, 
  Loader2, 
  ToggleLeft, 
  ToggleRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardView, DashboardViewState } from '@/types/dashboard';
import { activeViewKey } from '@/lib/config/local-store';
import { dedupeChartsById } from '@/lib/chart-data-utils';
import { getDataSource } from '@/lib/datasource';

export function ViewManager() {
  const {
    activeConnectionId,
    storageConfig,
    dateFrom,
    dateTo,
    region,
    selectedPeriodPreset,
    globalFilters,
    dashboardCharts,
    dashboardJqlQuery,
    kpiCardConfigs,
    hiddenDimensions,
    widgetTitles,
    collapsedWidgets,

    savedViews,
    setSavedViews,
    activeView,
    setActiveView,
    isViewModified,
    setIsViewModified,

    // Actions to restore state
    setDateFrom,
    setDateTo,
    setRegion,
    setSelectedPeriodPreset,
    setGlobalFilters,
    setDashboardCharts,
    setDashboardJqlQuery,
    setKpiCardConfigs,
    setHiddenDimensions,
    setWidgetTitles,
    setCollapsedWidgets,
    widgetHeights,
    setWidgetHeights,
  } = useAppStore();

  const queryClient = useQueryClient();
  const [newViewName, setNewViewName] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Handle connection reference carefully - app-store uses activeConnectionId
  const activeConnectionRef = activeConnectionId;

  // Query key shared by the views query and all view mutations so a successful
  // mutation can invalidate/refetch the list.
  const viewsQueryKey = ['dashboard-views', activeConnectionRef, storageConfig] as const;

  const getCurrentViewState = (): DashboardViewState => {
    return {
      dateFrom,
      dateTo,
      selectedPeriodPreset,
      region,
      globalFilters,
      charts: dashboardCharts,
      dashboardJqlQuery,
      kpiCardConfigs,
      hiddenDimensions,
      widgetTitles,
      collapsedWidgets,
      widgetHeights,
    };
  };

  const loadView = (view: DashboardView) => {
    try {
      const state = JSON.parse(view.data) as DashboardViewState;

      // @MX:NOTE: When a period preset is active, recalculate dates based on current date
      // This ensures the view stays valid across day boundaries
      if (state.selectedPeriodPreset) {
        const preset = state.selectedPeriodPreset;
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const todayStr = today.toISOString().split('T')[0];

        if (preset === 'MAX') {
          // MAX preset: use the full available date range
          // Note: This will be calculated by the dashboard component based on masterDatasetInfo
          // For now, set to empty to trigger MAX detection logic in the dashboard
          setDateFrom('');
          setDateTo('');
        } else {
          // Parse preset label to get days (e.g., '7D' -> 7, '1Y' -> 365)
          const daysMap: Record<string, number> = {
            '7D': 7, '14D': 14, '30D': 30, '60D': 60,
            '90D': 90, '180D': 180, '1Y': 365
          };
          const days = daysMap[preset];
          if (days !== undefined) {
            const targetStart = new Date(today);
            targetStart.setDate(today.getDate() - days);
            targetStart.setHours(0, 0, 0, 0);
            setDateFrom(targetStart.toISOString().split('T')[0]);
            setDateTo(todayStr);
          } else {
            // Unknown preset - fall back to saved dates
            setDateFrom(state.dateFrom || '');
            setDateTo(state.dateTo || '');
          }
        }
      } else {
        // No preset - use saved exact dates
        setDateFrom(state.dateFrom || '');
        setDateTo(state.dateTo || '');
      }

      setRegion(state.region || 'national');
      setGlobalFilters(state.globalFilters || {});
      setDashboardCharts(dedupeChartsById(state.charts || []));
      setDashboardJqlQuery(state.dashboardJqlQuery || '');
      setKpiCardConfigs(state.kpiCardConfigs || []);
      // Saved views always serialized these as arrays; the Array.isArray
      // guards keep restore safe against any legacy/malformed payloads.
      setHiddenDimensions(Array.isArray(state.hiddenDimensions) ? state.hiddenDimensions : []);
      setWidgetTitles(state.widgetTitles || {});
      setCollapsedWidgets(Array.isArray(state.collapsedWidgets) ? state.collapsedWidgets : []);

      // Merge widget heights to preserve plugin config heights
      setWidgetHeights((prev) => ({
        ...prev, // Preserve existing heights (like plugin configs)
        ...(state.widgetHeights || {}), // Override with saved view heights
      }));

      // Restore the period preset state
      setSelectedPeriodPreset(state.selectedPeriodPreset);

      setActiveView(view);
      setIsViewModified(false);
      setPopoverOpen(false);
      toast.success(`Loaded view: ${view.name}`);
    } catch (e) {
      console.error('Parse error:', e);
      toast.error('Failed to parse view data');
    }
  };

  // @MX:NOTE: Views are fetched via React Query, keyed by connection +
  // storageConfig. When the key changes (connection switch) React Query tracks
  // each key independently, so a slow response for a previous connection can
  // never overwrite the view list of the current one.
  const viewsQuery = useQuery({
    queryKey: viewsQueryKey,
    queryFn: async () => {
      return getDataSource().listViews(activeConnectionRef, storageConfig);
    },
    enabled: !!activeConnectionRef,
    retry: false,
  });

  // Keep the zustand savedViews slice in sync with the query result, and run
  // the one-time auto-restore (last active view, else the default view) each
  // time a connection's views arrive. A ref guards the restore so post-mutation
  // refetches never re-apply a view on top of the user's current state.
  const restoredForRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!activeConnectionRef) {
      setSavedViews([]);
      setActiveView(null);
      restoredForRef.current = null;
      return;
    }
    if (viewsQuery.data) {
      setSavedViews(viewsQuery.data);

      if (restoredForRef.current !== activeConnectionRef) {
        restoredForRef.current = activeConnectionRef;

        // Try to restore the last active view for this connection
        const savedActiveViewId = localStorage.getItem(activeViewKey(activeConnectionRef));
        if (savedActiveViewId) {
          const viewToRestore = viewsQuery.data.find((v) => v.id === savedActiveViewId);
          if (viewToRestore) {
            loadView(viewToRestore);
            return;
          }
        }

        // If there's a default view and no active view (or we're on initial load), load it
        const defaultView = viewsQuery.data.find((v) => v.isDefault);
        // Verify activeView belongs to current connection (not stale from previous connection)
        const isActiveViewValid = activeView?.id && viewsQuery.data.some((v) => v.id === activeView.id);
        if (defaultView && !isActiveViewValid) {
          loadView(defaultView);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsQuery.data, activeConnectionRef]);

  // Persist active view to localStorage whenever it changes
  useEffect(() => {
    if (activeConnectionRef && activeView) {
      localStorage.setItem(activeViewKey(activeConnectionRef), activeView.id);
    } else if (activeConnectionRef && !activeView) {
      // Clear the saved view if no view is active
      localStorage.removeItem(activeViewKey(activeConnectionRef));
    }
  }, [activeView, activeConnectionRef]);

  // Create view mutation. On success the views query cache is updated with
  // the new view and invalidated for consistency.
  const createViewMutation = useMutation({
    mutationFn: async (name: string) => {
      const viewState = getCurrentViewState();
      return getDataSource().createView(activeConnectionRef, { name, data: JSON.stringify(viewState) }, storageConfig);
    },
    onSuccess: (view, name) => {
      setSavedViews([view, ...savedViews]);
      setActiveView(view);
      setIsViewModified(false);
      setNewViewName('');
      setPopoverOpen(false);
      toast.success(`View "${name}" created`);
      queryClient.invalidateQueries({ queryKey: ['dashboard-views'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create view');
    },
  });

  const handleCreateView = () => {
    if (!newViewName || !activeConnectionRef) return;
    createViewMutation.mutate(newViewName);
  };

  // Save current view mutation.
  const saveViewMutation = useMutation({
    mutationFn: async (view: DashboardView) => {
      const viewState = getCurrentViewState();
      return getDataSource().updateView(view.id, { data: JSON.stringify(viewState) }, storageConfig);
    },
    onSuccess: (updatedView, view) => {
      setSavedViews(savedViews.map(v => v.id === view.id ? updatedView : v));
      setActiveView(updatedView);
      setIsViewModified(false);
      toast.success(`View "${view.name}" saved`);
      queryClient.invalidateQueries({ queryKey: ['dashboard-views'] });
    },
    onError: () => {
      toast.error('Failed to save view');
    },
  });

  const handleSaveCurrentView = () => {
    if (!activeView) return;
    saveViewMutation.mutate(activeView);
  };

  // Delete view mutation.
  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      await getDataSource().deleteView(id, storageConfig);
    },
    onSuccess: (_res, id) => {
      setSavedViews(savedViews.filter(v => v.id !== id));
      if (activeView?.id === id) {
        setActiveView(null);
      }
      toast.success('View deleted');
      queryClient.invalidateQueries({ queryKey: ['dashboard-views'] });
    },
    onError: () => {
      toast.error('Failed to delete view');
    },
  });

  const handleDeleteView = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this view?')) return;
    deleteViewMutation.mutate(id);
  };

  // Toggle auto-save mutation.
  const toggleAutoSaveMutation = useMutation({
    mutationFn: async (view: DashboardView) => {
      return getDataSource().updateView(view.id, { autoSaveEnabled: !view.autoSaveEnabled }, storageConfig);
    },
    onSuccess: (updatedView, view) => {
      setSavedViews(savedViews.map(v => v.id === view.id ? updatedView : v));
      if (activeView?.id === view.id) {
        setActiveView(updatedView);
      }
      toast.success(`Auto-save ${updatedView.autoSaveEnabled ? 'enabled' : 'disabled'}`);
      queryClient.invalidateQueries({ queryKey: ['dashboard-views'] });
    },
    onError: () => {
      toast.error('Failed to update auto-save');
    },
  });

  const toggleAutoSave = (view: DashboardView, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleAutoSaveMutation.mutate(view);
  };

  // Set/unset default view mutation.
  const setDefaultViewMutation = useMutation({
    mutationFn: async (view: DashboardView) => {
      const making = !view.isDefault;
      try {
        await getDataSource().setDefaultView(view.id, making, storageConfig);
      } catch (err) {
        throw new Error((err as Error).message || (making ? 'Failed to clear default view' : 'Failed to set default view'));
      }
    },
    onSuccess: (_res, view) => {
      if (view.isDefault) {
        setSavedViews(savedViews.map(v => ({ ...v, isDefault: false })));
        toast.success('Default view cleared');
      } else {
        setSavedViews(savedViews.map(v => ({ ...v, isDefault: v.id === view.id })));
        toast.success(`"${view.name}" set as default view`);
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-views'] });
    },
    onError: (error: Error) => {
      console.error('Set default view error:', error);
      toast.error(error.message || 'Failed to update default view');
    },
  });

  const handleSetDefaultView = (view: DashboardView, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultViewMutation.mutate(view);
  };

  // Combined pending flag: initial list load plus any in-flight view mutation
  // (mirrors the previous shared `loading` state that gated the buttons).
  const loading = viewsQuery.isLoading ||
    createViewMutation.isPending ||
    saveViewMutation.isPending ||
    deleteViewMutation.isPending ||
    toggleAutoSaveMutation.isPending ||
    setDefaultViewMutation.isPending;

  const handleBackToDefault = () => {
    // Find the default view
    const defaultView = savedViews.find(v => v.isDefault);
    if (defaultView) {
      loadView(defaultView);
    } else {
      // If no default view exists, clear the active view and reset to current state
      setActiveView(null);
      setIsViewModified(false);
      toast.success('Returned to default dashboard');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 no-print">
      {/* Back to Default button - shown when a saved view is active */}
      {activeView && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToDefault}
          className="h-7 px-2 text-[10px] gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-500/20"
          title="Return to default view"
        >
          <ToggleLeft className="h-3 w-3" />
          Back to Default
        </Button>
      )}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-[10px] gap-1.5 rounded-md transition-all ${
              activeView
                ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
            }`}
          >
            <Zap className={`h-3 w-3 shrink-0 ${activeView ? 'fill-emerald-500' : ''}`} />
            <span className="max-w-[120px] truncate">{activeView ? activeView.name : 'Saved Views'}</span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
            {savedViews.length > 0 && !activeView && (
              <Badge className="ml-1 bg-emerald-500 hover:bg-emerald-600 border-none h-3 min-w-[12px] flex items-center justify-center p-0 text-[8px]">
                {savedViews.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-xl z-[60]">
          <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Dashboard Views</h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Database-backed persistent views</p>
          </div>
          
          <div className="p-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {savedViews.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-400 italic">No saved views yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {savedViews.map(view => (
                  <div 
                    key={view.id} 
                    className={`group flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      activeView?.id === view.id 
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20' 
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                    onClick={() => loadView(view)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        loadView(view);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold truncate ${activeView?.id === view.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {view.name}
                        </span>
                        {view.isDefault && (
                          <Badge className="h-3 px-1 text-[7px] bg-blue-500 uppercase">Default</Badge>
                        )}
                        {view.autoSaveEnabled && (
                          <Badge className="h-3 px-1 text-[7px] bg-amber-500 uppercase">Auto</Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        Last updated {new Date(view.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-blue-500"
                        onClick={(e) => handleSetDefaultView(view, e)}
                        title={view.isDefault ? "Remove as default" : "Set as default view"}
                      >
                        {view.isDefault ? <ToggleLeft className="h-4 w-4 text-blue-500" /> : <ToggleRight className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-amber-500"
                        onClick={(e) => toggleAutoSave(view, e)}
                        title={view.autoSaveEnabled ? "Disable Auto-save" : "Enable Auto-save"}
                      >
                        {view.autoSaveEnabled ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                        onClick={(e) => handleDeleteView(view.id, e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="New view name..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateView()}
              />
              <Button 
                size="sm" 
                className="h-8 w-8 p-0 shrink-0 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleCreateView}
                disabled={!newViewName || loading}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {activeView && isViewModified && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px] gap-1.5 border-amber-500/30 text-amber-600 bg-amber-500/5 hover:bg-amber-500/10 animate-pulse shadow-sm"
          onClick={handleSaveCurrentView}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save Changes
        </Button>
      )}
      
      {activeView && activeView.autoSaveEnabled && (
        <Badge variant="outline" className="h-5 px-1.5 text-[8px] border-emerald-500/30 text-emerald-500 bg-emerald-500/5 flex items-center gap-1">
          <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
          Auto-saving
        </Badge>
      )}
    </div>
  );
}
