'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  transformForBarChart,
  transformForPieChart,
  transformForLineChart,
  getKpiOptions,
  getRecommendedChartType,
  formatChartValue,
  isTimeSeriesPlugin,
  CHART_COLORS,
} from '@/lib/chart-data-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Database, RefreshCw, Download, Settings, BarChart3,
  Clock, AlertTriangle, TrendingUp, Zap, Plug, Calendar,
  CheckCircle2, XCircle, Loader2, Plus, Trash2, FileJson,
  FileSpreadsheet, Activity, Target, Timer, ArrowRight,
  Server, Key, FolderOpen, ChevronRight, Info, ExternalLink,
  HardDrive, Table, Upload, Workflow, Shield, Cable,
  Play, Pause, RotateCw, ChevronLeft, Wand2, Sliders,
  Save, SaveAll, Gauge, Sun, Moon, Globe, Send,
  LayoutDashboard, Radio, LayoutGrid, Edit2, Ticket, GripVertical,
  Calculator,
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JiraConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiToken: string;
  email: string;
  projectKeys: string;
  isActive: boolean;
}

interface PgConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
  schemaName: string;
  tableName: string;
  isActive: boolean;
}

interface MetabaseConnection {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  apiKey: string | null;
  isActive: boolean;
}

interface MetabaseDatabase {
  id: number;
  name: string;
  engine: string;
}

interface ExtractedIssue {
  key: string;
  summary: string;
  issueType: string;
  priority?: string;
  status: string;
  assignee?: string;
  reporter?: string;
  created: string;
  updated: string;
  resolved?: string;
  dueDate?: string;
  storyPoints?: number;
  labels?: string[];
  components?: string[];
  changelog?: {
    histories: Array<{
      items: Array<{ field: string; fromString?: string; toString?: string }>;
      created: string;
    }>;
  };
}

interface KpiPluginInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
}

interface KpiCalcResult {
  pluginId: string;
  results: Array<{
    name: string;
    value: number;
    unit: string;
    dimensions?: Record<string, string>;
    details?: Array<{ label: string; value: number; unit?: string }>;
  }>;
}

