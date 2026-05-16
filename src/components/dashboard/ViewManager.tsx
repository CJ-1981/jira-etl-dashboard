"use client";

import React, { useState, useEffect } from 'react';
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

export function ViewManager() {
  const {
    activeConnectionId,
    storageConfig,
    dateFrom,
    dateTo,
    region,
    globalFilters,
    dashboardCharts,
    dashboardJqlQuery,
    kpiCardConfigs,
    hiddenDimensions,
    widgetTitles,
    
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
    setGlobalFilters,
    setDashboardCharts,
    setDashboardJqlQuery,
    setKpiCardConfigs,
    setHiddenDimensions,
    setWidgetTitles,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Handle connection reference carefully - app-store uses activeConnectionId
  const activeConnectionRef = activeConnectionId;

  const getCurrentViewState = (): DashboardViewState => {
    return {
      dateFrom,
      dateTo,
      region,
      globalFilters,
      charts: dashboardCharts,
      dashboardJqlQuery,
      kpiCardConfigs,
      hiddenDimensions: Array.from(hiddenDimensions),
      widgetTitles,
    };
  };

  const loadView = (view: DashboardView) => {
    try {
      const state = JSON.parse(view.data) as DashboardViewState;
      
      setDateFrom(state.dateFrom || '');
      setDateTo(state.dateTo || '');
      setRegion(state.region || 'national');
      setGlobalFilters(state.globalFilters || {});
      setDashboardCharts(state.charts || []);
      setDashboardJqlQuery(state.dashboardJqlQuery || '');
      setKpiCardConfigs(state.kpiCardConfigs || []);
      setHiddenDimensions(new Set(state.hiddenDimensions || []));
      setWidgetTitles(state.widgetTitles || {});
      
      setActiveView(view);
      setIsViewModified(false);
      setPopoverOpen(false);
      toast.success(`Loaded view: ${view.name}`);
    } catch (e) {
      console.error('Parse error:', e);
      toast.error('Failed to parse view data');
    }
  };

  const fetchViews = async (restoreViewId: string | null = null) => {
    if (!activeConnectionRef) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        connectionRef: activeConnectionRef,
        storageConfig: JSON.stringify(storageConfig)
      });
      const res = await fetch(`/api/dashboard/views?${params}`);
      const data = await res.json();
      if (data.success) {
        setSavedViews(data.views);

        // Restore the saved view if requested
        if (restoreViewId) {
          const viewToRestore = data.views.find((v: DashboardView) => v.id === restoreViewId);
          if (viewToRestore && !activeView) {
            loadView(viewToRestore);
            return;
          }
        }

        // If there's a default view and no active view, load it
        const defaultView = data.views.find((v: DashboardView) => v.isDefault);
        if (defaultView && !activeView) {
          loadView(defaultView);
        }
      }
    } catch (error) {
      console.error('Failed to fetch views:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch views on connection change
  useEffect(() => {
    if (activeConnectionId) {
      // Try to restore the last active view for this connection
      const savedActiveViewId = localStorage.getItem(`activeView_${activeConnectionRef}`);

      // @MX:WARN - Closure Risk: fetchViews must be called with fresh state
      // @MX:REASON - Calling fetchViews() immediately after setActiveView(null) can suffer from
      // stale closures if fetchViews depends on the activeView value from the current render.
      fetchViews(savedActiveViewId);
    } else {
      setSavedViews([]);
      setActiveView(null);
    }
  }, [activeConnectionRef]);

  // Persist active view to localStorage whenever it changes
  useEffect(() => {
    if (activeConnectionRef && activeView) {
      localStorage.setItem(`activeView_${activeConnectionRef}`, activeView.id);
    } else if (activeConnectionRef && !activeView) {
      // Clear the saved view if no view is active
      localStorage.removeItem(`activeView_${activeConnectionRef}`);
    }
  }, [activeView, activeConnectionRef]);

  const handleCreateView = async () => {
    if (!newViewName || !activeConnectionRef) return;
    
    setLoading(true);
    try {
      const viewState = getCurrentViewState();
      const res = await fetch('/api/dashboard/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionRef: activeConnectionRef,
          name: newViewName,
          data: JSON.stringify(viewState),
          storageConfig
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSavedViews([data.view, ...savedViews]);
        setActiveView(data.view);
        setIsViewModified(false);
        setNewViewName('');
        setPopoverOpen(false);
        toast.success(`View "${newViewName}" created`);
      } else {
        toast.error(data.error || 'Failed to create view');
      }
    } catch (error) {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrentView = async () => {
    if (!activeView) return;
    
    setLoading(true);
    try {
      const viewState = getCurrentViewState();
      const res = await fetch(`/api/dashboard/views/${activeView.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: JSON.stringify(viewState),
          storageConfig
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSavedViews(savedViews.map(v => v.id === activeView.id ? data.view : v));
        setActiveView(data.view);
        setIsViewModified(false);
        toast.success(`View "${activeView.name}" saved`);
      }
    } catch (error) {
      toast.error('Failed to save view');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this view?')) return;
    
    try {
      // @MX:WARN - Sensitive Data: DB credentials in storageConfig
      // @MX:REASON - storageConfig contains database URLs which may include credentials.
      // We send it in the request body to avoid exposure in server logs.
      const res = await fetch(`/api/dashboard/views/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageConfig })
      });
      if (res.ok) {
        setSavedViews(savedViews.filter(v => v.id !== id));
        if (activeView?.id === id) {
          setActiveView(null);
        }
        toast.success('View deleted');
      }
    } catch (error) {
      toast.error('Failed to delete view');
    }
  };

  const toggleAutoSave = async (view: DashboardView, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/dashboard/views/${view.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoSaveEnabled: !view.autoSaveEnabled,
          storageConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        setSavedViews(savedViews.map(v => v.id === view.id ? data.view : v));
        if (activeView?.id === view.id) {
          setActiveView(data.view);
        }
        toast.success(`Auto-save ${data.view.autoSaveEnabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      toast.error('Failed to update auto-save');
    }
  };

  return (
    <div className="flex items-center gap-2 no-print">
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
            <Zap className={`h-3 w-3 ${activeView ? 'fill-emerald-500' : ''}`} />
            {activeView ? activeView.name : 'Saved Views'}
            <ChevronDown className="h-3 w-3 opacity-50" />
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
