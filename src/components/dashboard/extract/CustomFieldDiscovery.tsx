import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, X, Loader2, Plus, Tag, Sparkles } from 'lucide-react';
import { localConfig, CustomExtractField } from '@/lib/config/local-store';
import { useAppStore } from '@/store/app-store';
import { DiscoveredField } from './types';

interface CustomFieldDiscoveryProps {
  /** Current custom extract fields; owned by the panel so extraction can read them. */
  customFields: CustomExtractField[];
  /** Called whenever the field list changes (add/remove/discover). */
  onFieldsChange: (fields: CustomExtractField[]) => void;
  /** Current JQL from the panel; scopes discovery when set. */
  jql: string;
}

/**
 * The "Custom Extract Fields" collapsible section: manual add/remove plus the
 * auto-discover dialog backed by /api/jira/fields/suggest.
 */
export const CustomFieldDiscovery = React.memo(function CustomFieldDiscovery({ customFields, onFieldsChange, jql }: CustomFieldDiscoveryProps) {
  const { connections, activeConnectionId } = useAppStore();
  const [newFieldId, setNewFieldId] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [showCustomFields, setShowCustomFields] = useState(false);

  // Auto-discover state
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredFields, setDiscoveredFields] = useState<DiscoveredField[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [discoverSearch, setDiscoverSearch] = useState('');

  const handleDiscover = async () => {
    if (!activeConnectionId) { toast.error('Select a connection first'); return; }
    const activeConn = connections.find(c => c.id === activeConnectionId);
    if (!activeConn) { toast.error('Active connection not found'); return; }

    setDiscovering(true);
    setDiscoveredFields([]);
    setSelectedDiscovered(new Set());
    setDiscoverSearch('');
    setDiscoverOpen(true);

    try {
      const res = await fetch('/api/jira/fields/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraCredentials: {
            baseUrl: activeConn.baseUrl,
            email: activeConn.email,
            apiToken: activeConn.apiToken,
            projectKeys: activeConn.projectKeys,
          },
          // Discover against the panel's current JQL, if any.
          jql: jql || '',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch fields');
      setDiscoveredFields(data.fields || []);
    } catch (e) {
      toast.error(`Discover failed: ${e instanceof Error ? e.message : String(e)}`);
      setDiscoverOpen(false);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddDiscovered = () => {
    const alreadyConfigured = new Set(customFields.map(f => f.fieldId));
    const toAdd: CustomExtractField[] = [];

    selectedDiscovered.forEach(fieldId => {
      if (alreadyConfigured.has(fieldId)) return;
      const found = discoveredFields.find(f => f.fieldId === fieldId);
      if (!found) return;
      toAdd.push({
        id: `cf-${Date.now()}-${fieldId}`,
        fieldId: found.fieldId,
        label: found.name,
        role: undefined,
      });
    });

    if (toAdd.length === 0) {
      toast.info('No new fields to add');
      return;
    }

    const updated = [...customFields, ...toAdd];
    onFieldsChange(updated);
    localConfig.saveCustomExtractFields(updated);
    toast.success(`Added ${toAdd.length} custom field${toAdd.length > 1 ? 's' : ''}`);
    setDiscoverOpen(false);
  };

  const handleAddManualField = () => {
    const trimmedId = newFieldId.trim();
    const trimmedLabel = newFieldLabel.trim();
    if (!trimmedId) { toast.error('Field ID is required'); return; }
    if (!trimmedLabel) { toast.error('Display label is required'); return; }
    if (customFields.some(f => f.fieldId === trimmedId)) {
      toast.error('This field ID is already added');
      return;
    }
    const roleVal = (document.getElementById('newFieldRole') as HTMLSelectElement)?.value || 'none';
    const newField: CustomExtractField = {
      id: `cf-${Date.now()}`,
      fieldId: trimmedId,
      label: trimmedLabel,
      role: roleVal === 'storyPoints' ? 'storyPoints'
        : roleVal === 'issueOwnerTeam' ? 'issueOwnerTeam'
        : roleVal === 'custom' ? 'custom'
        : undefined,
    };
    const updated = [...customFields, newField];
    onFieldsChange(updated);
    localConfig.saveCustomExtractFields(updated);
    setNewFieldId('');
    setNewFieldLabel('');
    toast.success(`Added custom field: ${trimmedLabel}`);
  };

  return (
    <>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center bg-slate-50 dark:bg-slate-800/50 border-b border-transparent">
          <button
            type="button"
            className="flex-1 flex items-center gap-2 p-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            onClick={() => setShowCustomFields(!showCustomFields)}
          >
            <Tag className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Custom Extract Fields</span>
            {customFields.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
                {customFields.length}
              </Badge>
            )}
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ml-auto ${showCustomFields ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-full px-3 rounded-none border-l border-slate-200 dark:border-slate-700 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 gap-1.5 text-xs"
            onClick={handleDiscover}
            title="Auto-discover custom fields from your Jira instance"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Discover
          </Button>
        </div>

        {showCustomFields && (
          <div className="p-3 space-y-3 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-1 duration-200">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Define custom Jira field IDs (e.g. <code className="text-violet-500 bg-violet-50 dark:bg-violet-500/10 px-1 rounded">customfield_12345</code>) to include in extraction.
            </p>

            {/* User-defined custom fields */}
            {customFields.length > 0 && (
              <div className="space-y-1.5">
                {customFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-violet-50/50 dark:bg-violet-500/5 border border-violet-200/50 dark:border-violet-500/15 group"
                  >
                    <code className="text-xs font-mono text-violet-600 dark:text-violet-400 shrink-0">{field.fieldId}</code>
                    <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{field.label}</span>
                    {field.role === 'storyPoints' && <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-400/30 text-amber-500 dark:text-amber-400 shrink-0">Story Points</Badge>}
                    {field.role === 'issueOwnerTeam' && <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-blue-400/30 text-blue-500 dark:text-blue-400 shrink-0">Issue Owner Team</Badge>}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = customFields.filter(f => f.id !== field.id);
                        onFieldsChange(updated);
                        localConfig.saveCustomExtractFields(updated);
                        toast.success(`Removed field: ${field.label}`);
                      }}
                      className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new field form */}
            <div className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-700 pt-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="customfield_12345"
                  value={newFieldId}
                  onChange={(e) => setNewFieldId(e.target.value)}
                  className="h-8 text-xs font-mono bg-white dark:bg-slate-900 flex-1"
                />
                <Input
                  placeholder="Display label"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-slate-900 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs border-violet-500/30 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 shrink-0"
                  onClick={handleAddManualField}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  id="newFieldRole"
                  className="h-7 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded px-2 w-full max-w-[200px]"
                >
                  <option value="none">No special role (Normal custom field)</option>
                  <option value="storyPoints">Map to Story Points</option>
                  <option value="issueOwnerTeam">Map to Issue Owner Team</option>
                </select>
                <span className="text-[10px] text-slate-500">Optional: Maps this field to built-in KPI logic</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Auto-Discover Custom Fields Dialog ── */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Discovered Custom Fields
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 text-xs">
              {jql
                ? 'Fields found on tickets matching your current JQL.'
                : 'All custom fields defined in your Jira instance (no JQL configured — showing full list).'}
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search by name or field ID…"
              value={discoverSearch}
              onChange={e => setDiscoverSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Field list */}
          <ScrollArea className="h-72 rounded-md border border-slate-200 dark:border-slate-700">
            {discovering ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-10 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                <span className="text-xs">Fetching fields from Jira…</span>
              </div>
            ) : discoveredFields.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400 py-10">
                No custom fields found.
              </div>
            ) : (() => {
              const alreadyConfigured = new Set(customFields.map(f => f.fieldId));
              const lower = discoverSearch.toLowerCase();
              const filtered = discoveredFields.filter(f =>
                !lower || f.fieldId.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower)
              );
              if (filtered.length === 0) return (
                <div className="flex items-center justify-center h-full text-xs text-slate-400 py-10">
                  No fields match your search.
                </div>
              );
              return (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(field => {
                    const isAlready = alreadyConfigured.has(field.fieldId);
                    const isSelected = selectedDiscovered.has(field.fieldId);
                    return (
                      <label
                        key={field.fieldId}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          isAlready
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-violet-50/50 dark:hover:bg-violet-500/5'
                        }`}
                      >
                        <Checkbox
                          checked={isAlready ? false : isSelected}
                          disabled={isAlready}
                          onCheckedChange={checked => {
                            if (isAlready) return;
                            setSelectedDiscovered(prev => {
                              const next = new Set(prev);
                              if (checked) { next.add(field.fieldId); } else { next.delete(field.fieldId); }
                              return next;
                            });
                          }}
                          className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{field.name}</p>
                          <code className="text-[10px] text-slate-400 dark:text-slate-500">{field.fieldId}</code>
                        </div>
                        {isAlready && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-slate-300/50 text-slate-400 shrink-0">Added</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </ScrollArea>

          <DialogFooter className="flex items-center justify-between gap-3 sm:justify-between">
            <p className="text-xs text-slate-400">
              {selectedDiscovered.size > 0
                ? `${selectedDiscovered.size} field${selectedDiscovered.size > 1 ? 's' : ''} selected`
                : `${discoveredFields.length} field${discoveredFields.length !== 1 ? 's' : ''} discovered`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setDiscoverOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white"
                disabled={selectedDiscovered.size === 0}
                onClick={handleAddDiscovered}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Selected ({selectedDiscovered.size})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