interface PollingStatus {
  enabled: boolean;
  connectionId: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  status: string;
  lastError: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const GERMAN_STATES = [
  { code: 'national', label: 'National Only' },
  { code: 'all', label: 'All States' },
  { code: 'BW', label: 'Baden-Wuerttemberg' },
  { code: 'BY', label: 'Bayern' },
  { code: 'BE', label: 'Berlin' },
  { code: 'BB', label: 'Brandenburg' },
  { code: 'HB', label: 'Bremen' },
  { code: 'HH', label: 'Hamburg' },
  { code: 'HE', label: 'Hessen' },
  { code: 'MV', label: 'Mecklenburg-Vorpommern' },
  { code: 'NI', label: 'Niedersachsen' },
  { code: 'NW', label: 'Nordrhein-Westfalen' },
  { code: 'RP', label: 'Rheinland-Pfalz' },
  { code: 'SL', label: 'Saarland' },
  { code: 'SN', label: 'Sachsen' },
  { code: 'ST', label: 'Sachsen-Anhalt' },
  { code: 'SH', label: 'Schleswig-Holstein' },
  { code: 'TH', label: 'Thueringen' },
];

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Home() {
  // Start with dark to match SSR, then sync with client preference on mount
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('jira-etl-theme');
    const preferred = saved
      ? (saved as 'light' | 'dark')
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(preferred);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('jira-etl-theme', theme);
  }, [theme, mounted]);

  const [activeTab, setActiveTab] = useState('connections');
  const [connections, setConnections] = useState<JiraConnection[]>([]);
  const [extractionResult, setExtractionResult] = useState<{
    total: number; etlRunId: string; issues: ExtractedIssue[];
  } | null>(null);
  const [masterDatasetInfo, setMasterDatasetInfo] = useState<{
    totalExtracted: number; dateRange?: { from: string; to: string }; lastUpdated: string;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [region, setRegion] = useState('national');
  const [activeConnectionId, setActiveConnectionId] = useState<string>('');
  const [settings, setSettings] = useState<any>(null);
  const [kpiResults, setKpiResults] = useState<any>([]);

  useEffect(() => {
    // Load connections
    fetch('/api/jira/connections')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setConnections(d.connections);
          // Auto-select first connection if none selected
          if (d.connections.length > 0 && !activeConnectionId) {
            setActiveConnectionId(d.connections[0].id);
          }
        }
      });

    // Load general settings to set default region
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          if (d.settings?.general?.defaultHolidayState) {
            setRegion(d.settings.general.defaultHolidayState);
          }
          // Store full settings for KPI dashboard
          setSettings(d.settings);
        }
      });
  }, []);

  // Handle connection switching and auto-restore
  useEffect(() => {
    if (!activeConnectionId) return;

    const handleConnectionSwitch = async () => {
      // Clear KPI results when connection changes
      setKpiResults([]);

      // Check if auto-restore is enabled
      const settingsRes = await fetch('/api/settings');
      const settingsData = await settingsRes.json();

      if (!settingsData.success || !settingsData.settings?.persistence?.autoRestore) {
        // Auto-restore disabled, clear results
        setExtractionResult(null);
        return;
      }

      // Try to load extraction for this connection
      try {
        const res = await fetch(`/api/jira/extract/latest/${activeConnectionId}`);
        const data = await res.json();

        if (data.success && data.data) {
          // Load the extraction for this connection
          setExtractionResult({
            total: data.data.totalExtracted,
            etlRunId: data.data.etlRunId,
            issues: data.data.issues,
          });
          setDateFrom(data.data.dateFrom || '');
          setDateTo(data.data.dateTo || '');

          // Calculate oldest ticket date for better feedback
          const dates = data.data.issues
            .map((i: any) => i.fields?.created || i.created)
            .filter((d: any) => d)
            .map((d: any) => new Date(d).getTime());
          const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;

          // Show appropriate message based on whether we had previous data
          if (extractionResult) {
            // Had previous data (switching connections)
            toast.info(
              `Loaded ${data.data.totalExtracted} issues${oldestDate ? ` from ${oldestDate.toLocaleDateString()}` : ''}`
            );
          } else {
            // No previous data (page load)
            toast.success(
              `Restored ${data.data.totalExtracted} issues${oldestDate ? ` from ${oldestDate.toLocaleDateString()}` : ''}`
            );
          }
        } else {
          // No extraction for this connection, clear results
          setExtractionResult(null);
          if (extractionResult) {
            toast.info('No saved data for this connection - extract to see results');
          }
        }
      } catch (error) {
        console.log('Failed to load extraction for connection:', error);
        setExtractionResult(null);
      }

      // Load master dataset info
      try {
        const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`);
        const masterData = await masterRes.json();

        if (masterData.success && masterData.data) {
          setMasterDatasetInfo({
            totalExtracted: masterData.data.totalExtracted,
            dateRange: masterData.data.dateRange,
            lastUpdated: masterData.data.lastUpdated
          });
        } else {
          setMasterDatasetInfo(null);
        }
      } catch (error) {
        console.log('Failed to load master dataset info:', error);
        setMasterDatasetInfo(null);
      }
    };

    handleConnectionSwitch();
  }, [activeConnectionId]); // Only depend on activeConnectionId

  const handleSettingsUpdate = (newSettings: any) => {
    if (newSettings?.general?.defaultHolidayState) {
      setRegion(newSettings.general.defaultHolidayState);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Jira ETL Dashboard</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Jira Extract and KPI Engine with German Holiday</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Active Connection Selector */}
            <div className="hidden sm:block">
              <Select value={activeConnectionId} onValueChange={setActiveConnectionId}>
                <SelectTrigger className="h-8 w-48 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700">
                  <SelectValue placeholder="Select connection..." className="text-xs" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mobile connection button */}
            <div className="sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('connections')}
                className="h-8 border-slate-200 dark:border-slate-700"
              >
                <Server className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="h-8 w-8 p-0">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
            </Button>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5">
              <Activity className="mr-1 h-3 w-3" />
              Plugin System Active
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Sticky Tab Navigation */}
          <div className="sticky top-0 z-50 bg-white dark:bg-slate-900 py-2">
            <TabsList className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 h-auto flex flex-wrap sm:flex-nowrap gap-1 justify-start overflow-x-auto no-scrollbar shadow-sm">
              <TabsTrigger value="connections" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Server className="h-4 w-4" />
                <span className="hidden sm:inline">Connections</span>
              </TabsTrigger>
              <TabsTrigger value="extract" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Extract</span>
              </TabsTrigger>
              <TabsTrigger value="kpi" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">KPI Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="plugins" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Plug className="h-4 w-4" />
                <span className="hidden sm:inline">Plugins</span>
              </TabsTrigger>
              <TabsTrigger value="holidays" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Holidays</span>
              </TabsTrigger>
              <TabsTrigger value="export" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <FileJson className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="connections" className="space-y-6">
            <ConnectionsPanel
              connections={connections}
              setConnections={setConnections}
              activeConnectionId={activeConnectionId}
              setActiveConnectionId={setActiveConnectionId}
            />
          </TabsContent>

          <TabsContent value="extract" className="space-y-6">
            <ExtractPanel
              connections={connections}
              extractionResult={extractionResult}
              setExtractionResult={setExtractionResult}
              masterDatasetInfo={masterDatasetInfo}
              setMasterDatasetInfo={setMasterDatasetInfo}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              activeConnectionId={activeConnectionId}
              settings={settings}
              setSettings={setSettings}
              setKpiResults={setKpiResults}
            />
          </TabsContent>

          <TabsContent value="kpi" className="space-y-6">
            <KpiDashboard
              connections={connections}
              extractionResult={extractionResult}
              masterDatasetInfo={masterDatasetInfo}
              setMasterDatasetInfo={setMasterDatasetInfo}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              region={region}
              setRegion={setRegion}
              activeConnectionId={activeConnectionId}
              settings={settings}
              kpiResults={kpiResults}
              setKpiResults={setKpiResults}
            />
          </TabsContent>

          <TabsContent value="plugins" className="space-y-6">
            <PluginsPanel />
          </TabsContent>

          <TabsContent value="holidays" className="space-y-6">
            <HolidaysPanel region={region} setRegion={setRegion} />
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <ExportPanel
              extractionResult={extractionResult}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
              region={region}
              setRegion={setRegion}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <SettingsPanel onSettingsUpdate={handleSettingsUpdate} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─── Connections Panel ────────────────────────────────────────────────────────

interface SortableConnectionItemProps {
  connection: JiraConnection;
  index: number;
  handleTest: (conn: JiraConnection) => void;
  handleEdit: (conn: JiraConnection) => void;
  handleDelete: (id: string) => void;
  testing: string | null;
  testStatus: Record<string, 'success' | 'error' | null>;
}

function SortableConnectionItem({
  connection,
  index,
  handleTest,
  handleEdit,
  handleDelete,
  testing,
  testStatus,
}: SortableConnectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: connection.id });

  const style = transform
    ? {
        transform: `translateY(${transform.y}px)`,
        transition,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 p-3 hover:border-slate-200 dark:border-slate-700 transition-colors">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 mr-2"
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm truncate">{connection.name}</h4>
                <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30 shrink-0">JIRA</Badge>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{connection.baseUrl}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => handleTest(connection)} disabled={testing === connection.id} className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs">
            {testing === connection.id ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className={`h-3 w-3 mr-1 ${testStatus[connection.id] === 'success' ? 'text-emerald-500' : testStatus[connection.id] === 'error' ? 'text-red-500' : ''}`} />
            )}Test
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleEdit(connection)} className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs">
            <Edit2 className="h-3 w-3 mr-1" />Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleDelete(connection.id)} className="border-red-200 dark:border-red-900/30 text-red-400 hover:bg-red-50 dark:bg-red-900/20 text-xs">
            <Trash2 className="h-3 w-3 mr-1" />Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConnectionsPanel({ connections, setConnections, activeConnectionId, setActiveConnectionId }: {
  connections: JiraConnection[];
  setConnections: any;
  activeConnectionId: string;
  setActiveConnectionId: (id: string) => void;
}) {
  const [pgConnections, setPgConnections] = useState<PgConnection[]>([]);
  const [metabaseConnections, setMetabaseConnections] = useState<MetabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testingPg, setTestingPg] = useState<string | null>(null);
  const [testingMb, setTestingMb] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = connections.findIndex((c) => c.id === active.id);
      const newIndex = connections.findIndex((c) => c.id === over.id);

      const newConnections = arrayMove(connections, oldIndex, newIndex);
      setConnections(newConnections);

      // Update orders in database
      const reorderedConnections = newConnections.map((conn, index) => ({
        id: conn.id,
        order: index,
      }));

      try {
        await fetch('/api/jira/connections', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connections: reorderedConnections }),
        });
        toast.success('Connections reordered');
      } catch (error) {
        toast.error('Failed to save new order');
        // Revert on error
        setConnections(connections);
      }
    }
  };

  const [form, setForm] = useState({
    name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [pgForm, setPgForm] = useState({
    name: '', host: '', port: '5432', database: '', username: '', password: '',
    sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results',
  });
  const [editingPgId, setEditingPgId] = useState<string | null>(null);

  const [mbForm, setMbForm] = useState({
    name: '', baseUrl: '', username: '', password: '', apiKey: '',
  });
  const [editingMbId, setEditingMbId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const [jiraRes, pgRes, mbRes] = await Promise.all([
        fetch('/api/jira/connections'),
        fetch('/api/pg/connections'),
        fetch('/api/metabase/connections'),
      ]);
      const jiraData = await jiraRes.json();
      const pgData = await pgRes.json();
      const mbData = await mbRes.json();
      if (jiraData.success) setConnections(jiraData.connections);
      if (pgData.success) setPgConnections(pgData.connections);
      if (mbData.success) setMetabaseConnections(mbData.connections);
    } catch {
      toast.error('Failed to load connections');
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleSaveJira = async () => {
    if (!form.name || !form.baseUrl || !form.apiToken || !form.email) {
      toast.error('All fields except Project Keys are required'); return;
    }
    try {
      const method = editingId ? 'PUT' : 'POST';
      const bodyPayload = {
        ...form,
        projectKeys: form.projectKeys.split(',').map((k) => k.trim()),
        ...(editingId ? { id: editingId } : {})
      };

      const res = await fetch('/api/jira/connections', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingId ? 'Jira connection updated' : 'Jira connection saved');
        setForm({ name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '' });
        setEditingId(null);
        loadConnections();
      } else toast.error(data.error);
    } catch { toast.error('Network error'); }
  };

  const handleEdit = (conn: JiraConnection) => {
    setForm({
      name: conn.name,
      baseUrl: conn.baseUrl,
      apiToken: conn.apiToken,
      email: conn.email,
      projectKeys: conn.projectKeys,
    });
    setEditingId(conn.id);
  };

  const handleSavePg = async () => {
    if (!pgForm.name || !pgForm.host || !pgForm.database || !pgForm.username) {
      toast.error('Name, host, database, and username are required'); return;
    }

    // Check for Supabase pooler URL and warn user
    if (pgForm.host.includes('.pooler.supabase.com')) {
      toast.error('Please use the direct connection URL (db.<project-ref>.supabase.co), not the pooler URL. Pooler URLs require additional parameters.', { duration: 5000 });
      return;
    }

    // Password is required for new connections, but optional for updates
    if (!editingPgId && !pgForm.password) {
      toast.error('Password is required for new connections'); return;
    }
    try {
      const url = editingPgId ? `/api/pg/connections?id=${editingPgId}` : '/api/pg/connections';
      const method = editingPgId ? 'PUT' : 'POST';

      // Build payload - only include password if creating new connection or if user typed a new password
      const payload: any = {
        name: pgForm.name,
        host: pgForm.host,
        port: parseInt(pgForm.port) || 5432,
        database: pgForm.database,
        username: pgForm.username,
        sslMode: pgForm.sslMode,
        schemaName: pgForm.schemaName,
        tableName: pgForm.tableName,
      };

      // Only send password if creating new connection OR if user typed a new password (not empty)
      if (!editingPgId || pgForm.password.trim() !== '') {
        payload.password = pgForm.password;
      }

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingPgId ? 'PostgreSQL connection updated' : 'PostgreSQL connection saved');
        setPgForm({ name: '', host: '', port: '5432', database: '', username: '', password: '', sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results' });
        setEditingPgId(null);
        loadConnections();
      } else toast.error(data.error);
    } catch { toast.error('Network error'); }
  };

  const handleEditPg = (conn: any) => {
    setPgForm({
      name: conn.name,
      host: conn.host,
      port: conn.port.toString(),
      database: conn.database,
      username: conn.username,
      password: '', // Start empty - user only types if they want to change
      sslMode: conn.sslMode || 'prefer',
      schemaName: conn.schemaName || 'public',
      tableName: conn.tableName || 'jira_kpi_results',
    });
    setEditingPgId(conn.id);
  };

  const handleTest = async (conn: JiraConnection) => {
    setTesting(conn.id);
    setTestStatus(prev => ({ ...prev, [conn.id]: null }));
    try {
      const res = await fetch('/api/jira/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: conn.baseUrl, apiToken: conn.apiToken, email: conn.email }),
      });
      const data = await res.json();

      if (data.success) {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'success' }));
        const serverInfo = data.serverInfo as Record<string, unknown>;
        const serverTitle = (serverInfo?.serverTitle as string) || conn.baseUrl;
        const deploymentType = (serverInfo?.deploymentType as string) || 'Unknown';
        const version = (serverInfo?.version as string) || 'Unknown';
        const responseTime = data.diagnostics?.responseTime || 'N/A';

        // Show detailed success message with sonner
        toast.success(`✅ Connected to ${serverTitle}`, {
          description: `Jira ${deploymentType} (v${version}) - ${responseTime}`,
          duration: 5000,
          position: 'top-right'
        });

        // Also log to console for debugging
        console.log('✅ Connection Test Successful:', {
          connection: conn.name,
          serverTitle,
          deploymentType,
          version,
          responseTime,
          serverInfo
        });
      } else {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
        // Show detailed error message
        const errorMessage = data.error || 'Connection failed';
        const suggestions = data.diagnostics?.suggestions as string[] || [];

        toast.error(`❌ Connection Failed`, {
          description: errorMessage,
          duration: 5000,
          position: 'top-right'
        });

        // Log suggestions to console
        if (suggestions.length > 0) {
          console.log('❌ Connection Test Failed. Suggestions:', suggestions);
        }
      }
    } catch (error) {
      setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
      toast.error('❌ Network Error', {
        description: 'Could not reach the test server',
        duration: 5000,
        position: 'top-right'
      });
      console.error('Connection test error:', error);
    }
    setTesting(null);
  };

  const handleTestPg = async (conn: PgConnection) => {
    // Check for Supabase pooler URL and warn user before testing
    if (conn.host.includes('.pooler.supabase.com')) {
      toast.error('Cannot test pooler URL. Please use the direct connection URL (db.<project-ref>.supabase.co)', { duration: 5000 });
      return;
    }

    setTestingPg(conn.id);
    setTestStatus(prev => ({ ...prev, [conn.id]: null }));
    try {
      const res = await fetch('/api/pg/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conn.id }),
      });
      const data = await res.json();

      if (data.success) {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'success' }));
        const serverInfo = data.serverInfo as Record<string, unknown>;
        const version = (serverInfo?.version as string) || 'Unknown';
        const database = (serverInfo?.database as string) || conn.database;
        const user = (serverInfo?.user as string) || 'Unknown';
        const responseTime = data.diagnostics?.responseTime || 'N/A';

        // Show detailed success message
        toast.success(`✅ Connected to PostgreSQL`, {
          description: `${conn.host}:${conn.port}/${database} (User: ${user}) - ${responseTime}`,
          duration: 5000,
          position: 'top-right'
        });

        console.log('✅ PostgreSQL Connection Test Successful:', {
          connection: conn.name,
          host: conn.host,
          port: conn.port,
          database,
          user,
          version: version.split(' ')[0],
          responseTime
        });
      } else {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
        const errorMessage = data.error || 'Connection failed';
        const suggestions = data.diagnostics?.suggestions as string[] || [];

        toast.error(`❌ Connection Failed`, {
          description: errorMessage,
          duration: 5000,
          position: 'top-right'
        });

        if (suggestions.length > 0) {
          console.log('❌ PostgreSQL Connection Test Failed. Suggestions:', suggestions);
        }
      }
    } catch (error) {
      setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
      toast.error('❌ Network Error', {
        description: 'Could not reach the test server',
        duration: 5000,
        position: 'top-right'
      });
      console.error('PostgreSQL connection test error:', error);
    }
    setTestingPg(null);
  };

  const handleDelete = async (id: string) => {
    const connection = connections.find(c => c.id === id);
    if (!connection) return;

    if (!confirm(`Are you sure you want to delete connection "${connection.name}"?\n\nThis will also delete all associated extraction data (ETL runs, tickets, transitions). This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/jira/connections?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const message = data.deleted?.etlRuns > 0
          ? `Connection "${connection.name}" deleted (cleaned up ${data.deleted.etlRuns} extractions)`
          : `Connection "${connection.name}" deleted`;
        toast.success(message);
        loadConnections();
      } else {
        toast.error(data.error || 'Failed to delete connection');
      }
    } catch (error) {
      toast.error('Failed to delete connection');
      console.error('Delete connection error:', error);
    }
  };

  const handleDeletePg = async (id: string) => {
    if (!confirm('Are you sure you want to delete this PostgreSQL connection?')) {
      return;
    }
    await fetch(`/api/pg/connections?id=${id}`, { method: 'DELETE' });
    toast.success('PG connection deactivated'); loadConnections();
  };

  const handleSaveMb = async () => {
    if (!mbForm.name || !mbForm.baseUrl || !mbForm.username) {
      toast.error('Name, URL, and username are required'); return;
    }
    // Password is required for new connections, but optional for updates
    if (!editingMbId && !mbForm.password) {
      toast.error('Password is required for new connections'); return;
    }
    try {
      const url = editingMbId ? `/api/metabase/connections?id=${editingMbId}` : '/api/metabase/connections';
      const method = editingMbId ? 'PUT' : 'POST';

      // Build payload - only include password if creating new connection or if user typed a new password
      const payload: any = {
        action: 'save',
        name: mbForm.name,
        baseUrl: mbForm.baseUrl,
        username: mbForm.username,
        apiKey: mbForm.apiKey,
      };

      // Only send password if creating new connection OR if user typed a new password (not empty)
      if (!editingMbId || mbForm.password.trim() !== '') {
        payload.password = mbForm.password;
      }

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingMbId ? 'Metabase connection updated' : 'Metabase connection saved');
        setMbForm({ name: '', baseUrl: '', username: '', password: '', apiKey: '' });
        setEditingMbId(null);
        loadConnections();
      } else toast.error(data.error);
    } catch { toast.error('Network error'); }
  };

  const handleEditMb = (conn: any) => {
    setMbForm({
      name: conn.name,
      baseUrl: conn.baseUrl,
      username: conn.username,
      password: '', // Start empty - user only types if they want to change
      apiKey: conn.apiKey || '',
    });
    setEditingMbId(conn.id);
  };

  const handleTestMb = async (conn: MetabaseConnection) => {
    setTestingMb(conn.id);
    setTestStatus(prev => ({ ...prev, [conn.id]: null }));
    try {
      const res = await fetch('/api/metabase/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testById', id: conn.id }),
      });
      const data = await res.json();

      if (data.success) {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'success' }));
        const version = data.version as string || 'Unknown';
        const databaseCount = data.databases?.length || 0;
        const userEmail = data.user?.email as string || conn.username;

        // Show detailed success message
        toast.success(`✅ Connected to Metabase`, {
          description: `v${version} — ${databaseCount} databases, user: ${userEmail}`,
          duration: 5000,
          position: 'top-right'
        });

        console.log('✅ Metabase Connection Test Successful:', {
          connection: conn.name,
          version,
          databaseCount,
          userEmail
        });
      } else {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
        toast.error(`❌ Connection Failed`, {
          description: data.error || 'Authentication failed',
          duration: 5000,
          position: 'top-right'
        });

        console.log('❌ Metabase Connection Test Failed:', {
          connection: conn.name,
          error: data.error
        });
      }
    } catch (error) {
      setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
      toast.error('❌ Network Error', {
        description: 'Could not reach the test server',
        duration: 5000,
        position: 'top-right'
      });
      console.error('Metabase connection test error:', error);
    }
    setTestingMb(null);
  };

  const handleDeleteMb = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Metabase connection?')) {
      return;
    }
    await fetch(`/api/metabase/connections?id=${id}`, { method: 'DELETE' });
    toast.success('Metabase connection deactivated'); loadConnections();
  };

  return (
    <div className="space-y-6">
      {/* Active Connection Selector */}
      <Card className="border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-emerald-400" />
            Active Connection
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Select the Jira connection to use for extraction and polling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={activeConnectionId} onValueChange={setActiveConnectionId}>
            <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectValue placeholder="Select a connection..." />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.projectKeys})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeConnectionId && (
            <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-2">
              ✓ Using {connections.find(c => c.id === activeConnectionId)?.name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Jira Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editingId ? <Edit2 className="h-5 w-5 text-emerald-400" /> : <Plus className="h-5 w-5 text-emerald-400" />}
              {editingId ? 'Edit Jira Connection' : 'Add Jira Connection'}
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">Configure your Jira Cloud or Server instance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Connection Name</Label>
              <Input placeholder="e.g. Company Jira Cloud" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Jira Base URL</Label>
              <Input placeholder="https://your-domain.atlassian.net" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Email</Label>
                <Input placeholder="user@company.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">API Token</Label>
                <Input placeholder="Your Jira API token" type="password" value={form.apiToken} onChange={(e) => setForm({ ...form, apiToken: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Project Keys (comma-separated)</Label>
              <Input placeholder="e.g. PROJ, DEV, OPS" value={form.projectKeys} onChange={(e) => setForm({ ...form, projectKeys: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveJira} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <Server className="mr-2 h-4 w-4" /> {editingId ? 'Update Connection' : 'Save Jira Connection'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm({ name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '' }); }}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-emerald-400" /> Saved Connections</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">Manage your data source connections</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full bg-gray-100 dark:bg-slate-800" />)}</div>
            ) : connections.length === 0 && pgConnections.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No connections configured yet</p>
              </div>
            ) : (
              <ScrollArea>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1 mb-1 flex items-center justify-between">
                    <span>Jira Connections</span>
                    <span className="text-[10px] font-normal text-slate-400">Drag grip to reorder</span>
                  </p>
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={connections.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {connections.map((conn, index) => (
                        <SortableConnectionItem
                          key={conn.id}
                          connection={conn}
                          index={index}
                          handleTest={handleTest}
                          handleEdit={handleEdit}
                          handleDelete={handleDelete}
                          testing={testing}
                          testStatus={testStatus}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {pgConnections.length > 0 && (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-4 mb-1">PostgreSQL Connections</p>
                  )}
                  {pgConnections.map((conn) => (
                    <div key={conn.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 p-3 hover:border-slate-200 dark:border-slate-700 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm truncate">{conn.name}</h4>
                            <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30 shrink-0">POSTGRES</Badge>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{conn.host}:{conn.port}/{conn.database}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={() => handleTestPg(conn)} disabled={testingPg === conn.id} className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs">
                          {testingPg === conn.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className={`h-3 w-3 mr-1 ${testStatus[conn.id] === 'success' ? 'text-emerald-500' : testStatus[conn.id] === 'error' ? 'text-red-500' : ''}`} />
                          )}Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEditPg(conn)} className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs">
                          <Edit2 className="h-3 w-3 mr-1" />Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeletePg(conn.id)} className="border-red-200 dark:border-red-900/30 text-red-400 hover:bg-red-50 dark:bg-red-900/20 text-xs">
                          <Trash2 className="h-3 w-3 mr-1" />Remove
                        </Button>
                      </div>
                    </div>
                  ))}

                  {metabaseConnections.length > 0 && (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-4 mb-1">Metabase Connections</p>
                  )}
                  {metabaseConnections.map((conn) => (
                    <div key={conn.id} className="rounded-lg border border-cyan-500/20 dark:border-cyan-500/10 bg-cyan-50 dark:bg-cyan-500/5 p-3 hover:border-cyan-500/30 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm truncate">{conn.name}</h4>
                            <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 shrink-0">METABASE</Badge>
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{conn.baseUrl}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={() => handleTestMb(conn)} disabled={testingMb === conn.id} className="border-cyan-500/30 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 text-xs text-cyan-400">
                          {testingMb === conn.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className={`h-3 w-3 mr-1 ${testStatus[conn.id] === 'success' ? 'text-emerald-500' : testStatus[conn.id] === 'error' ? 'text-red-500' : ''}`} />
                          )}Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEditMb(conn)} className="border-cyan-500/30 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 text-xs text-cyan-400">
                          <Edit2 className="h-3 w-3 mr-1" />Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteMb(conn.id)} className="border-red-200 dark:border-red-900/30 text-red-400 hover:bg-red-50 dark:bg-red-900/20 text-xs">
                          <Trash2 className="h-3 w-3 mr-1" />Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PostgreSQL Connection Form */}
      <Card className="border-violet-500/20 bg-violet-50 dark:bg-violet-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingPgId ? <Edit2 className="h-5 w-5 text-violet-400" /> : <HardDrive className="h-5 w-5 text-violet-400" />}
            {editingPgId ? 'Edit PostgreSQL Connection' : 'Add PostgreSQL Connection'}
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Connect to an external PostgreSQL database to push KPI data directly. Ideal for production Metabase setups with large or complex datasets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Connection Name</Label>
              <Input placeholder="e.g. Metabase DB" value={pgForm.name} onChange={(e) => setPgForm({ ...pgForm, name: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Host</Label>
              <Input placeholder="e.g. db.example.com" value={pgForm.host} onChange={(e) => setPgForm({ ...pgForm, host: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Port</Label>
              <Input placeholder="5432" value={pgForm.port} onChange={(e) => setPgForm({ ...pgForm, port: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Database</Label>
              <Input placeholder="e.g. metabase_analytics" value={pgForm.database} onChange={(e) => setPgForm({ ...pgForm, database: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Username</Label>
              <Input placeholder="e.g. analytics_user" value={pgForm.username} onChange={(e) => setPgForm({ ...pgForm, username: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Password</Label>
              <Input
                placeholder={editingPgId ? "Leave empty to keep existing password" : "Database password"}
                type="password"
                value={pgForm.password}
                onChange={(e) => setPgForm({ ...pgForm, password: e.target.value })}
                className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">SSL Mode</Label>
              <Select value={pgForm.sslMode} onValueChange={(v) => setPgForm({ ...pgForm, sslMode: v })}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disable">Disable</SelectItem>
                  <SelectItem value="prefer">Prefer (default)</SelectItem>
                  <SelectItem value="require">Require</SelectItem>
                  <SelectItem value="verify-ca">Verify CA</SelectItem>
                  <SelectItem value="verify-full">Verify Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Schema</Label>
              <Input placeholder="public" value={pgForm.schemaName} onChange={(e) => setPgForm({ ...pgForm, schemaName: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Table Name</Label>
              <Input placeholder="jira_kpi_results" value={pgForm.tableName} onChange={(e) => setPgForm({ ...pgForm, tableName: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSavePg} className="flex-1 bg-violet-600 hover:bg-violet-700">
              <HardDrive className="mr-2 h-4 w-4" /> {editingPgId ? 'Update Connection' : 'Save PostgreSQL Connection'}
            </Button>
            {editingPgId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingPgId(null);
                  setPgForm({ name: '', host: '', port: '5432', database: '', username: '', password: '', sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results' });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metabase Connection Form */}
      <Card className="border-cyan-500/20 bg-cyan-50 dark:bg-cyan-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {editingMbId ? <Edit2 className="h-5 w-5 text-cyan-400" /> : <Globe className="h-5 w-5 text-cyan-400" />}
            {editingMbId ? 'Edit Metabase Connection' : 'Add Metabase Connection'}
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            Connect to your Metabase instance for direct data push, auto-sync, and dashboard card creation. Supports both session auth (username/password) and API key authentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Connection Name</Label>
              <Input placeholder="e.g. Production Metabase" value={mbForm.name} onChange={(e) => setMbForm({ ...mbForm, name: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Metabase URL</Label>
              <Input placeholder="https://metabase.example.com" value={mbForm.baseUrl} onChange={(e) => setMbForm({ ...mbForm, baseUrl: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Username</Label>
              <Input placeholder="Metabase username" value={mbForm.username} onChange={(e) => setMbForm({ ...mbForm, username: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Password</Label>
              <Input
                placeholder={editingMbId ? "Leave empty to keep existing password" : "Metabase password"}
                type="password"
                value={mbForm.password}
                onChange={(e) => setMbForm({ ...mbForm, password: e.target.value })}
                className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">API Key <span className="text-slate-400 dark:text-slate-500 text-xs">(optional)</span></Label>
              <Input placeholder="X-API-Key (alternative to session)" value={mbForm.apiKey} onChange={(e) => setMbForm({ ...mbForm, apiKey: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
            </div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3">
            <div className="flex items-center gap-2 mb-2"><Info className="h-3.5 w-3.5 text-cyan-400" /><span className="text-xs font-semibold text-slate-700 dark:text-slate-300">How it works</span></div>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>Uploads KPI data as CSV directly into Metabase (creates a new table)</span></li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>Triggers a database sync so Metabase picks up the new data immediately</span></li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>Optionally auto-creates a Metabase question (card) from the pushed table</span></li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>Requires Metabase admin privileges for data upload and card creation</span></li>
            </ul>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveMb} className="flex-1 bg-cyan-600 hover:bg-cyan-700">
              <Globe className="mr-2 h-4 w-4" /> {editingMbId ? 'Update Connection' : 'Save Metabase Connection'}
            </Button>
            {editingMbId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingMbId(null);
                  setMbForm({ name: '', baseUrl: '', username: '', password: '', apiKey: '' });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Extract Panel ────────────────────────────────────────────────────────────

function ExtractPanel({
  connections, extractionResult, setExtractionResult, masterDatasetInfo, setMasterDatasetInfo,
  dateFrom, setDateFrom, dateTo, setDateTo,
  activeConnectionId, settings, setSettings, setKpiResults
}: {
  connections: JiraConnection[],
  extractionResult: any,
  setExtractionResult: any,
  masterDatasetInfo: any,
  setMasterDatasetInfo: any,
  dateFrom: string, setDateFrom: any,
  dateTo: string, setDateTo: any,
  activeConnectionId: string,
  settings: any,
  setSettings: any,
  setKpiResults: any,
}) {
  const [jql, setJql] = useState('');
  const [extracting, setExtracting] = useState(false);

  // Persistence state
  const [saveThisExtraction, setSaveThisExtraction] = useState(true);

  // Polling state
  const [polling, setPolling] = useState<PollingStatus | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollInterval, setPollInterval] = useState('15');
  const [pollSaving, setPollSaving] = useState(false);

  // Load polling status
  React.useEffect(() => {
    const loadPolling = () => {
      fetch('/api/jira/poll').then((r) => r.json()).then((d) => {
        if (d.success) {
          setPolling(d.polling);
          setPollEnabled(d.polling.enabled);
          setPollInterval(String(d.polling.intervalMinutes));
        }
      });
    };
    loadPolling();
    const timer = setInterval(loadPolling, 5000);
    return () => clearInterval(timer);
  }, []);

  // Load settings for persistence
  React.useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setSettings(d.settings);
          setSaveThisExtraction(d.settings.persistence?.autoSave ?? true);
        }
      })
      .catch(() => console.log('Failed to load settings'));
  }, []);

  const handleExtract = async (daysBack?: number) => {
    if (!activeConnectionId) { toast.error('Please select a connection in the Connections tab'); return; }
    setExtracting(true); setExtractionResult(null); setKpiResults([]);

    // Show loading toast
    const loadingToast = toast.loading('Extracting issues from Jira...', { duration: 0 });

    try {
      const body: Record<string, unknown> = {
        connectionId: activeConnectionId,
        jql: jql || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        saveExtraction: saveThisExtraction,
      };
      if (daysBack) body.daysBack = daysBack;

      const res = await fetch('/api/jira/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      const data = await res.json();

      if (res.ok && data.success) {
        setExtractionResult({ total: data.summary.totalExtracted, etlRunId: data.etlRunId, issues: data.issues });
        const saveMsg = saveThisExtraction ? ' and saved to database' : '';
        toast.success(`Extracted ${data.summary.totalExtracted} issues${saveMsg}`);

        // Reload master dataset info after extraction
        try {
          const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`);
          const masterData = await masterRes.json();
          if (masterData.success && masterData.data) {
            setMasterDatasetInfo({
              totalExtracted: masterData.data.totalExtracted,
              dateRange: masterData.data.dateRange,
              lastUpdated: masterData.data.lastUpdated
            });
          }
        } catch (error) {
          console.log('Failed to reload master dataset info:', error);
        }
      } else {
        // Handle different error codes with specific messages
        if (res.status === 401) {
          toast.error('Authentication failed. Please check your Jira credentials.', { duration: 5000 });
        } else if (res.status === 429) {
          toast.error('Rate limit exceeded. Increase delay in settings and try again.', { duration: 5000 });
        } else if (res.status === 503 || res.status === 504) {
          toast.error('Jira server unavailable or timeout. Try reducing the date range or batch size.', { duration: 5000 });
        } else {
          toast.error(data.error || `Extraction failed (${res.status})`, { duration: 5000 });
        }
      }
    } catch (networkError) {
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      console.error('Network error:', networkError);
      toast.error('Network error: Unable to reach the server. Check your connection.', { duration: 5000 });
    } finally {
      setExtracting(false);
    }
  };

  const handleQuickPull = (days: number) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  };

  const handleCustomDaysBack = () => {
    const days = parseInt((document.getElementById('customDaysBack') as HTMLInputElement)?.value || '0', 10);
    if (days > 0) {
      handleQuickPull(days);
      toast.success(`Set date range to last ${days} days`);
    } else {
      toast.error('Please enter a valid number of days');
    }
  };

  const handleTogglePolling = async (targetState?: boolean) => {
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !pollEnabled;

    if (nextEnabled && !activeConnectionId) {
      toast.error('Select a connection first');
      setPollEnabled(false);
      return;
    }

    setPollSaving(true);
    try {
      const res = await fetch('/api/jira/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: nextEnabled ? activeConnectionId : null,
          intervalMinutes: parseInt(pollInterval) || 15,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          jql: jql || undefined,
          enabled: nextEnabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPolling(data.polling);
        setPollEnabled(data.polling.enabled);
        toast.success(data.polling.enabled ? 'Polling started' : 'Polling stopped');
      } else {
        toast.error(data.error);
        setPollEnabled(polling?.enabled || false);
      }
    } catch {
      toast.error('Failed to update polling');
      setPollEnabled(polling?.enabled || false);
    }
    setPollSaving(false);
  };

  const quickPullButtons = [
    { label: 'Since yesterday', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 365 days', days: 365 },
  ];

  const intervalOptions = [
    { label: '5 min', value: '5' },
    { label: '15 min', value: '15' },
    { label: '30 min', value: '30' },
    { label: '1 hr', value: '60' },
    { label: '4 hr', value: '240' },
  ];

  return (
    <div className="space-y-6">
      {/* Feature 1: Quick Pull */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-400" /> ETL Extract</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Extract issues from Jira with full changelog for KPI analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Connection Display */}
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 p-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                {activeConnectionId ? (
                  <div>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-400">
                      {connections.find(c => c.id === activeConnectionId)?.name}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-500">
                      {connections.find(c => c.id === activeConnectionId)?.projectKeys}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700 dark:text-emerald-500">
                    No connection selected. Go to <span className="font-semibold">Connections tab</span> to select one.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 dark:text-slate-300">Custom JQL Query <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">(optional)</span></Label>
            <textarea className="w-full min-h-[80px] rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-800 dark:text-slate-200 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder='project = "PROJ" AND created >= "2024-01-01" ORDER BY created DESC' value={jql} onChange={(e) => setJql(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 pr-10" />
            </div>
          </div>

          {/* Per-extraction save override */}
          {settings && !settings.persistence?.autoSave && (
            <div className="flex items-center space-x-2 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
              <Checkbox
                id="saveThisExtraction"
                checked={saveThisExtraction}
                onCheckedChange={(checked) => setSaveThisExtraction(checked as boolean)}
              />
              <div className="flex-1">
                <label
                  htmlFor="saveThisExtraction"
                  className="text-sm font-medium text-amber-900 dark:text-amber-400 cursor-pointer"
                >
                  Save this extraction
                </label>
                <p className="text-xs text-amber-700 dark:text-amber-500">
                  Override global setting for this extraction only
                </p>
              </div>
            </div>
          )}

          <Button onClick={() => handleExtract()} disabled={extracting || !activeConnectionId} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting Issues...</> : <><RefreshCw className="mr-2 h-4 w-4" />Run ETL Extraction</>}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Pull Section */}
      <Card className="border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><RotateCw className="h-5 w-5 text-emerald-400" /> Quick Pull</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Auto-fill date range for a baseline data pull</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {quickPullButtons.map((btn) => (
              <Button key={btn.days} variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 text-sm" onClick={() => handleQuickPull(btn.days)}>
                {btn.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input id="customDaysBack" type="number" placeholder="Custom days back" className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-40" min="1" />
            <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-100 dark:bg-emerald-500/10" onClick={handleCustomDaysBack}>
              Pull Baseline
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature 2: Polling Card */}
      <Card className="border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-amber-400" /> Polling</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Automatically extract data at a configured interval</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch checked={pollEnabled} onCheckedChange={(v) => handleTogglePolling(v)} disabled={pollSaving} className="data-[state=checked]:bg-amber-600" />
              <Label className="text-slate-700 dark:text-slate-300">{pollEnabled ? 'Polling Active' : 'Polling Disabled'}</Label>
            </div>
            <div className="flex items-center gap-2">
              {polling?.status === 'running' && <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />}
              <Badge variant="outline" className={polling?.enabled ? 'text-emerald-400 border-emerald-500/30' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}>
                {polling?.status || 'idle'}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Interval</Label>
              <Select value={pollInterval} onValueChange={setPollInterval} disabled={!pollEnabled}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {intervalOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Status Info</Label>
              <div className="rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Last run:</span><span className="text-slate-700 dark:text-slate-300">{polling?.lastRunAt ? new Date(polling.lastRunAt).toLocaleTimeString() : 'Never'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Next run:</span><span className="text-slate-700 dark:text-slate-300">{polling?.nextRunAt ? new Date(polling.nextRunAt).toLocaleTimeString() : 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Run count:</span><span className="text-amber-400 font-mono">{polling?.runCount || 0}</span></div>
                {polling?.lastError && <div className="text-red-400 mt-1">Error: {polling.lastError}</div>}
              </div>
            </div>
          </div>
          <Button onClick={() => handleTogglePolling()} disabled={pollSaving || (!pollEnabled && !activeConnectionId)} className={pollEnabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
            {pollSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : pollEnabled ? <><Pause className="mr-2 h-4 w-4" />Stop Polling</> : <><Play className="mr-2 h-4 w-4" />Start Polling</>}
          </Button>
        </CardContent>
      </Card>

      {extractionResult && (
        <Card className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Extraction Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{extractionResult.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Extracted</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">
                  {extractionResult.issues.filter((i: any) => {
                    if (i.fields?.resolutiondate || i.resolved) return true;
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    return ['done', 'closed', 'close', 'resolved'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {extractionResult.issues.filter((i: any) => {
                    if (i.fields?.resolutiondate || i.resolved) return false;
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    return !['done', 'closed', 'close', 'resolved'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Oldest</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(() => {
                    const dates = extractionResult.issues
                      .map((i: any) => i.fields?.created || i.created)
                      .filter((d: any) => d)
                      .map((d: any) => new Date(d).getTime());
                    const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
                    return oldestDate ? oldestDate.toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {extractionResult.issues.map((issue: any) => {
                const activeConnection = connections.find(c => c.id === activeConnectionId);

                // Ensure baseUrl has protocol
                const baseUrl = activeConnection?.baseUrl || '';
                const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                const isResolved = (() => {
                  if (issue.fields?.resolutiondate || issue.resolved) return true;
                  const status = (issue.fields?.status?.name || issue.status || '').toLowerCase();
                  return ['done', 'closed', 'close', 'resolved'].includes(status);
                })();

                return (
                  <div key={issue.key} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50 text-sm group">
                    <a
                      href={jiraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-xs font-mono shrink-0 flex items-center gap-1 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {issue.key}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <span className="truncate text-slate-700 dark:text-slate-300 flex-1">{issue.fields?.summary || issue.summary}</span>
                    <Badge variant={isResolved ? 'default' : 'secondary'} className={`text-xs shrink-0 ${isResolved ? 'bg-blue-600' : 'bg-600'}`}>{issue.fields?.status?.name || issue.status}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── KPI Dashboard (unchanged from previous version) ─────────────────────────

function KpiDashboard({
  connections, extractionResult, masterDatasetInfo, setMasterDatasetInfo, dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion, activeConnectionId, settings, kpiResults, setKpiResults
}: any) {
  const [calculating, setCalculating] = useState(false);

  // Chart section state
  const [charts, setCharts] = useState<ChartConfig[]>([
    { id: 'chart-1', kpiId: '', type: 'bar', width: 'md' }
  ]);

  const handleAddChart = () => {
    if (charts.length >= 6) {
      toast.error('Maximum 6 charts allowed');
      return;
    }
    const newChart: ChartConfig = {
      id: `chart-${Date.now()}`,
      kpiId: '',
      type: 'bar',
      width: 'md',
    };
    setCharts([...charts, newChart]);
  };

  const handleRemoveChart = (chartId: string) => {
    if (charts.length === 1) {
      toast.error('At least one chart must remain');
      return;
    }
    setCharts(charts.filter((c) => c.id !== chartId));
  };

  const handleUpdateChart = (chartId: string, newConfig: ChartConfig) => {
    setCharts(charts.map((c) => (c.id === chartId ? newConfig : c)));
  };

  const handleCalculate = async () => {
    if (!activeConnectionId) { toast.error('No active connection. Please select a connection first.'); return; }
    setCalculating(true); setKpiResults([]);

    try {
      // Load master dataset (all historical tickets)
      const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`);
      const masterData = await masterRes.json();

      if (!masterData.success || !masterData.data?.issues) {
        toast.error('No master dataset found. Please extract data first to build the master dataset.');
        setCalculating(false);
        return;
      }

      const issues = masterData.data.issues;

      // Calculate KPIs on the full master dataset
      const kpiRes = await fetch('/api/kpi/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: issues,
          holidays: {
            regions: region === 'all' ? [] : [region],
            slaTargetHours: settings?.general?.defaultSlaTargetHours || 40
          },
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        }),
      });

      const kpiData = await kpiRes.json();
      if (kpiData.success) {
        setKpiResults(kpiData.results);
        const dateRange = masterData.data.dateRange;
        const ticketCount = issues.length;
        toast.success(
          `Calculated ${Object.keys(kpiData.results).length} KPI categories using ${ticketCount} tickets ` +
          `${dateRange?.from ? `from ${new Date(dateRange.from).toLocaleDateString()} ` : ''}` +
          `${dateRange?.to ? `to ${new Date(dateRange.to).toLocaleDateString()}` : ''}`
        );
      }
    } catch { toast.error('Error during KPI calculation'); }
    setCalculating(false);
  };

  const mainKpis = kpiResults.filter((r) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !isTimeSeriesPlugin(r.pluginId));
  const statusKpis = kpiResults.filter((r) => r.results[0]?.dimensions?.status && !isTimeSeriesPlugin(r.pluginId));
  const priorityKpis = kpiResults.filter((r) => r.results[0]?.dimensions?.priority && !isTimeSeriesPlugin(r.pluginId));

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-400" /> KPI Calculation Engine</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Calculate KPIs with German holiday awareness</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Master Dataset</Label>
              <div className="h-10 flex items-center px-3 bg-gray-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                {masterDatasetInfo ? (
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">{masterDatasetInfo.totalExtracted} Tickets</span>
                    {masterDatasetInfo.dateRange?.from && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {new Date(masterDatasetInfo.dateRange.from).toLocaleDateString()} - {new Date(masterDatasetInfo.dateRange.to).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">No master dataset</span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label className="text-slate-700 dark:text-slate-300">Period</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateFrom || ''}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full"
                  />
                </div>
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateTo || ''}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GERMAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCalculate} disabled={calculating || !extractionResult} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {calculating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating...</> : <><Zap className="mr-2 h-4 w-4" />Calculate All KPIs</>}
          </Button>
        </CardContent>
      </Card>

      {kpiResults.length > 0 && (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mainKpis.map((kpi) => kpi.results.map((result, idx) => (<KpiCard key={`${kpi.pluginId}-${idx}`} result={result} pluginId={kpi.pluginId} />)))}
        </div>
        {statusKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader><CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5 text-blue-400" />Turnaround Time by Status</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">{statusKpis.map((kpi) => kpi.results.map((result, idx) => {
                const maxVal = Math.max(...statusKpis.flatMap((k) => k.results.map((r) => r.value)), 1);
                return (<div key={`${kpi.pluginId}-${idx}`} className="space-y-1">
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">{result.name}</span><span className="font-mono font-semibold text-blue-400">{result.value.toFixed(1)} {result.unit}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500" style={{ width: `${(result.value / maxVal) * 100}%` }} /></div>
                </div>);
              }))}</div>
            </CardContent>
          </Card>
        )}
        {priorityKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" />SLA by Priority</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{priorityKpis.map((kpi) => kpi.results.map((result, idx) => (
                <div key={`${kpi.pluginId}-${idx}`} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4">
                  <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.priority}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}%</span></div>
                </div>
              )))}</div>
            </CardContent>
          </Card>
        )}

        {/* Chart Section */}
        {kpiResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                Visualizations
              </h3>
              {charts.length < 6 && (
                <Button
                  onClick={handleAddChart}
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Chart
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {charts.map((chartConfig) => {
                const widthClass = {
                  sm: 'col-span-1',      // 25% width (1 of 4 columns)
                  md: 'col-span-2',       // 50% width (2 of 4 columns)
                  lg: 'col-span-3',       // 75% width (3 of 4 columns)
                  full: 'col-span-4',     // 100% width (4 of 4 columns)
                }[chartConfig.width];

                return (
                  <div key={chartConfig.id} className={widthClass}>
                    <ChartCard
                      config={chartConfig}
                      kpiResults={kpiResults}
                      onRemove={handleRemoveChart}
                      onChange={handleUpdateChart}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>)}
      {kpiResults.length === 0 && !calculating && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardContent className="py-16 text-center text-slate-400 dark:text-slate-500"><BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">No KPI results yet</p></CardContent></Card>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ result, pluginId }: { result: { name: string; value: number; unit: string; details?: Array<{ label: string; value: number; unit?: string }> }; pluginId: string }) {
  const getIcon = () => {
    if (result.name.includes('Processing')) return <Clock className="h-5 w-5" />;
    if (result.name.includes('Working Days')) return <Calendar className="h-5 w-5" />;
    if (result.name.includes('SLA')) return <Target className="h-5 w-5" />;
    if (result.name.includes('Throughput')) return <TrendingUp className="h-5 w-5" />;
    if (result.name.includes('Resolution')) return <CheckCircle2 className="h-5 w-5" />;
    if (result.name.includes('Reassign')) return <AlertTriangle className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };
  const getColor = () => {
    if (result.unit === '%') { if (result.value >= 80) return 'text-emerald-400'; if (result.value >= 50) return 'text-amber-400'; return 'text-red-400'; }
    if (result.unit === 'hours') { if (result.value <= 40) return 'text-emerald-400'; if (result.value <= 80) return 'text-amber-400'; return 'text-red-400'; }
    return 'text-blue-400';
  };
  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="rounded-lg p-2 bg-gray-100 dark:bg-slate-800"><div className={getColor()}>{getIcon()}</div></div>
          <Badge variant="outline" className="text-xs text-slate-400 dark:text-slate-500">{pluginId.split('_').slice(0, 2).join(' ')}</Badge>
        </div>
        <p className={`text-3xl font-bold font-mono ${getColor()}`}>{result.value % 1 !== 0 ? result.value.toFixed(2) : result.value}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{result.name}</p>
        {result.unit && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{result.unit}</p>}
        {result.details && <><Separator className="my-3 bg-gray-100 dark:bg-slate-800" /><div className="space-y-1.5">{result.details.map((d, i) => (<div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-400 dark:text-slate-500">{d.label}</span><span className="font-mono text-slate-700 dark:text-slate-300">{d.value}{d.unit ? ` ${d.unit}` : ''}</span></div>))}</div></>}
      </CardContent>
    </Card>
  );
}

// ─── Chart Card (Configurable Chart Component) ────────────────────────────────

interface ChartConfig {
  id: string;
  kpiId: string;
  type: 'bar' | 'line' | 'pie';
  width: 'sm' | 'md' | 'lg' | 'full';
}

interface ChartCardProps {
  config: ChartConfig;
  kpiResults: any[];
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
}

function ChartCard({ config, kpiResults, onRemove, onChange }: ChartCardProps) {
  const kpiOptions = useMemo(() => getKpiOptions(kpiResults), [kpiResults]);

  // Check if selected KPI is a time-series plugin
  const isTimeSeries = config.kpiId ? isTimeSeriesPlugin(config.kpiId) : false;

  // Width mapping for Tailwind classes
  const widthClasses = {
    sm: 'col-span-1',      // 25% width (4 per row)
    md: 'lg:col-span-2',   // 50% width (2 per row)
    lg: 'lg:col-span-3',   // 75% width
    full: 'lg:col-span-3', // Full width
  };

  const widthLabels = {
    sm: 'Narrow (25%)',
    md: 'Medium (50%)',
    lg: 'Wide (75%)',
    full: 'Full Width',
  };

  const selectedKpiData = useMemo(() => {
    if (!config.kpiId) return null;

    switch (config.type) {
      case 'bar':
        return transformForBarChart(kpiResults, config.kpiId);
      case 'pie':
        return transformForPieChart(kpiResults, config.kpiId);
      case 'line':
        return transformForLineChart(kpiResults, config.kpiId);
      default:
        return [];
    }
  }, [config.kpiId, config.type, kpiResults]);

  const handleKpiChange = (kpiId: string) => {
    const recommendedType = getRecommendedChartType(kpiResults, kpiId);
    onChange(config.id, { ...config, kpiId, type: recommendedType });
  };

  const renderChart = () => {
    if (!config.kpiId || !selectedKpiData || selectedKpiData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a KPI to visualize</p>
          </div>
        </div>
      );
    }

    // Dynamic height based on width
    const chartHeight = {
      sm: 250,   // Narrow - smaller
      md: 300,   // Medium - default
      lg: 350,   // Wide - taller
      full: 400,  // Full - tallest
    }[config.width];

    const kpi = kpiResults.find((k) => k.pluginId === config.kpiId);
    const unit = kpi?.results?.[0]?.unit || '';

    switch (config.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={selectedKpiData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatChartValue(value, unit)}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        // Check if this is a multi-series chart (multiple results with timeSeries)
        const hasMultipleSeries = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every(r => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeries) {
          // Merge all timeSeries data by period
          const allPeriods = new Set<string>();
          kpi.results.forEach(result => {
            result.timeSeries?.forEach(point => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            kpi.results.forEach((result, idx) => {
              const point = result.timeSeries?.find(p => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
            });
            return dataPoint;
          });

          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={mergedData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => formatChartValue(value, unit)}
                />
                <Legend />
                {kpi.results.map((result, idx) => (
                  <Line
                    key={result.name || idx}
                    type="monotone"
                    dataKey={`series${idx}`}
                    name={result.name}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          );
        }

        // Single series line chart
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={selectedKpiData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatChartValue(value, unit)}
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={selectedKpiData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {selectedKpiData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatChartValue(value, unit)}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${isTimeSeries ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-emerald-100 dark:bg-emerald-500/10'}`}>
              <BarChart3 className={`h-5 w-5 ${isTimeSeries ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Chart Visualization</CardTitle>
              {isTimeSeries && (
                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30">
                  📈 Trend
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(config.id)}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline Controls */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">KPI Metric</Label>
            <Select value={config.kpiId} onValueChange={handleKpiChange}>
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Select KPI..." />
              </SelectTrigger>
              <SelectContent>
                {kpiOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[140px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Chart Type</Label>
            <Select
              value={config.type}
              onValueChange={(type: 'bar' | 'line' | 'pie') => onChange(config.id, { ...config, type })}
              disabled={!config.kpiId}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[120px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Width</Label>
            <Select
              value={config.width}
              onValueChange={(width: 'sm' | 'md' | 'lg' | 'full') => onChange(config.id, { ...config, width })}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Narrow</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Wide</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Chart Area */}
        <div className="mt-4">{renderChart()}</div>
      </CardContent>
    </Card>
  );
}

// ─── Plugins Panel (with Feature 4: KPI Builder Wizard) ──────────────────────

const METRIC_TYPES = [
  { id: 'count', label: 'Count tickets', icon: '0', description: 'Count issues matching filters' },
  { id: 'avg', label: 'Average of field', icon: 'x\u0304', description: 'Average value of a numeric field' },
  { id: 'sum', label: 'Sum of field', icon: '\u03A3', description: 'Sum of a numeric field' },
  { id: 'percentage', label: 'Percentage / Ratio', icon: '%', description: 'Ratio of matching issues' },
  { id: 'time', label: 'Time calculation', icon: '\u23F1', description: 'Time-based calc with holiday awareness' },
];

function PluginsPanel() {
  const [plugins, setPlugins] = useState<Record<string, KpiPluginInfo[]>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', category: 'custom', unit: 'value', formula: '' });

  // Wizard state (Feature 4)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState({
    metricType: 'count',
    // Step 2 - Filters
    statuses: [] as string[],
    priorities: [] as string[],
    issueTypes: [] as string[],
    assignees: [] as string[],
    dateField: 'created',
    customJql: '',
    // Step 3 - Output
    kpiName: '',
    unit: 'count',
    category: 'custom',
    groupBy: 'none',
    // Step 4 - Preview
  });

  const totalWizardSteps = 4;

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch('/api/kpi/plugins'); const data = await res.json(); if (data.success) setPlugins(data.plugins); } catch { toast.error('Failed to load plugins'); }
    setLoading(false);
  }, []);
  React.useEffect(() => { loadPlugins(); }, [loadPlugins]);

  const handleCreate = async () => {
    if (!form.name || !form.formula) { toast.error('Name and formula are required'); return; }
    try {
      const res = await fetch('/api/kpi/plugins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { toast.success(`Plugin "${form.name}" created`); setForm({ name: '', description: '', category: 'custom', unit: 'value', formula: '' }); loadPlugins(); }
    } catch { toast.error('Failed to create plugin'); }
  };

  const generateFormula = (): string => {
    const w = wizardData;
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

  const handleWizardSave = async () => {
    if (!wizardData.kpiName) { toast.error('KPI Name is required'); return; }
    const formula = generateFormula();
    try {
      const res = await fetch('/api/kpi/plugins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wizardData.kpiName,
          description: `Custom KPI built with wizard (${wizardData.metricType})`,
          category: wizardData.category,
          unit: wizardData.unit,
          formula,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`KPI Plugin "${wizardData.kpiName}" created`);
        setWizardOpen(false);
        setWizardStep(0);
        setWizardData({ metricType: 'count', statuses: [], priorities: [], issueTypes: [], assignees: [], dateField: 'created', customJql: '', kpiName: '', unit: 'count', category: 'custom', groupBy: 'none' });
        loadPlugins();
      } else toast.error(data.error);
    } catch { toast.error('Failed to create KPI plugin'); }
  };

  const categoryLabels: Record<string, { label: string; color: string }> = {
    processing_time: { label: 'Processing Time', color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-400 border-blue-500/30' },
    turnaround: { label: 'Turnaround', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-400 border-purple-500/30' },
    throughput: { label: 'Throughput', color: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    sla: { label: 'SLA', color: 'bg-amber-100 dark:bg-amber-500/10 text-amber-400 border-amber-500/30' },
    quality: { label: 'Quality', color: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
    custom: { label: 'Custom', color: 'bg-rose-50 dark:bg-rose-500/10 text-rose-400 border-rose-500/30' },
  };

  return (
    <div className="space-y-6">
      {/* Wizard modal */}
      {wizardOpen && (
        <Card className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-emerald-400" /> KPI Builder Wizard</CardTitle>
              <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-700" onClick={() => setWizardOpen(false)}>Cancel</Button>
            </div>
            <CardDescription className="text-slate-600 dark:text-slate-400">Build a custom KPI without writing code</CardDescription>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-3">
              {Array.from({ length: totalWizardSteps }).map((_, i) => (
                <React.Fragment key={i}>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${i <= wizardStep ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    {i + 1}. {['Metric', 'Filters', 'Output', 'Preview'][i]}
                  </div>
                  {i < totalWizardSteps - 1 && <ChevronRight className="h-3 w-3 text-slate-500 dark:text-slate-600" />}
                </React.Fragment>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Choose Metric Type */}
            {wizardStep === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {METRIC_TYPES.map((mt) => (
                  <div key={mt.id} onClick={() => setWizardData({ ...wizardData, metricType: mt.id })} className={`rounded-lg border p-4 cursor-pointer transition-all hover:border-emerald-500/50 ${wizardData.metricType === mt.id ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50'}`}>
                    <div className="text-2xl mb-2">{mt.icon}</div>
                    <p className="font-semibold text-sm">{mt.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{mt.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Configure Filters */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Status filter (comma-separated)</Label>
                    <Input placeholder="Done, Closed" value={wizardData.statuses.join(', ')} onChange={(e) => setWizardData({ ...wizardData, statuses: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Priority filter (comma-separated)</Label>
                    <Input placeholder="High, Highest" value={wizardData.priorities.join(', ')} onChange={(e) => setWizardData({ ...wizardData, priorities: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Issue type filter (comma-separated)</Label>
                    <Input placeholder="Bug, Task" value={wizardData.issueTypes.join(', ')} onChange={(e) => setWizardData({ ...wizardData, issueTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Assignee filter (comma-separated)</Label>
                    <Input placeholder="john, jane" value={wizardData.assignees.join(', ')} onChange={(e) => setWizardData({ ...wizardData, assignees: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Custom JQL condition (optional)</Label>
                  <Input placeholder='labels = "urgent"' value={wizardData.customJql} onChange={(e) => setWizardData({ ...wizardData, customJql: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                </div>
              </div>
            )}

            {/* Step 3: Configure Output */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">KPI Name</Label>
                  <Input placeholder="e.g. Critical Bug Resolution Rate" value={wizardData.kpiName} onChange={(e) => setWizardData({ ...wizardData, kpiName: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Unit</Label>
                    <Select value={wizardData.unit} onValueChange={(v) => setWizardData({ ...wizardData, unit: v })}>
                      <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem><SelectItem value="days">Days</SelectItem>
                        <SelectItem value="tickets">Tickets</SelectItem><SelectItem value="%">%</SelectItem>
                        <SelectItem value="count">Count</SelectItem><SelectItem value="value">Value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Category</Label>
                    <Select value={wizardData.category} onValueChange={(v) => setWizardData({ ...wizardData, category: v })}>
                      <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="processing_time">Processing Time</SelectItem><SelectItem value="turnaround">Turnaround</SelectItem>
                        <SelectItem value="throughput">Throughput</SelectItem><SelectItem value="sla">SLA</SelectItem>
                        <SelectItem value="quality">Quality</SelectItem><SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-slate-300">Group By</Label>
                    <Select value={wizardData.groupBy} onValueChange={(v) => setWizardData({ ...wizardData, groupBy: v })}>
                      <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem><SelectItem value="status">Status</SelectItem>
                        <SelectItem value="priority">Priority</SelectItem><SelectItem value="assignee">Assignee</SelectItem>
                        <SelectItem value="issueType">Issue Type</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Preview & Save */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Generated Formula DSL</Label>
                  <div className="rounded-lg bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
                    <pre className="text-sm text-emerald-400 font-mono whitespace-pre-wrap">{generateFormula()}</pre>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">KPI Preview</Label>
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg p-2 bg-gray-100 dark:bg-slate-800"><Zap className="h-5 w-5 text-blue-400" /></div>
                      <div>
                        <p className="text-xl font-bold font-mono text-blue-400">--</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{wizardData.kpiName || 'Untitled KPI'}</p>
                      </div>
                      <div className="ml-auto">
                        <Badge variant="outline" className="text-xs">{wizardData.unit}</Badge>
                        <Badge variant="outline" className="text-xs ml-1">{wizardData.category}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs text-amber-400"><Info className="inline h-3 w-3 mr-1" />The actual value will be calculated when you run KPI calculations on extracted data.</p>
                </div>
              </div>
            )}

            {/* Wizard navigation */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" className="border-slate-200 dark:border-slate-700" onClick={() => setWizardStep(Math.max(0, wizardStep - 1))} disabled={wizardStep === 0}>
                <ChevronLeft className="mr-2 h-4 w-4" />Back
              </Button>
              {wizardStep < totalWizardSteps - 1 ? (
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setWizardStep(wizardStep + 1)}>
                  Next<ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleWizardSave} disabled={!wizardData.kpiName}>
                  <Save className="mr-2 h-4 w-4" />Save KPI Plugin
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-emerald-400" /> KPI Plugin Registry</CardTitle>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setWizardOpen(true); setWizardStep(0); }}>
                <Wand2 className="mr-2 h-4 w-4" />Wizard
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-gray-100 dark:bg-slate-800" />)}</div> : (
              <div className="space-y-3">
                {Object.entries(plugins).map(([category, pluginList]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2"><Badge className={categoryLabels[category]?.color}>{categoryLabels[category]?.label || category}</Badge><span className="text-xs text-slate-400 dark:text-slate-500">{pluginList.length}</span></div>
                    <div className="space-y-2">{pluginList.map((plugin) => (
                      <div key={plugin.id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-gray-100/50 dark:bg-slate-800/30 p-3"><div className="flex items-center justify-between"><div><h4 className="font-semibold text-sm">{plugin.name}</h4><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plugin.description}</p></div><Badge variant="outline" className="text-xs">{plugin.unit}</Badge></div></div>
                    ))}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5 text-emerald-400" /> Create Custom Plugin</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Name</Label><Input placeholder="e.g. Critical Bug Resolution" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
            <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Description</Label><Input placeholder="What does this KPI measure?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="processing_time">Processing Time</SelectItem><SelectItem value="turnaround">Turnaround</SelectItem><SelectItem value="throughput">Throughput</SelectItem><SelectItem value="sla">SLA</SelectItem><SelectItem value="quality">Quality</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Unit</Label><Input placeholder="hours, %, tickets" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
            </div>
            <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Formula DSL</Label>
              <textarea className="w-full min-h-[120px] rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-sm text-emerald-400 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder={'COUNT(resolved = true)\nAVG(storyPoints) WHERE status = "Done"\nPERCENTAGE(resolved = true) OF true'} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} />
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 space-y-1"><p className="text-xs font-semibold text-slate-700 dark:text-slate-300">DSL Reference:</p><p className="text-xs text-slate-500 dark:text-slate-400 font-mono">COUNT / AVG / SUM / PERCENTAGE</p><p className="text-xs text-slate-400 dark:text-slate-500">Fields: storyPoints, priority, status, resolved, issueType</p></div>
            <Button onClick={handleCreate} className="w-full bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" />Create Plugin</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Holidays Panel ───────────────────────────────────────────────────────────

function HolidaysPanel({ region, setRegion }: { region: string, setRegion: any }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string; nameLocal: string; isNational: boolean; regions: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const loadHolidays = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch(`/api/holidays?year=${year}&region=${region}`); const data = await res.json(); if (data.success) setHolidays(data.holidays); } catch { toast.error('Failed'); }
    setLoading(false);
  }, [year, region]);
  React.useEffect(() => { loadHolidays(); }, [loadHolidays]);
  const national = holidays.filter((h) => h.isNational).sort((a, b) => a.date.localeCompare(b.date));
  const regional = holidays.filter((h) => !h.isNational).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-emerald-400" /> German Holiday Calendar</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Year</Label><Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-32" /></div>
            <div className="space-y-2 flex-1"><Label className="text-slate-700 dark:text-slate-300">State</Label><Select value={region} onValueChange={setRegion}><SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger><SelectContent>{GERMAN_STATES.filter(s => s.code !== 'all').map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}</SelectContent></Select></div>
            <div className="flex items-end"><Button onClick={loadHolidays} variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-400 border-emerald-500/30">National</Badge>({national.length})</CardTitle></CardHeader>
          <CardContent><div className="space-y-1">{loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full bg-gray-100 dark:bg-slate-800" />) : national.map((h, i) => (<div key={i} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div></CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-purple-50 dark:bg-purple-500/10 text-purple-400 border-purple-500/30">Regional</Badge>({regional.length})</CardTitle></CardHeader>
          <CardContent>{regional.length === 0 ? <div className="text-center py-12 text-slate-400 dark:text-slate-500"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No regional holidays for this selection</p></div> : <div className="space-y-1">{regional.map((h, i) => (<div key={i} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal} {h.regions.length > 0 && <span className="text-purple-400">({h.regions.join(', ')})</span>}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div>}</CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Export Panel (REVAMPED with CSV / PostgreSQL dual mode) ──────────────────

function ExportPanel({
  extractionResult, dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion
}: any) {
  const [exportMode, setExportMode] = useState<'file' | 'postgres' | 'metabase'>('file');
  const [jiraConnections, setJiraConnections] = useState<JiraConnection[]>([]);
  const [pgConnections, setPgConnections] = useState<PgConnection[]>([]);
  const [metabaseConnections, setMetabaseConnections] = useState<MetabaseConnection[]>([]);
  const [selectedJiraConn, setSelectedJiraConn] = useState('');
  const [selectedPgConn, setSelectedPgConn] = useState('');
  const [selectedMbConn, setSelectedMbConn] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<Record<string, unknown> | null>(null);
  const [pgResult, setPgResult] = useState<{ rowsExported: number; totalRows: number; table: string; message: string } | null>(null);
  const [createSchema, setCreateSchema] = useState(true);
  const [truncateTable, setTruncateTable] = useState(false);

  // Metabase-specific state
  const [mbDatabases, setMbDatabases] = useState<MetabaseDatabase[]>([]);
  const [selectedMbDb, setSelectedMbDb] = useState('');
  const [mbTableName, setMbTableName] = useState('jira_kpi_data');
  const [mbFullSync, setMbFullSync] = useState(false);
  const [mbCreateCard, setMbCreateCard] = useState(true);
  const [mbResult, setMbResult] = useState<{
    tableName: string; rowCount: number; uploaded: boolean; synced: boolean;
    cardCreated: boolean; cardUrl?: string; error?: string;
  } | null>(null);
  const [loadingMbDbs, setLoadingMbDbs] = useState(false);
  const [exportDataType, setExportDataType] = useState<'kpi' | 'tickets'>('kpi');

  React.useEffect(() => {
    Promise.all([
      fetch('/api/jira/connections').then((r) => r.json()),
      fetch('/api/pg/connections').then((r) => r.json()),
      fetch('/api/metabase/connections').then((r) => r.json()),
    ]).then(([jiraData, pgData, mbData]) => {
      if (jiraData.success) setJiraConnections(jiraData.connections);
      if (pgData.success) setPgConnections(pgData.connections);
      if (mbData.success) setMetabaseConnections(mbData.connections);
    });
  }, []);

  const handleFileExport = async (format: string) => {
    if (!extractionResult) { toast.error('No extracted data found. Please run ETL Extraction in the Extract tab first.'); return; }
    setExporting(true);
    try {
      if (exportDataType === 'tickets') {
        if (format === 'json') {
          const blob = new Blob([JSON.stringify(extractionResult.issues, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'jira-tickets-raw.json'; a.click();
          URL.revokeObjectURL(url);
          toast.success('Raw tickets JSON downloaded');
        } else {
          // CSV Tickets
          const issues = extractionResult.issues as any[];
          const headers = ['Key', 'Summary', 'Status', 'Priority', 'IssueType', 'Created', 'Resolved', 'Assignee'];
          const rows = [headers.join(',')];
          for (const i of issues) {
            const fields = i.fields || {};
            rows.push([
              i.key,
              `"${(fields.summary || '').replace(/"/g, '""')}"`,
              fields.status?.name || '',
              fields.priority?.name || '',
              fields.issuetype?.name || '',
              fields.created || '',
              fields.resolutiondate || '',
              fields.assignee?.displayName || ''
            ].join(','));
          }
          const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'jira-tickets-raw.csv'; a.click();
          URL.revokeObjectURL(url);
          toast.success('Raw tickets CSV downloaded');
        }
      } else {
        // KPI Export
        const exportRes = await fetch('/api/metabase/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issues: extractionResult.issues,
            holidays: { regions: region === 'all' ? [] : [region] },
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            format
          }),
        });

        if (format === 'csv' && exportRes.ok) {
          const blob = await exportRes.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'jira-kpi-export.csv'; a.click();
          URL.revokeObjectURL(url);
          toast.success('KPI CSV downloaded');
        } else if (format === 'json' && exportRes.ok) {
          const data = await exportRes.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'jira-kpi-metabase.json'; a.click();
          URL.revokeObjectURL(url);
          toast.success('KPI JSON downloaded');
        } else {
          const data = await exportRes.json();
          toast.error(data.error || 'Export failed');
        }
      }
    } catch (e) { console.error(e); toast.error('Export failed'); }
    setExporting(false);
  };

  const handlePgExport = async () => {
    if (!extractionResult) { toast.error('No extracted data found. Please run ETL Extraction in the Extract tab first.'); return; }
    if (!selectedPgConn) { toast.error('Select a PostgreSQL connection'); return; }
    setExporting(true); setPgResult(null);
    try {
      const pgRes = await fetch('/api/pg/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: selectedPgConn,
          issues: extractionResult.issues,
          holidays: { regions: region === 'all' ? [] : [region] },
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          createSchema,
          truncate: truncateTable,
        }),
      });
      const pgData = await pgRes.json();
      if (pgData.success) {
        setPgResult({ rowsExported: pgData.rowsExported, totalRows: pgData.totalRows, table: pgData.table, message: pgData.message });
        toast.success(pgData.message);
      } else {
        toast.error(pgData.error || 'PostgreSQL export failed');
      }
    } catch { toast.error('PostgreSQL export failed'); }
    setExporting(false);
  };

  // Load Metabase databases when connection is selected
  const loadMbDatabases = async (connId: string) => {
    setSelectedMbDb('');
    setMbDatabases([]);
    if (!connId) return;
    setLoadingMbDbs(true);
    try {
      const res = await fetch('/api/metabase/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'databases', id: connId }),
      });
      const data = await res.json();
      if (data.success) setMbDatabases(data.databases || []);
      else toast.error(data.error || 'Failed to load databases');
    } catch { toast.error('Failed to reach Metabase'); }
    setLoadingMbDbs(false);
  };

  const handleMbPush = async () => {
    if (!extractionResult) { toast.error('No extracted data found. Please run ETL Extraction in the Extract tab first.'); return; }
    if (!selectedMbConn) { toast.error('Select a Metabase connection'); return; }
    setExporting(true); setMbResult(null);
    try {
      // Step 2: Push to Metabase
      const pushRes = await fetch('/api/metabase/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'upload',
          connectionId: selectedMbConn,
          issues: extractionResult.issues,
          holidays: { regions: region === 'all' ? [] : [region] },
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          tableName: mbTableName || `jira_kpi_${Date.now()}`,
          syncDatabaseId: selectedMbDb ? parseInt(selectedMbDb) : undefined,
          fullSync: mbFullSync,
          createCard: mbCreateCard,
          cardName: `Jira KPI Dashboard - ${new Date().toISOString().split('T')[0]}`,
        }),
      });
      const pushData = await pushRes.json();
      if (pushData.success) {
        setMbResult({
          tableName: pushData.tableName || mbTableName,
          rowCount: pushData.rowCount || 0,
          uploaded: pushData.upload?.success || false,
          synced: pushData.sync?.success || false,
          cardCreated: pushData.card?.success || false,
          cardUrl: pushData.card?.url,
          error: pushData.error,
        });
        toast.success('Data pushed to Metabase successfully!');
      } else {
        setMbResult({ tableName: mbTableName, rowCount: 0, uploaded: false, synced: false, cardCreated: false, error: pushData.error });
        toast.error(pushData.error || 'Metabase push failed');
      }
    } catch { toast.error('Metabase push failed'); }
    setExporting(false);
  };


  return (
    <div className="space-y-6">
      {/* Export Mode Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* File Export Mode */}
        <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'file' ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('file')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${exportMode === 'file' ? 'bg-emerald-600' : 'bg-gray-100 dark:bg-slate-800'}`}>
                <FileSpreadsheet className={`h-5 w-5 ${exportMode === 'file' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">File Export</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">CSV / JSON download. Ad-hoc analysis, small datasets.</CardDescription>
              </div>
              {exportMode === 'file' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            </div>
          </CardHeader>
        </Card>

        {/* PostgreSQL Export Mode */}
        <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'postgres' ? 'border-violet-500/50 bg-violet-50 dark:bg-violet-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('postgres')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${exportMode === 'postgres' ? 'bg-violet-600' : 'bg-gray-100 dark:bg-slate-800'}`}>
                <HardDrive className={`h-5 w-5 ${exportMode === 'postgres' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">PostgreSQL Push</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">Direct DB write. Production pipelines, large datasets.</CardDescription>
              </div>
              {exportMode === 'postgres' && <CheckCircle2 className="h-5 w-5 text-violet-400" />}
            </div>
          </CardHeader>
        </Card>

        {/* Metabase Direct Push */}
        <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'metabase' ? 'border-cyan-500/50 bg-cyan-50 dark:bg-cyan-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('metabase')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${exportMode === 'metabase' ? 'bg-cyan-600' : 'bg-gray-100 dark:bg-slate-800'}`}>
                <Globe className={`h-5 w-5 ${exportMode === 'metabase' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">Direct Metabase Push</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">Push + sync + auto-create dashboard card. One-click.</CardDescription>
              </div>
              {exportMode === 'metabase' && <CheckCircle2 className="h-5 w-5 text-cyan-400" />}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Comparison Card */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><Info className="h-4 w-4 text-slate-500 dark:text-slate-400" /><span className="text-sm font-medium text-slate-700 dark:text-slate-300">When to use which?</span></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">CSV / JSON Export</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>Quick ad-hoc analysis</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>One-time Metabase imports</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>No database setup needed</span></li>
              </ul>
            </div>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-500/5 border border-violet-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">PostgreSQL Direct</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" /><span>Live Metabase connection</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" /><span>Large / growing datasets</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" /><span>Idempotent upserts</span></li>
              </ul>
            </div>
            <div className="rounded-lg bg-cyan-50 dark:bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Metabase Direct</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>One-click push + sync</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>Auto-create dashboard card</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 shrink-0" /><span>No separate DB setup</span></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Common Config */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-slate-500 dark:text-slate-400" /> Export Summary</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Verify extracted data and regional settings before exporting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Source Data</Label>
              <div className="h-10 flex items-center px-3 bg-gray-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                {extractionResult ? (
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm font-medium">{extractionResult.issues.length} Tickets Ready</span>
                    {extractionResult.issues.length > 0 && (() => {
                      const dates = extractionResult.issues
                        .map((i: any) => i.fields?.created || i.created)
                        .filter((d: any) => d)
                        .map((d: any) => new Date(d).getTime());
                      const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
                      return oldestDate ? (
                        <Badge variant="outline" className="text-[10px] h-4">
                          {oldestDate.toLocaleDateString()}
                        </Badge>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">Extract data first</span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-slate-700 dark:text-slate-300">Period</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateFrom || ''}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full"
                  />
                </div>
                <div className="relative flex-1">
                  <Input
                    type="date"
                    value={dateTo || ''}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10 w-full"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GERMAN_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-700 dark:text-slate-300">Data to Export</Label>
            <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('kpi')} className={`flex-1 rounded-md text-xs h-8 ${exportDataType === 'kpi' ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-500 font-bold' : 'text-slate-500'}`}><Zap className="mr-2 h-3.5 w-3.5" />KPI Results</Button>
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('tickets')} className={`flex-1 rounded-md text-xs h-8 ${exportDataType === 'tickets' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-400 font-bold' : 'text-slate-500'}`}><Ticket className="mr-2 h-3.5 w-3.5" />Raw Tickets</Button>
            </div>
          </div>

          {/* PostgreSQL-specific config */}
          {exportMode === 'postgres' && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">PostgreSQL Target</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">PostgreSQL Connection</Label>
                  <Select value={selectedPgConn} onValueChange={setSelectedPgConn}>
                    <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Select a PG connection..." /></SelectTrigger>
                    <SelectContent>
                      {pgConnections.length === 0 && <SelectItem value="__none" disabled>No PG connections configured</SelectItem>}
                      {pgConnections.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.host}:{c.port}/{c.database})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPgConn && (() => {
                  const conn = pgConnections.find((c) => c.id === selectedPgConn);
                  return conn ? (
                    <div className="flex items-end">
                      <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 border border-violet-500/20 p-3 text-xs space-y-1 w-full">
                        <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30">TARGET</Badge><span className="text-slate-700 dark:text-slate-300 font-mono">{conn.schemaName}.{conn.tableName}</span></div>
                        <p className="text-slate-400 dark:text-slate-500">{conn.host}:{conn.port}/{conn.database} (SSL: {conn.sslMode})</p>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox id="createSchema" checked={createSchema} onCheckedChange={(v) => setCreateSchema(v === true)} className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600" />
                  <label htmlFor="createSchema" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Create schema if missing</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="truncate" checked={truncateTable} onCheckedChange={(v) => setTruncateTable(v === true)} className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600" />
                  <label htmlFor="truncate" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Truncate table before insert</label>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3">
                <div className="flex items-center gap-2 mb-2"><Table className="h-3.5 w-3.5 text-violet-400" /><span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Auto-created Table Schema</span></div>
                <pre className="text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">{`CREATE TABLE IF NOT EXISTS "schema"."table_name" (
  id            BIGSERIAL PRIMARY KEY,
  kpi_id        TEXT NOT NULL,
  kpi_name      TEXT NOT NULL,
  value         DOUBLE PRECISION,
  unit          TEXT,
  calculated_at TIMESTAMPTZ,
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  region        TEXT,
  priority      TEXT,
  status        TEXT,
  is_detail     BOOLEAN,
  UNIQUE (kpi_id, kpi_name, period_start, period_end, region)  -- upsert key
);`}</pre>
              </div>
            </div>
          )}

          {/* Metabase-specific config */}
          {exportMode === 'metabase' && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Metabase Target</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Metabase Connection</Label>
                  <Select value={selectedMbConn} onValueChange={(v) => { setSelectedMbConn(v); loadMbDatabases(v); }}>
                    <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue placeholder="Select a Metabase connection..." /></SelectTrigger>
                    <SelectContent>
                      {metabaseConnections.length === 0 && <SelectItem value="__none" disabled>No Metabase connections configured</SelectItem>}
                      {metabaseConnections.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.baseUrl})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 dark:text-slate-300">Table Name</Label>
                  <Input placeholder="jira_kpi_data" value={mbTableName} onChange={(e) => setMbTableName(e.target.value)} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                </div>
              </div>

              {/* Database sync selector */}
              {selectedMbConn && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-slate-300">Sync Database <span className="text-slate-400 dark:text-slate-500 text-xs">(optional)</span></Label>
                      <Select value={selectedMbDb} onValueChange={setSelectedMbDb}>
                        <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                          <SelectValue placeholder={loadingMbDbs ? 'Loading...' : 'Skip sync'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Skip sync</SelectItem>
                          {loadingMbDbs && <SelectItem value="__loading" disabled>Loading databases...</SelectItem>}
                          {mbDatabases.map((db) => (
                            <SelectItem key={db.id} value={String(db.id)}>
                              {db.name} ({db.engine})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2">
                      <Checkbox id="mbFullSync" checked={mbFullSync} onCheckedChange={(v) => setMbFullSync(v === true)} className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600" />
                      <label htmlFor="mbFullSync" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Full sync (slower but thorough)</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="mbCreateCard" checked={mbCreateCard} onCheckedChange={(v) => setMbCreateCard(v === true)} className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600" />
                      <label htmlFor="mbCreateCard" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Auto-create dashboard card</label>
                    </div>
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3">
                    <div className="flex items-center gap-2 mb-2"><Send className="h-3.5 w-3.5 text-cyan-400" /><span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Push Pipeline</span></div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="rounded bg-cyan-100 dark:bg-cyan-500/10 px-2 py-0.5 text-cyan-400 font-medium">1. Extract from Jira</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="rounded bg-cyan-100 dark:bg-cyan-500/10 px-2 py-0.5 text-cyan-400 font-medium">2. Calculate KPIs</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="rounded bg-cyan-100 dark:bg-cyan-500/10 px-2 py-0.5 text-cyan-400 font-medium">3. Upload CSV to Metabase</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      {selectedMbDb ? (<><span className="rounded bg-cyan-100 dark:bg-cyan-500/10 px-2 py-0.5 text-cyan-400 font-medium">4. Sync DB</span><ArrowRight className="h-3 w-3 shrink-0" /></>) : null}
                      {mbCreateCard ? <span className="rounded bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 text-emerald-400 font-medium">5. Create Card</span> : null}
                    </div>
                  </div>
                </div>
              )}

              {!selectedMbConn && metabaseConnections.length === 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-400">
                  No Metabase connections configured. Go to the <span className="font-semibold">Connections</span> tab to add one first.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Action Buttons */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          {exportMode === 'file' ? (
            <div className="flex gap-3">
              <Button onClick={() => handleFileExport('json')} disabled={exporting || !extractionResult} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
                Export JSON for Metabase
              </Button>
              <Button onClick={() => handleFileExport('csv')} disabled={exporting || !extractionResult} variant="outline" className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700">
                <FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </div>
          ) : exportMode === 'postgres' ? (
            <Button onClick={handlePgExport} disabled={exporting || !extractionResult || !selectedPgConn} className="w-full bg-violet-600 hover:bg-violet-700">
              {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating & Pushing to PostgreSQL...</> : <><Upload className="mr-2 h-4 w-4" />Calculate KPIs & Push to PostgreSQL</>}
            </Button>
          ) : (
            <Button onClick={handleMbPush} disabled={exporting || !extractionResult || !selectedMbConn} className="w-full bg-cyan-600 hover:bg-cyan-700">
              {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating & Pushing to Metabase...</> : <><Send className="mr-2 h-4 w-4" />Calculate KPIs & Push to Metabase</>}
            </Button>
          )}
        </CardContent>
      </Card>


      {exportMode === 'postgres' && pgResult && (
        <Card className="border-violet-500/30 bg-violet-50 dark:bg-violet-500/5">
          <CardHeader><CardTitle className="flex items-center gap-2 text-violet-400"><CheckCircle2 className="h-5 w-5" />PostgreSQL Export Complete</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                <p className="text-3xl font-bold text-violet-400">{pgResult.rowsExported}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Rows Exported</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">{pgResult.totalRows}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Rows in Table</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                <p className="text-sm font-mono text-blue-400 mt-1">{pgResult.table}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Target Table</p>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Metabase Setup</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">1. In Metabase, go to <span className="text-emerald-400 font-mono">Admin &gt; Databases &gt; Add database</span></p>
              <p className="text-xs text-slate-500 dark:text-slate-400">2. Select <span className="text-emerald-400 font-mono">PostgreSQL</span> and enter the same host, port, database, and credentials</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">3. The table <span className="text-violet-400 font-mono">{pgResult.table}</span> will be available automatically for dashboard queries</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">4. Re-running this export will <span className="text-amber-400">upsert</span> (update existing rows, insert new ones) for safe idempotent operation</p>
            </div>
          </CardContent>
        </Card>
      )}

      {exportMode === 'metabase' && mbResult && (
        <Card className={mbResult.uploaded ? 'border-cyan-500/30 bg-cyan-50 dark:bg-cyan-500/5' : 'border-red-500/30 bg-red-50 dark:bg-red-500/5'}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${mbResult.uploaded ? 'text-cyan-400' : 'text-red-400'}`}>
              {mbResult.uploaded ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {mbResult.uploaded ? 'Metabase Push Complete' : 'Metabase Push Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mbResult.uploaded && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                  <p className="text-3xl font-bold text-cyan-400">{mbResult.rowCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">KPI Rows</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                  <p className={`text-lg font-bold ${mbResult.uploaded ? 'text-emerald-400' : 'text-red-400'}`}>{mbResult.uploaded ? 'OK' : 'FAIL'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Upload</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                  <p className={`text-lg font-bold ${mbResult.synced ? 'text-emerald-400' : 'text-slate-400'}`}>{mbResult.synced ? 'OK' : 'SKIP'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">DB Sync</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 text-center">
                  <p className={`text-lg font-bold ${mbResult.cardCreated ? 'text-emerald-400' : 'text-slate-400'}`}>{mbResult.cardCreated ? 'OK' : 'SKIP'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Card</p>
                </div>
              </div>
            )}
            <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Push Details</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Table name: <span className="text-cyan-400 font-mono">{mbResult.tableName}</span></p>
              {mbResult.cardUrl && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Dashboard card: <a href={mbResult.cardUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-mono flex items-center gap-1">{mbResult.cardUrl} <ExternalLink className="h-3 w-3" /></a>
                </p>
              )}
              {mbResult.error && (
                <p className="text-xs text-red-400 mt-2">Error: {mbResult.error}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Settings Panel (Feature 3: Rate Limit + Feature 5: Config Import/Export) ─

function SettingsPanel({ onSettingsUpdate }: { onSettingsUpdate?: (settings: any) => void }) {
  const [settings, setSettings] = useState<{
    rateLimit: { delayMs: number; maxRequestsPerMinute: number; batchSize: number; backoffStrategy: string };
    general: { defaultHolidayState: string; workStartHour: number; workEndHour: number; defaultSlaTargetHours: number };
    persistence: { autoSave: boolean; autoRestore: boolean; retentionDays: number | 'never' };
  }>({
    rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
    general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40 },
    persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configExporting, setConfigExporting] = useState(false);
  const [configImporting, setConfigImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialSettings, setInitialSettings] = useState<typeof settings | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState<{
    totalExtractions: number;
    totalSizeMB: number;
    oldestExtraction: string;
    newestExtraction: string;
    orphanedExtractions: number;
    byConnection: Array<{
      connectionId: string;
      connectionName: string;
      extractions: number;
      totalSizeMB: number;
      totalTickets: number;
      oldestExtraction: string | null;
      newestExtraction: string | null;
    }>;
  } | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  React.useEffect(() => {
    setLoading(true);
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.success) {
        setSettings(d.settings);
        setInitialSettings(d.settings);
        setHasUnsavedChanges(false);
      }
    }).catch(() => toast.error('Failed to load settings')).finally(() => setLoading(false));
  }, []);

  // Detect unsaved changes
  React.useEffect(() => {
    if (initialSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings);
      setHasUnsavedChanges(changed);
    }
  }, [settings, initialSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Settings saved successfully');
        setInitialSettings(settings);
        setHasUnsavedChanges(false);
        if (onSettingsUpdate) onSettingsUpdate(settings);
      } else toast.error(data.error);
    } catch { toast.error('Failed to save settings'); }
    setSaving(false);
  };

  const handleExportConfig = async () => {
    setConfigExporting(true);
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.success) {
        const blob = new Blob([JSON.stringify(data.config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url; a.download = `jira-etl-config-${date}.json`; a.click();
        URL.revokeObjectURL(url);
        toast.success('Configuration exported');
      } else toast.error(data.error);
    } catch { toast.error('Failed to export configuration'); }
    setConfigExporting(false);
  };

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setConfigImporting(true);
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      if (!config.version) { toast.error('Invalid configuration file'); setConfigImporting(false); return; }

      const res = await fetch('/api/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        if (data.results) {
          const summary = data.results.map((r: { type: string; count: number; errors: string[] }) => `${r.type}: ${r.count} imported`).join(', ');
          toast.info(summary);
        }
        if (data.note) toast.info(data.note);
      } else toast.error(data.error);
    } catch { toast.error('Failed to import configuration'); }
    setConfigImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRefreshStorage = async () => {
    setLoadingStorage(true);
    try {
      const res = await fetch('/api/jira/extract/storage');
      const data = await res.json();
      if (data.success) {
        setStorageInfo(data.storage);
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to load storage info');
    }
    setLoadingStorage(false);
  };

  const handleCleanup = async () => {
    const retentionDays = settings.persistence?.retentionDays;
    if (retentionDays === 'never') {
      toast.error('Cannot cleanup: retention policy is set to "Never"');
      return;
    }

    try {
      const res = await fetch('/api/jira/extract/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cleaned up ${data.deleted.etlRuns} extractions, freed ~${data.deleted.freedSpaceMB} MB`);
        handleRefreshStorage();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to cleanup old data');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL extractions? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch('/api/jira/extract/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeDate: new Date().toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Deleted ${data.deleted.etlRuns} extractions`);
        handleRefreshStorage();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to clear all data');
    }
  };

  const handleCleanupOrphaned = async () => {
    if (!confirm('Delete extraction data from deleted connections? This will free up space.')) {
      return;
    }

    try {
      const res = await fetch('/api/jira/extract/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanupOrphaned: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cleaned up ${data.deleted.etlRuns} orphaned extractions (${data.deleted.freedSpaceMB.toFixed(2)} MB freed)`);
        handleRefreshStorage();
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('Failed to cleanup orphaned data');
    }
  };

  // Load storage info on mount
  React.useEffect(() => {
    handleRefreshStorage();
  }, []);

  return (
    <div className="space-y-6">
      {/* Feature 5: Configuration Import/Export */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SaveAll className="h-5 w-5 text-emerald-400" /> Configuration Management</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Export or import the full dashboard configuration as a JSON file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400"><Info className="inline h-3 w-3 mr-1" />Exported configuration includes Jira & PG connections (without passwords/tokens), custom KPI plugins, settings, and polling configuration.</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleExportConfig} disabled={configExporting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {configExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export Configuration
            </Button>
            <Button variant="outline" disabled={configImporting} className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700" onClick={() => fileInputRef.current?.click()}>
              {configImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Import Configuration
            </Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
          </div>
        </CardContent>
      </Card>

      {/* General Settings & Rate Limiting - Combined */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-slate-500 dark:text-slate-400" /> General Settings & Rate Limiting</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Configure default values, API rate limiting, and retry behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rate Limiting Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <Sliders className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">API Rate Limiting</h3>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-400">
                <Info className="inline h-3 w-3 mr-1" />
                These settings control how fast the dashboard requests data from Jira. Increase delays if you encounter 429 rate limit errors.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Delay between pages (ms)</Label>
                <Input type="number" value={settings.rateLimit.delayMs} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, delayMs: parseInt(e.target.value) || 0 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Extra delay between requests</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Max requests / minute</Label>
                <Input type="number" value={settings.rateLimit.maxRequestsPerMinute} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, maxRequestsPerMinute: parseInt(e.target.value) || 60 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Auto-calculated interval</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Batch size (per page)</Label>
                <Input type="number" value={settings.rateLimit.batchSize} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, batchSize: parseInt(e.target.value) || 50 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Issues per API request</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Backoff on 429</Label>
                <Select value={settings.rateLimit.backoffStrategy} onValueChange={(v) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, backoffStrategy: v } })}>
                  <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (retry immediately)</SelectItem>
                    <SelectItem value="linear">Linear (1s, 2s, 3s...)</SelectItem>
                    <SelectItem value="exponential">Exponential (1s, 2s, 4s...)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 dark:text-slate-500">Strategy when rate-limited</p>
              </div>
            </div>
          </div>

          {/* General Settings Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <Calculator className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">KPI Calculation Defaults</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Default German State</Label>
                <Select value={settings.general.defaultHolidayState} onValueChange={(v) => setSettings({ ...settings, general: { ...settings.general, defaultHolidayState: v } })}>
                  <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GERMAN_STATES.map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 dark:text-slate-500">For holiday calculations</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Work hours start</Label>
                <Input type="number" value={settings.general.workStartHour} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, workStartHour: parseInt(e.target.value) || 9 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Business hours begin</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Work hours end</Label>
                <Input type="number" value={settings.general.workEndHour} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, workEndHour: parseInt(e.target.value) || 17 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Business hours end</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Default SLA target (hours)</Label>
                <Input type="number" value={settings.general.defaultSlaTargetHours} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, defaultSlaTargetHours: parseInt(e.target.value) || 40 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">For SLA compliance</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Settings</>}
              </Button>
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                  <Info className="h-4 w-4" />
                  <span>You have unsaved changes</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">All rate limiting and general settings will be saved and applied to future extractions</p>
          </div>
        </CardContent>
      </Card>

      {/* Session Persistence */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-400" /> Session Persistence</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Control how extraction data is saved and restored across sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Storage Info Display */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-400">
                  Stored Extractions
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-500">
                  {storageInfo?.totalExtractions || 0} extractions, ~{storageInfo?.totalSizeMB?.toFixed(1) || '0.0'} MB
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStorage}
                disabled={loadingStorage}
                className="border-blue-300 dark:border-blue-500/30"
              >
                {loadingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            {/* Per-connection breakdown */}
            {storageInfo?.byConnection && storageInfo.byConnection.length > 0 && (
              <div className="space-y-2 mt-4 pt-4 border-t border-blue-200 dark:border-blue-500/20">
                <p className="text-xs font-medium text-blue-800 dark:text-blue-400">By Connection</p>
                {storageInfo.byConnection.map((conn) => (
                  <div key={conn.connectionId} className="flex items-center justify-between text-xs">
                    <div className="flex-1">
                      <p className="font-medium text-blue-900 dark:text-blue-300">{conn.connectionName}</p>
                      <p className="text-blue-700 dark:text-blue-500">
                        {conn.extractions} extractions, {conn.totalTickets} tickets
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-blue-900 dark:text-blue-300">
                        ~{conn.totalSizeMB.toFixed(1)} MB
                      </p>
                      {conn.newestExtraction && (
                        <p className="text-blue-700 dark:text-blue-500">
                          {new Date(conn.newestExtraction).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Orphaned Data Warning */}
            {storageInfo && storageInfo.orphanedExtractions > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-500/20">
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
                        ⚠️ Orphaned Data Detected
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        {storageInfo.orphanedExtractions} extractions from deleted connections
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCleanupOrphaned}
                      className="border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10 text-xs"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Cleanup
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Auto-save Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-slate-700 dark:text-slate-300">
                Auto-save after extraction
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatically save extraction results to database
              </p>
            </div>
            <Switch
              checked={settings.persistence?.autoSave ?? true}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  persistence: { ...settings.persistence, autoSave: checked }
                })
              }
            />
          </div>

          {/* Auto-restore Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-slate-700 dark:text-slate-300">
                Auto-restore on page load
              </Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reload latest extraction when opening dashboard
              </p>
            </div>
            <Switch
              checked={settings.persistence?.autoRestore ?? true}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  persistence: { ...settings.persistence, autoRestore: checked }
                })
              }
            />
          </div>

          {/* Retention Policy */}
          <div className="space-y-2">
            <Label className="text-slate-700 dark:text-slate-300">
              Auto-cleanup after
            </Label>
            <Select
              value={String(settings.persistence?.retentionDays ?? 30)}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  persistence: {
                    ...settings.persistence,
                    retentionDays: value === 'never' ? 'never' : parseInt(value)
                  }
                })
              }
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically delete old extractions older than this period
            </p>
          </div>

          {/* Manual Cleanup */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCleanup}
              className="flex-1 border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Old Data
            </Button>
            <Button
              variant="outline"
              onClick={handleClearAll}
              className="border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
