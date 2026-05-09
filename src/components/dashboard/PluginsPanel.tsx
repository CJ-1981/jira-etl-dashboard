'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Wand2, Save, Plug, Plus, CheckCircle2, XCircle, Info, RefreshCw, Calculator, Trash2, Activity, Target, AlertTriangle, Sliders, GripVertical
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { localConfig, type KpiPlugin, AppSettings, DEFAULT_SETTINGS } from '@/lib/config/local-store';
import { GERMAN_STATES } from '@/lib/config/constants';
import { useAppStore } from '@/store/app-store';

const METRIC_TYPES = [
  { id: 'count', label: 'Count', icon: '🔢' },
  { id: 'avg', label: 'Average', icon: '📊' },
  { id: 'sum', label: 'Sum', icon: '➕' },
  { id: 'percentage', label: 'Percentage', icon: '％' },
  { id: 'time', label: 'Time-to-X', icon: '⏱️' },
];



function SortablePluginItem({ plugin, isActive, onToggle }: { plugin: KpiPlugin, isActive: boolean, onToggle: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: plugin.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`rounded-lg border transition-colors ${isActive ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-gray-100/50 dark:bg-slate-800/30'} p-3 flex items-center gap-3`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        <GripVertical className="h-4 w-4" />
      </div>
      <Checkbox id={`order-plugin-${plugin.id}`} checked={isActive} onCheckedChange={onToggle} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-sm truncate">{plugin.name}</h4>
          <Badge variant="secondary" className="text-[10px] py-0 h-4 px-1.5 opacity-70">{plugin.pluginType === 'builtin' ? 'Built-in' : 'Custom'}</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{plugin.description}</p>
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0">{plugin.unit}</Badge>
    </div>
  );
}

