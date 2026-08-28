'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RotateCcw, Check, Loader2 } from 'lucide-react';
import { JqlAutocomplete } from '../JqlAutocomplete';
import { JqlFilter } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { localConfig } from '@/lib/config/local-store';

interface JqlFilterSettingsProps {
  widgetId: string;
  widgetType: 'chart' | 'card';
  currentFilter: JqlFilter;
  onSave: (filter: JqlFilter) => void;
  onCancel: () => void;
}

export function JqlFilterSettings({
  widgetId,
  widgetType,
  currentFilter,
  onSave,
  onCancel,
}: JqlFilterSettingsProps) {
  const { dashboardJqlQuery, masterDatasetInfo } = useAppStore();
  const [enabled, setEnabled] = useState(currentFilter.enabled);
  const [query, setQuery] = useState(currentFilter.query);
  const [mode, setMode] = useState<'override' | 'refine'>(currentFilter.mode);
  const [isApplying, setIsApplying] = useState(false);

  // Get filter options for autocomplete
  const filterOptions = {
    project: masterDatasetInfo?.issues?.map((i: any) => i.fields?.project?.name || i.fields?.project?.key || i.project || i.key?.split('-')[0]).filter(Boolean) ?? [],
    assignee: masterDatasetInfo?.issues?.map((i: any) => i.fields?.assignee?.displayName || i.fields?.assignee?.name || i.assignee).filter(Boolean) ?? [],
    priority: masterDatasetInfo?.issues?.map((i: any) => i.fields?.priority?.name || i.priority).filter(Boolean) ?? [],
    issueType: masterDatasetInfo?.issues?.map((i: any) => i.fields?.issuetype?.name || i.issueType).filter(Boolean) ?? [],
    status: masterDatasetInfo?.issues?.map((i: any) => i.fields?.status?.name || i.status).filter(Boolean) ?? [],
    component: masterDatasetInfo?.issues?.flatMap((i: any) => i.fields?.components?.map((c: any) => c.name) || i.components).filter(Boolean) ?? [],
    label: masterDatasetInfo?.issues?.flatMap((i: any) => i.fields?.labels || i.labels).filter(Boolean) ?? [],
  };

  const handleApply = async () => {
    console.log('[JqlFilterSettings] Applying filter:', { enabled, query, mode });
    setIsApplying(true);
    const newFilter: JqlFilter = {
      enabled,
      query: enabled ? query : '',
      mode,
    };
    try {
      await onSave(newFilter);
      console.log('[JqlFilterSettings] Filter saved successfully');
    } catch (error) {
      console.error('[JqlFilterSettings] Error saving filter:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const handleClear = () => {
    setEnabled(false);
    setQuery('');
    setMode('refine');
  };

  const handlePresetSelect = (presetQuery: string) => {
    setEnabled(true);
    setQuery(presetQuery);
  };

  const savedJqls = localConfig.getDashboardJqls();

  console.log('[JqlFilterSettings] Rendering for widget:', widgetId, 'currentFilter:', currentFilter);

  return (
    <div className="w-[min(400px,calc(100vw-2rem))] max-w-full p-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-lg rounded-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-2 border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">JQL Filter Settings</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-6 px-2 text-[10px]"
          >
            Cancel
          </Button>
        </div>

        {/* Enable Toggle */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-slate-900 dark:text-slate-100">Filter Mode</Label>
          <RadioGroup value={enabled ? 'custom' : 'global'} onValueChange={(v) => setEnabled(v === 'custom')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="global" id="global" />
              <Label htmlFor="global" className="text-xs cursor-pointer flex-1 text-slate-900 dark:text-slate-100">
                Use Global JQL
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                  {dashboardJqlQuery || 'No global filter set'}
                </span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="text-xs cursor-pointer flex-1 text-slate-900 dark:text-slate-100">
                Custom JQL
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                  Apply independent filter to this {widgetType}
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Custom JQL Settings */}
        {enabled && (
          <>
            {/* Mode Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-900 dark:text-slate-100">How to apply custom JQL</Label>
              <RadioGroup value={mode} onValueChange={(v: 'override' | 'refine') => setMode(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="override" id="override" />
                  <Label htmlFor="override" className="text-xs cursor-pointer flex-1 text-slate-900 dark:text-slate-100">
                    Override Global
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      Ignore global filter, use only this JQL
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="refine" id="refine" />
                  <Label htmlFor="refine" className="text-xs cursor-pointer flex-1 text-slate-900 dark:text-slate-100">
                    Add to Global (AND)
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      Combine with global filter
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* JQL Input */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-900 dark:text-slate-100">JQL Query</Label>
              <JqlAutocomplete
                value={query}
                onChange={setQuery}
                placeholder="Enter JQL (e.g., project = PROJ-A AND status = 'In Progress')"
                filterOptions={filterOptions}
                className="text-xs"
              />
            </div>

            {/* Presets */}
            {savedJqls.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-900 dark:text-slate-100">Or select a saved JQL</Label>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {savedJqls.map((jql) => (
                    <button
                      key={jql.id}
                      onClick={() => handlePresetSelect(jql.query)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors truncate"
                      title={jql.query}
                    >
                      <span className="font-medium">{jql.name}</span>
                      <span className="block text-[10px] text-slate-400 truncate">
                        {jql.query}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!enabled}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset to Global
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isApplying || (enabled && !query.trim())}
            className="h-7 text-xs"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check className="h-3 w-3 mr-1" />
                Apply
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
