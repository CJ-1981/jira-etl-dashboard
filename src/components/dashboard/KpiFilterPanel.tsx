'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  Zap, Edit2, Trash2, CheckCircle2, X, Search, ChevronDown, Sliders,
} from 'lucide-react';
import { localConfig } from '@/lib/config/local-store';
import { JqlAutocomplete } from './JqlAutocomplete';
import type { UseJqlFiltersResult } from '@/hooks/useJqlFilters';

interface KpiFilterPanelProps {
  jqlFilters: UseJqlFiltersResult;
  filterOptions: Record<string, string[]>;
  globalFilters: Record<string, string[]>;
  setGlobalFilters: (filters: Record<string, string[]>) => void;
  jqlQuery: string;
  setJqlQuery: (query: string) => void;
  jqlInputRef: React.RefObject<HTMLInputElement | null>;
  editingJqlId: string | null;
  setEditingJqlId: (id: string | null) => void;
  jqlToDelete: string | null;
  setJqlToDelete: (id: string | null) => void;
  setIsViewModified: (modified: boolean) => void;
  handleApplyFilters: () => void;
}

export function KpiFilterPanel({
  jqlFilters,
  filterOptions,
  globalFilters,
  setGlobalFilters,
  jqlQuery,
  setJqlQuery,
  jqlInputRef,
  editingJqlId,
  setEditingJqlId,
  jqlToDelete,
  setJqlToDelete,
  setIsViewModified,
  handleApplyFilters,
}: KpiFilterPanelProps) {
  const [filterSearchQuery, setFilterSearchQuery] = useState('');

  const handleUpdatePendingFilter = (key: string, value: string) => {
    jqlFilters.toggleStagingFilter(key, value);
    setIsViewModified(true);
  };

  const handleUpdateFilter = (key: string, value: string) => {
    jqlFilters.toggleStagingFilter(key, value);
    setIsViewModified(true);
  };

  const filterConfigs = useMemo(() => [
    { label: 'Project', key: 'project', options: filterOptions.project },
    { label: 'Assignee', key: 'assignee', options: filterOptions.assignee },
    { label: 'Priority', key: 'priority', options: filterOptions.priority },
    { label: 'Issue Type', key: 'issueType', options: filterOptions.issueType },
    { label: 'Status', key: 'status', options: filterOptions.status },
    { label: 'Component', key: 'component', options: filterOptions.component },
    { label: 'Label', key: 'label', options: filterOptions.label },
    { label: 'Issue Owner Team', key: 'issueOwnerTeam', options: filterOptions.issueOwnerTeam },
    ...localConfig.getCustomExtractFields()
      .filter(cf => cf.role !== 'storyPoints' && cf.role !== 'issueOwnerTeam')
      .map(cf => ({
        label: cf.label,
        key: cf.fieldId,
        options: filterOptions[cf.fieldId] || []
      }))
  ].filter(f => f.options && f.options.length >= 1), [filterOptions]);

  const isApplyDisabled = useMemo(() => {
    const stagingKeys = Object.keys(jqlFilters.stagingFilters);
    const globalKeys = Object.keys(globalFilters);

    if (stagingKeys.length !== globalKeys.length) return false;

    for (const key of stagingKeys) {
      const stagingVals = jqlFilters.stagingFilters[key] || [];
      const globalVals = globalFilters[key] || [];

      if (stagingVals.length !== globalVals.length) return false;

      const hasAllValues = stagingVals.every(v => globalVals.includes(v));
      if (!hasAllValues) return false;
    }

    return true;
  }, [jqlFilters.stagingFilters, globalFilters]);

  return (
    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-4 duration-300" data-filter-section>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Sliders className="h-4 w-4 text-emerald-500" />
          Advanced Filtering
        </h4>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-red-500" onClick={() => {
          jqlFilters.clearStagingFilters();
          setGlobalFilters({});
        }}>
          Clear All Filters
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">JQL-Lite Filter</Label>
            {jqlQuery && (
              <Badge variant="outline" className="h-4 py-0 text-[9px] border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
                <Zap className="h-2.5 w-2.5 mr-1" /> Dynamic Filter Active
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <JqlAutocomplete
              ref={jqlInputRef}
              value={jqlQuery}
              onChange={setJqlQuery}
              filterOptions={filterOptions}
              className="flex-1"
            />
            <Button
              size="sm"
              className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-xs"
              onClick={() => {
                if (!jqlQuery) return;
                if (editingJqlId) {
                  const oldJql = jqlFilters.jqlList.find(j => j.id === editingJqlId);
                  jqlFilters.editJql(editingJqlId, jqlQuery, oldJql?.name || 'Saved JQL');
                  setEditingJqlId(null);
                  setJqlQuery('');
                  toast.success('Filter updated');

                } else {
                  const newQuery = jqlQuery;
                  jqlFilters.addJql(newQuery, newQuery);
                  setJqlQuery('');
                  toast.success('Filter saved to dashboard');

                  jqlFilters.toggleStagingFilter('jql', newQuery);
                  setIsViewModified(true);
                }
              }}
            >
              {editingJqlId ? 'Update' : 'Add'} Filter
            </Button>
            {editingJqlId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[10px]"
                onClick={() => {
                  setEditingJqlId(null);
                  setJqlQuery('');
                }}
              >
                Cancel
              </Button>
            )}
          </div>

          {jqlFilters.jqlList.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {jqlFilters.jqlList.map(djql => {
                const isActive = jqlFilters.stagingFilters['jql']?.includes(djql.query);
                const isEditing = editingJqlId === djql.id;
                return (
                  <div key={djql.id} className="flex items-center gap-1">
                    <Badge
                      variant={isActive ? 'default' : 'outline'}
                      className={`h-6 px-2 gap-1.5 transition-all cursor-pointer ${isEditing ? 'ring-2 ring-amber-500' : ''} ${isActive ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
                      onClick={() => handleUpdatePendingFilter('jql', djql.query)}
                    >
                      <span className="max-w-[120px] truncate font-mono">{djql.query}</span>
                      <div className="flex items-center gap-1 ml-1">
                        <span
                          className="hover:text-blue-300 transition-colors p-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingJqlId(djql.id);
                            setJqlQuery(djql.query);
                          }}
                        >
                          <Edit2 className="h-2.5 w-2.5" />
                        </span>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <span
                              className="hover:text-red-200 transition-colors p-0.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setJqlToDelete(djql.id);
                              }}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </span>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete JQL-Lite Filter?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this saved filter? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setJqlToDelete(null)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => {
                                  if (jqlToDelete) {
                                    const queryToDelete = jqlFilters.jqlList.find(j => j.id === jqlToDelete)?.query;
                                    jqlFilters.deleteJql(jqlToDelete);
                                    if (queryToDelete && jqlFilters.stagingFilters['jql']?.includes(queryToDelete)) {
                                      handleUpdatePendingFilter('jql', queryToDelete);
                                    }
                                    if (editingJqlId === jqlToDelete) {
                                      setEditingJqlId(null);
                                      setJqlQuery('');
                                    }
                                    setJqlToDelete(null);
                                    toast.success('Filter deleted');
                                  }
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 no-print">
          {filterConfigs.map(filter => (
            <div key={filter.key} className="space-y-1.5 no-print">
              <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold no-print">{filter.label}</Label>
              <Popover onOpenChange={(open) => !open && setFilterSearchQuery("")}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-[11px] justify-between bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 font-normal"
                  >
                    <span className="truncate">
                      {jqlFilters.stagingFilters[filter.key]?.length
                        ? `${jqlFilters.stagingFilters[filter.key].length} selected`
                        : `All ${filter.label}${filter.label === 'Priority' ? 'ies' : filter.label === 'Status' ? 'es' : 's'}`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-3 w-3 text-slate-400" />
                      <Input
                        placeholder={`Search ${filter.label}...`}
                        className="h-7 pl-7 text-[10px] bg-slate-50 dark:bg-slate-900 border-none focus-visible:ring-1 focus-visible:ring-emerald-500/50"
                        value={filterSearchQuery}
                        onChange={(e) => setFilterSearchQuery(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-[10px] justify-start px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => handleUpdatePendingFilter(filter.key, 'all')}
                    >
                      Clear Selection
                    </Button>
                  </div>
                  <div className="max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
                    {filter.options
                      .filter(opt => !filterSearchQuery || String(opt).toLowerCase().includes(filterSearchQuery.toLowerCase()))
                      .map(opt => (
                        <div
                          key={opt}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm"
                          onClick={() => handleUpdatePendingFilter(filter.key, opt)}
                        >
                          <Checkbox
                            checked={!!jqlFilters.stagingFilters[filter.key]?.includes(opt)}
                            onCheckedChange={(e) => e.stopPropagation()}
                          />
                          <span className="text-xs truncate">{opt}</span>
                        </div>
                      ))}
                    {filter.options.filter(opt => !filterSearchQuery || String(opt).toLowerCase().includes(filterSearchQuery.toLowerCase())).length === 0 && (
                      <div className="py-4 px-2 text-center text-[10px] text-slate-400 italic">
                        No matches found
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800 no-print">
          <Button
            size="sm"
            onClick={handleApplyFilters}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-2"
            disabled={isApplyDisabled}
          >
            <CheckCircle2 className="h-4 w-4" />
            Apply Filters
          </Button>
        </div>
      </div>

      {Object.keys(jqlFilters.stagingFilters).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(Object.entries(jqlFilters.stagingFilters) as [string, string[]][]).map(([key, values]) => {
            const getDisplayKey = (k: string) => {
              if (k === 'issueOwnerTeam') return 'Team';
              if (k.startsWith('customfield_')) {
                const cf = localConfig.getCustomExtractFields().find(f => f.fieldId === k);
                return cf ? cf.label : k;
              }
              return k.charAt(0).toUpperCase() + k.slice(1);
            };
            const displayKey = getDisplayKey(key);

            return values.map(val => (
              <Badge key={`${key}-${val}`} variant="outline" className="gap-1 px-1.5 py-0 h-5 text-[10px] bg-slate-50 dark:bg-slate-800/50 text-slate-600 border-slate-200">
                <span className="text-slate-400">{displayKey}:</span> {val}
                <span
                  className="flex items-center justify-center pointer-events-auto cursor-pointer hover:text-red-500 transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleUpdateFilter(key, val); }}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              </Badge>
            ));
          })}
        </div>
      )}
    </div>
  );
}