export function PluginsPanel() {
  const { settings, setSettings } = useAppStore();
  const [plugins, setPlugins] = useState<Record<string, KpiPlugin[]>>({});
  const [initialSettings, setInitialSettings] = useState<AppSettings>(settings);
  const [isInitialized, setIsInitialized] = useState(false);

  // Sync initialSettings once the store settings are loaded from localStorage
  useEffect(() => {
    if (!isInitialized && JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS)) {
      setInitialSettings(settings);
      setIsInitialized(true);
    }
  }, [settings, isInitialized]);
  const [loading, setLoading] = useState(false);
  const [activePlugins, setActivePlugins] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Unified Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderLanguage, setBuilderLanguage] = useState<'dsl' | 'javascript'>('dsl');
  const [builderData, setBuilderData] = useState({
    name: '',
    description: '',
    category: 'custom',
    unit: 'value',
    formula: '',
    metricType: 'count',
    statuses: [] as string[],
    priorities: [] as string[],
    issueTypes: [] as string[],
    assignees: [] as string[],
    customJql: '',
  });

  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const customPlugins = localConfig.getKpiPlugins();
      let allPlugins = [...customPlugins];
      try {
        const res = await fetch('/api/kpi/plugins');
        const data = await res.json();
        if (data.success && data.plugins) {
          const customIds = new Set(customPlugins.map(p => p.id));
          const builtins = data.plugins.filter((p: any) => !customIds.has(p.id));
          allPlugins = [...allPlugins, ...builtins];
        }
      } catch (err) {
        console.error('Failed to fetch built-in plugins:', err);
      }

      const grouped = allPlugins.reduce((acc, p: any) => {
        const cat = p.category || 'custom';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p as KpiPlugin);
        return acc;
      }, {} as Record<string, KpiPlugin[]>);

      if (isMounted.current) {
        setPlugins(grouped);
        const savedActivePlugins = localStorage.getItem('cfg_active_plugins');
        if (savedActivePlugins) {
          try {
            const activeIds = JSON.parse(savedActivePlugins) as string[];
            setActivePlugins(activeIds);
          } catch (err) {
            setActivePlugins(allPlugins.map(p => p.id));
          }
        } else {
          setActivePlugins(allPlugins.map(p => p.id));
        }
      }
    } catch {
      if (isMounted.current) toast.error('Failed to load plugins');
    }
    if (isMounted.current) setLoading(false);
  }, []);

  useEffect(() => { loadPlugins(); }, [loadPlugins]);

  const saveActivePlugins = useCallback((pluginIds: string[]) => {
    localStorage.setItem('cfg_active_plugins', JSON.stringify(pluginIds));
  }, []);

  const togglePlugin = useCallback((pluginId: string) => {
    setActivePlugins(prev => {
      let next;
      if (prev.includes(pluginId)) {
        next = prev.filter(id => id !== pluginId);
      } else {
        next = [...prev, pluginId];
      }
      saveActivePlugins(next);
      return next;
    });
  }, [saveActivePlugins]);

  const selectAllPlugins = useCallback(() => {
    const allPluginIds = Object.values(plugins).flat().map(p => p.id);
    setActivePlugins(allPluginIds);
    saveActivePlugins(allPluginIds);
  }, [plugins, saveActivePlugins]);

  const deselectAllPlugins = useCallback(() => {
    setActivePlugins([]);
    saveActivePlugins([]);
  }, [saveActivePlugins]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setActivePlugins((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        const next = arrayMove(items, oldIndex, newIndex);
        saveActivePlugins(next);
        return next;
      });
    }
  };

  const generateFormula = (): string => {
    const w = builderData;
    const filters: string[] = [];
    if (w.statuses.length > 0) filters.push(`status = "${w.statuses[0]}"`);
    if (w.priorities.length > 0) filters.push(`priority = "${w.priorities[0]}"`);
    const filterClause = filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : '';

    switch (w.metricType) {
      case 'count': return `COUNT(${filters.join(' AND ') || 'true'})`;
      case 'avg': return `AVG(storyPoints)${filterClause}`;
      case 'sum': return `SUM(storyPoints)${filterClause}`;
      case 'percentage': {
        const numFilter = filters.join(' AND ') || 'resolved = true';
        return `PERCENTAGE(${numFilter}) OF true`;
      }
      case 'time': return `AVG(storyPoints)${filterClause}`;
      default: return 'COUNT(true)';
    }
  };

  const handleCreate = () => {
    if (!builderData.name) { toast.error('Plugin Name is required'); return; }
    let finalFormula = builderData.formula || (builderLanguage === 'dsl' ? generateFormula() : '');
    if (!finalFormula) { toast.error('Formula/Code is required'); return; }

    try {
      const newPlugin: KpiPlugin = {
        id: `plugin-${Date.now()}`,
        name: builderData.name,
        description: builderData.description || `Custom ${builderLanguage} plugin`,
        category: builderData.category,
        unit: builderData.unit,
        formula: finalFormula,
        pluginType: 'custom',
        language: builderLanguage,
        isActive: true
      };
      const current = localConfig.getKpiPlugins();
      localConfig.saveKpiPlugins([...current, newPlugin]);
      toast.success(`Plugin "${builderData.name}" created`);
      setBuilderOpen(false);
      setBuilderData({
        name: '', description: '', category: 'custom', unit: 'value', formula: '',
        metricType: 'count', statuses: [], priorities: [], issueTypes: [], assignees: [], customJql: ''
      });
      loadPlugins();
    } catch {
      toast.error('Failed to create plugin');
    }
  };

  const categoryLabels: Record<string, { label: string; color: string }> = {
    processing_time: { label: 'Processing Time', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-400 border-blue-500/30' },
    turnaround: { label: 'Turnaround', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-400 border-purple-500/30' },
    throughput: { label: 'Throughput', color: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    sla: { label: 'SLA', color: 'bg-amber-100 dark:bg-amber-500/10 text-amber-400 border-amber-500/30' },
    quality: { label: 'Quality', color: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
    assignee: { label: 'Assignee', color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
    custom: { label: 'Custom', color: 'bg-rose-50 dark:bg-rose-500/10 text-rose-400 border-rose-500/30' },
  };

  const hasUnsavedSettings = JSON.stringify(settings) !== JSON.stringify(initialSettings);

  return (
    <div className="space-y-6">
      {/* Unified Builder Modal */}
      {builderOpen && (
        <Card className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-emerald-400" /> Plugin Builder</CardTitle>
              <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-700" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            </div>
            <CardDescription className="text-slate-600 dark:text-slate-400">Build a custom KPI plugin using the visual builder or raw JavaScript code</CardDescription>
            <div className="flex items-center gap-2 mt-4 p-1 bg-gray-100 dark:bg-slate-800 rounded-md w-max">
              <button onClick={() => setBuilderLanguage('dsl')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${builderLanguage === 'dsl' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Visual Builder (DSL)</button>
              <button onClick={() => setBuilderLanguage('javascript')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${builderLanguage === 'javascript' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Code (JavaScript)</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Plugin Name</Label><Input placeholder="e.g. Critical Bug Resolution" value={builderData.name} onChange={(e) => setBuilderData({ ...builderData, name: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" /></div>
              <div className="space-y-2"><Label>Description</Label><Input placeholder="What does this KPI measure?" value={builderData.description} onChange={(e) => setBuilderData({ ...builderData, description: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Category</Label><Select value={builderData.category} onValueChange={(v) => setBuilderData({ ...builderData, category: v })}><SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="processing_time">Processing Time</SelectItem><SelectItem value="turnaround">Turnaround</SelectItem><SelectItem value="throughput">Throughput</SelectItem><SelectItem value="sla">SLA</SelectItem><SelectItem value="quality">Quality</SelectItem><SelectItem value="assignee">Assignee</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Unit</Label><Input placeholder="hours, %, tickets" value={builderData.unit} onChange={(e) => setBuilderData({ ...builderData, unit: e.target.value })} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" /></div>
            </div>
            <Separator className="bg-slate-200 dark:bg-slate-700" />
            {builderLanguage === 'dsl' ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Metric Type</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {METRIC_TYPES.map((mt) => (
                      <div key={mt.id} onClick={() => setBuilderData({ ...builderData, metricType: mt.id })} className={`rounded-lg border p-3 cursor-pointer transition-all hover:border-emerald-500/50 ${builderData.metricType === mt.id ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                        <div className="text-xl mb-1">{mt.icon}</div>
                        <p className="font-semibold text-xs">{mt.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Filters</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-xs">Status (comma-separated)</Label><Input placeholder="Done, Closed" value={builderData.statuses.join(', ')} onChange={(e) => setBuilderData({ ...builderData, statuses: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-sm h-8" /></div>
                    <div className="space-y-2"><Label className="text-xs">Priority (comma-separated)</Label><Input placeholder="High, Highest" value={builderData.priorities.join(', ')} onChange={(e) => setBuilderData({ ...builderData, priorities: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-sm h-8" /></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Formula DSL Preview</Label>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-500" onClick={() => setBuilderData({ ...builderData, formula: generateFormula() })}><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</Button>
                  </div>
                  <textarea className="w-full min-h-[60px] rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 text-sm text-emerald-400 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder={generateFormula()} value={builderData.formula || generateFormula()} onChange={(e) => setBuilderData({ ...builderData, formula: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Label className="text-base font-semibold text-emerald-600 dark:text-emerald-400">JavaScript Implementation</Label>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 mb-2 text-sm text-blue-800 dark:text-blue-300">
                  <p className="font-semibold mb-1">Context signature:</p>
                  <code className="bg-white/50 dark:bg-black/20 px-1 py-0.5 rounded text-xs">function calculate(context: {'{'} issues: JiraIssue[], period: {'{'}start, end{'}'}, holidays: ... {'}'}): number | KpiResult[]</code>
                  <p className="mt-2 text-xs opacity-80">Return a number, or an array of result objects: <code>[{'{'} name: 'My KPI', value: 42, unit: 'hours' {'}'}]</code></p>
                </div>
                <textarea
                  className="w-full min-h-[250px] rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-4 text-sm text-emerald-400 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder={`// Example: Count resolved bugs\n\nconst bugs = context.issues.filter(i => i.issueType === 'Bug' && i.resolved);\nreturn bugs.length;`}
                  value={builderData.formula}
                  onChange={(e) => setBuilderData({ ...builderData, formula: e.target.value })}
                />
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto" onClick={handleCreate} disabled={!builderData.name}>
                <Save className="mr-2 h-4 w-4" />Save Plugin
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-emerald-400" /> KPI Plugin Registry</CardTitle>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setBuilderOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Create
              </Button>
            </div>
            <CardDescription>Select which KPIs to calculate and display</CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && Object.keys(plugins).length > 0 && (
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                <Badge variant="outline" className="text-xs">{activePlugins.length} active</Badge>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-[10px] h-7 px-2" onClick={selectAllPlugins}>All</Button>
                  <Button variant="outline" size="sm" className="text-[10px] h-7 px-2" onClick={deselectAllPlugins}>None</Button>
                </div>
              </div>
            )}
            {loading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-gray-100 dark:bg-slate-800" />)}</div> : (
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.entries(plugins).map(([category, pluginList]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2"><Badge className={categoryLabels[category]?.color || categoryLabels['custom']?.color}>{categoryLabels[category]?.label || category}</Badge><span className="text-xs text-slate-400 dark:text-slate-500">{pluginList.length}</span></div>
                    <div className="space-y-2">{pluginList.map((plugin) => (
                      <div key={plugin.id} className={`rounded-lg border transition-colors ${activePlugins.includes(plugin.id) ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-gray-100/50 dark:bg-slate-800/30'} p-3`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <Checkbox id={`plugin-${plugin.id}`} checked={activePlugins.includes(plugin.id)} onCheckedChange={() => togglePlugin(plugin.id)} className="flex-shrink-0" />
                            <div onClick={() => togglePlugin(plugin.id)} className="flex-1 cursor-pointer">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm">{plugin.name}</h4>
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 px-1.5 opacity-70">{plugin.pluginType === 'builtin' ? 'Built-in' : 'Custom'}</Badge>
                                {plugin.language === 'javascript' && <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30 py-0 h-4 px-1.5">JS</Badge>}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plugin.description}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0">{plugin.unit}</Badge>
                        </div>
                      </div>
                    ))}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sliders className="h-5 w-5 text-emerald-400" /> KPI Display Order</CardTitle>
            <CardDescription>Drag and drop to reorder active KPIs on the dashboard</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col">
            {activePlugins.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-12">
                <Sliders className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No active plugins to reorder</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={activePlugins}
                    strategy={verticalListSortingStrategy}
                  >
                    {activePlugins.map((id) => {
                      const plugin = Object.values(plugins).flat().find(p => p.id === id);
                      if (!plugin) return null;
                      return (
                        <SortablePluginItem 
                          key={id} 
                          plugin={plugin} 
                          isActive={true} 
                          onToggle={() => togglePlugin(id)} 
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" /> SLA Targets by Status</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Define target hours per workflow status. Configure whose comments can reset the SLA clock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-400">
              <Info className="inline h-3 w-3 mr-1" />
              {settings.sla?.useAnyoneCommentsForSla
                ? 'When anyone comments on a ticket during a status, the SLA clock resets to that comment. This includes comments from the assignee, team members, or other stakeholders.'
                : 'When the assignee comments on a ticket during a status, the SLA clock resets to that comment. Comments from others are ignored.'}
            </p>
          </div>
          <div className="py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Comment Rule for SLA Clock Reset
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose which comments can reset the SLA clock during a status period
              </p>
              <RadioGroup
                value={settings.sla?.useAnyoneCommentsForSla ? 'anyone' : 'assignee'}
                onValueChange={(value) => {
                  const sla = settings.sla ?? {};
                  setSettings({
                    ...settings,
                    sla: { ...sla, useAnyoneCommentsForSla: value === 'anyone' }
                  });
                }}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="assignee" id="sla-assignee">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" data-state={settings.sla?.useAnyoneCommentsForSla === false ? "checked" : "unchecked"}></div>
                        <Label htmlFor="sla-assignee" className={`text-sm cursor-pointer ${settings.sla?.useAnyoneCommentsForSla === false ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                          Assignee only
                        </Label>
                      </div>
                    </RadioGroupItem>
                    <p className={`text-xs ${settings.sla?.useAnyoneCommentsForSla === false ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400'}`}>Only assignee comments</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="anyone" id="sla-anyone">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" data-state={settings.sla?.useAnyoneCommentsForSla === true ? "checked" : "unchecked"}></div>
                        <Label htmlFor="sla-anyone" className={`text-sm cursor-pointer ${settings.sla?.useAnyoneCommentsForSla === true ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                          Anyone
                        </Label>
                      </div>
                    </RadioGroupItem>
                    <p className={`text-xs ${settings.sla?.useAnyoneCommentsForSla === true ? 'text-slate-700 dark:text-slate-300 font-medium' : 'text-slate-400'}`}>Any comment</p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                const activeConn = localConfig.getActiveConnectionId();
                if (!activeConn) { toast.error('Select a connection first'); return; }
                const storageCfg = localConfig.getStorageConfig();
                const res = await fetch(`/api/jira/master/${activeConn}`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'get', storageConfig: storageCfg })
                });
                const data = await res.json();
                if (!data.success || !data.data?.issues) { toast.error('No extraction data found'); return; }
                const statusSet = new Set<string>();
                for (const issue of data.data.issues) {
                  const changelog = issue.changelog?.histories || [];
                  for (const h of changelog) for (const item of h.items) if (item.field === 'status' && item.toString) statusSet.add(item.toString);
                  if (issue.fields?.status?.name) statusSet.add(issue.fields.status.name);
                }
                const sla = settings.sla ?? {};
                const currentTargets = { ...(sla.statusTargets || {}) };
                for (const s of statusSet) if (!(s in currentTargets)) currentTargets[s] = 0;
                setSettings({ ...settings, sla: { ...sla, statusTargets: currentTargets } });
                toast.success(`Detected ${statusSet.size} unique statuses`);
              } catch { toast.error('Failed to detect statuses'); }
            }} className="border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"><Activity className="mr-2 h-4 w-4" /> Detect Statuses from Data</Button>
            <span className="text-xs text-slate-400">{Object.keys(settings.sla?.statusTargets || {}).length} statuses configured</span>
          </div>
          {Object.keys(settings.sla?.statusTargets || {}).length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(settings.sla?.statusTargets || {}).sort(([a], [b]) => a.localeCompare(b)).map(([status, hours]) => (
                <div key={status} className="flex items-center gap-3">
                  <Badge variant="outline" className="w-48 shrink-0 justify-start text-xs truncate">{status}</Badge>
                  <Input type="number" min="0" value={hours ?? ''} onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    const sla = settings.sla ?? {};
                    const statusTargets = sla.statusTargets ?? {};
                    setSettings({ ...settings, sla: { ...sla, statusTargets: { ...statusTargets, [status]: val } } });
                }} className="w-28 h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <span className="text-xs text-slate-400">hours</span>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" onClick={() => {
                  const sla = settings.sla ?? {};
                  const updated = { ...(sla.statusTargets || {}) }; 
                  delete updated[status];
                  setSettings({ ...settings, sla: { ...sla, statusTargets: updated } });
                  }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => {
            localConfig.saveSettings(settings);
            setInitialSettings(settings);
            toast.success('SLA targets saved');
          }} className="bg-amber-600 hover:bg-amber-700" disabled={!hasUnsavedSettings}><Save className="mr-2 h-4 w-4" /> Save SLA Targets</Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-400" /> KPI Calculation Defaults</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Configure default values for KPI calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="space-y-2">
              <Label>Default German State</Label>
              <Select value={settings.general?.defaultHolidayState} onValueChange={(v) => {
                const general = settings.general ?? {};
                setSettings({ ...settings, general: { ...general, defaultHolidayState: v } });
              }}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>{GERMAN_STATES.map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Work hours start</Label>
              <Input 
                type="number" 
                value={settings.general?.workStartHour} 
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) val = 9;
                  val = Math.max(0, Math.min(23, val));
                  const general = settings.general ?? {};
                  const end = general.workEndHour || 17;
                  if (val >= end) val = end - 1;
                  setSettings({ ...settings, general: { ...general, workStartHour: val } });
                }} 
                className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
              />
            </div>
            <div className="space-y-2">
              <Label>Work hours end</Label>
              <Input 
                type="number" 
                value={settings.general?.workEndHour} 
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) val = 17;
                  val = Math.max(1, Math.min(24, val));
                  const general = settings.general ?? {};
                  const start = general.workStartHour || 9;
                  if (val <= start) val = start + 1;
                  setSettings({ ...settings, general: { ...general, workEndHour: val } });
                }} 
                className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
              />
            </div>
            <div className="space-y-2">
              <Label>Default SLA target (hours)</Label>
              <Input 
                type="number" 
                value={settings.general?.defaultSlaTargetHours} 
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) val = 40;
                  val = Math.max(1, val);
                  const general = settings.general ?? {};
                  setSettings({ ...settings, general: { ...general, defaultSlaTargetHours: val } });
                }} 
                className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" 
              />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button onClick={() => {
              localConfig.saveSettings(settings); setInitialSettings(settings);
              toast.success('KPI Defaults saved');
            }} className="bg-blue-600 hover:bg-blue-700" disabled={!hasUnsavedSettings}><Save className="mr-2 h-4 w-4" /> Save KPI Defaults</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" /> 
            KPI Alert Thresholds
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Define warning and critical limits for specific metrics to highlight performance issues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                const availableKpis = Object.values(plugins).flat().map(p => p.id);
                const currentThresholds = { ...(settings.alerts?.thresholds || {}) };
                let added = 0;
                availableKpis.forEach(id => {
                  if (!currentThresholds[id]) {
                    currentThresholds[id] = { warning: NaN, critical: NaN, operator: '>' };
                    added++;
                  }
                });
                if (added > 0) {
                  const alerts = settings.alerts ?? {};
                  setSettings({ ...settings, alerts: { ...alerts, thresholds: currentThresholds } });
                  toast.success(`Added ${added} KPI alert placeholders`);
                } else {
                  toast.info('All available KPIs already have thresholds');
                }
              }}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Alert for all KPIs
            </Button>
            <span className="text-xs text-slate-400">
              {Object.keys(settings.alerts?.thresholds || {}).length} alerts configured
            </span>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {(Object.entries(settings.alerts?.thresholds || {}) as [string, { warning: number; critical: number; operator: '>' | '<' }][]).map(([pluginId, config]) => {
              const plugin = Object.values(plugins).flat().find(p => p.id === pluginId);
              const label = plugin?.name || pluginId;
              
              return (
                <div key={pluginId} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate text-slate-700 dark:text-slate-200">{label}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{pluginId}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-slate-500 w-12">Operator</Label>
                    <Select 
                      value={config.operator} 
                      onValueChange={(v: any) => {
                        const alerts = settings.alerts ?? {};
                        const updated = { ...(alerts.thresholds || {}) };
                        updated[pluginId] = { ...config, operator: v };
                        setSettings({ ...settings, alerts: { ...alerts, thresholds: updated } });
                      }}
                    >
                      <SelectTrigger className="h-8 w-16 text-xs bg-white dark:bg-slate-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value=">">{'>'}</SelectItem>
                        <SelectItem value="<">{'<'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-amber-500 w-14">Warning</Label>
                    <Input 
                      type="number" 
                      value={isNaN(config.warning) ? '' : config.warning} 
                      onChange={(e) => {
                        const alerts = settings.alerts ?? {};
                        const updated = { ...(alerts.thresholds || {}) };
                        updated[pluginId] = { ...config, warning: parseFloat(e.target.value) };
                        setSettings({ ...settings, alerts: { ...alerts, thresholds: updated } });
                      }}
                      className="h-8 w-20 text-xs bg-white dark:bg-slate-950" 
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-red-500 w-12">Critical</Label>
                    <Input 
                      type="number" 
                      value={isNaN(config.critical) ? '' : config.critical} 
                      onChange={(e) => {
                        const alerts = settings.alerts ?? {};
                        const updated = { ...(alerts.thresholds || {}) };
                        updated[pluginId] = { ...config, critical: parseFloat(e.target.value) };
                        setSettings({ ...settings, alerts: { ...alerts, thresholds: updated } });
                      }}
                      className="h-8 w-20 text-xs bg-white dark:bg-slate-950" 
                    />
                  </div>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-500" 
                    onClick={() => {
                      const alerts = settings.alerts ?? {};
                      const updated = { ...(alerts.thresholds || {}) };
                      delete updated[pluginId];
                      setSettings({ ...settings, alerts: { ...alerts, thresholds: updated } });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button 
              onClick={() => {
                localConfig.saveSettings(settings);
                setInitialSettings(settings);
                toast.success('Alert thresholds saved');
              }} 
              className="bg-red-600 hover:bg-red-700" 
              disabled={!hasUnsavedSettings}
            >
              <Save className="mr-2 h-4 w-4" /> Save Alert Thresholds
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
