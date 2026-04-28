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
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Database, RefreshCw, Download, Settings, BarChart3,
  Clock, AlertTriangle, TrendingUp, Zap, Plug, Calendar,
  CheckCircle2, XCircle, Loader2, Plus, Trash2, FileJson,
  FileSpreadsheet, Activity, Target, Timer, UserCheck,
  Server, Key, Info, ExternalLink, Search,
  HardDrive, Upload, Shield, EyeOff, X,
  RotateCw, Wand2, Sliders,
  Save, SaveAll, Sun, Moon,
  LayoutGrid, Edit2, Ticket, GripVertical,
  Calculator,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { localConfig, buildPgConnectionUrl, isSupabaseUrl, type KpiPlugin, type AppSettings, type SavedJql } from '@/lib/config/local-store';

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
  // Static server-safe defaults to prevent hydration mismatch
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('jira-etl-theme', theme);
  }, [theme, mounted]);

  const [activeTab, setActiveTab] = useState('extract');
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
  const [settings, setSettings] = useState<AppSettings | any>(localConfig.getSettings());
  const [kpiResults, setKpiResults] = useState<any>([]);
  const [storageConfig, setStorageConfig] = useState<{ provider: 'sqlite' | 'postgresql', url: string, directUrl?: string, isCustom: boolean }>({ provider: 'sqlite', url: '', isCustom: false });

  // Client-only: restore persisted state from localStorage on mount
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing with localStorage external system on client mount only */
  useEffect(() => {
    // Restore theme from localStorage
    const savedTheme = localStorage.getItem('jira-etl-theme');
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    } else {
      setTheme('light');
    }
    setMounted(true);

    // Restore connections from localStorage
    const savedConnections = localConfig.getJiraConnections();
    setConnections(savedConnections);

    // Restore active connection ID
    const savedActiveId = localConfig.getActiveConnectionId();
    if (savedActiveId && savedConnections.some(c => c.id === savedActiveId)) {
      setActiveConnectionId(savedActiveId);
    } else if (savedConnections.length > 0) {
      setActiveConnectionId(savedConnections[0].id);
    }

    // Restore settings from localStorage
    const savedSettings = localConfig.getSettings();
    setSettings(savedSettings);

    // Restore storage config from localStorage
    const savedStorage = localConfig.getStorageConfig();
    if (savedStorage) {
      setStorageConfig(savedStorage);
    }

    // Restore region from settings
    if (savedSettings?.general?.defaultHolidayState) {
      setRegion(savedSettings.general.defaultHolidayState);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle connection switching and auto-restore
  useEffect(() => {
    if (!activeConnectionId) return;

    const handleConnectionSwitch = async () => {
      // Clear KPI results when connection changes
      setKpiResults([]);

      // Save active connection ID
      localConfig.setActiveConnectionId(activeConnectionId);

      // Check if auto-restore is enabled
      const currentSettings = localConfig.getSettings();
      if (!currentSettings.persistence?.autoRestore) {
        // Auto-restore disabled, clear results
        setExtractionResult(null);
        return;
      }

      // Try to load extraction for this connection
      try {
        const storageConfig = localConfig.getStorageConfig();
        const res = await fetch(`/api/jira/extract/latest/${activeConnectionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageConfig })
        });
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
        const storageConfig = localConfig.getStorageConfig();
        const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', storageConfig })
        });
        const masterData = await masterRes.json();

        if (masterData.success && masterData.data) {
          setMasterDatasetInfo({
            totalExtracted: masterData.data.totalExtracted,
            dateRange: masterData.data.dateRange,
            lastUpdated: masterData.data.lastUpdated,
            issues: masterData.data.issues
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
        <div className="mx-auto max-w-5xl flex items-center justify-between px-4 sm:px-6 py-3">
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
                onClick={() => setActiveTab('settings')}
                className="h-8 border-slate-200 dark:border-slate-700"
              >
                <Server className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="h-8 w-8 p-0">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 min-h-[calc(100vh-120px)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Sticky Tab Navigation - Adjusted offset to account for sticky header */}
          <div className="sticky top-[61px] z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-slate-200 dark:border-slate-800">
            <TabsList className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-1 h-auto flex flex-nowrap gap-1 justify-start overflow-x-auto no-scrollbar shadow-sm">
              <TabsTrigger value="extract" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">ETL & Export</span>
              </TabsTrigger>
              <TabsTrigger value="kpi" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">KPI</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="extract" className="space-y-6">
            <Tabs defaultValue="jira-etl" className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <TabsTrigger value="jira-etl" className="gap-2 px-6">
                    <Download className="h-4 w-4" />
                    Jira ETL
                  </TabsTrigger>
                  <TabsTrigger value="db-export" className="gap-2 px-6">
                    <FileJson className="h-4 w-4" />
                    DB Export
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="max-w-4xl mx-auto w-full">
                <TabsContent value="jira-etl" className="mt-0">
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
                    storageConfig={storageConfig}
                  />
                </TabsContent>

                <TabsContent value="db-export" className="mt-0">
                  <ExportPanel
                    extractionResult={extractionResult}
                    dateFrom={dateFrom}
                    setDateFrom={setDateFrom}
                    dateTo={dateTo}
                    setDateTo={setDateTo}
                    region={region}
                    setRegion={setRegion}
                    storageConfig={storageConfig}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>

          <TabsContent value="kpi" className="space-y-6 overflow-hidden">
            <Tabs defaultValue="dashboard" className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <TabsTrigger value="dashboard" className="gap-2 px-6">
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="plugins" className="gap-2 px-6">
                    <Plug className="h-4 w-4" />
                    Plugins Configuration
                  </TabsTrigger>
                  <TabsTrigger value="holidays" className="gap-2 px-6">
                    <Calendar className="h-4 w-4" />
                    Holidays Calendar
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="dashboard" className="mt-0">
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
                  storageConfig={storageConfig}
                />
              </TabsContent>

              <div className="max-w-4xl mx-auto w-full">
                <TabsContent value="plugins" className="mt-0">
                  <PluginsPanel settings={settings} onSettingsUpdate={handleSettingsUpdate} />
                </TabsContent>

                <TabsContent value="holidays" className="mt-0">
                  <HolidaysPanel region={region} setRegion={setRegion} />
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 overflow-hidden">
            <Tabs defaultValue="connections" className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <TabsTrigger value="connections" className="gap-2 px-6">
                    <Server className="h-4 w-4" />
                    Connections
                  </TabsTrigger>
                  <TabsTrigger value="storage" className="gap-2 px-6">
                    <HardDrive className="h-4 w-4" />
                    Storage
                  </TabsTrigger>
                  <TabsTrigger value="config" className="gap-2 px-6">
                    <Settings className="h-4 w-4" />
                    Configuration
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="max-w-4xl mx-auto w-full">
                <TabsContent value="connections" className="mt-0">
                  <ConnectionsPanel
                    connections={connections}
                    setConnections={setConnections}
                    activeConnectionId={activeConnectionId}
                    setActiveConnectionId={setActiveConnectionId}
                    storageConfig={storageConfig}
                    setStorageConfig={setStorageConfig}
                  />
                </TabsContent>

                <TabsContent value="storage" className="mt-0">
                  <StoragePanel 
                    storageConfig={storageConfig} 
                    setStorageConfig={setStorageConfig}
                    settings={settings}
                    setSettings={setSettings}
                  />
                </TabsContent>

                <TabsContent value="config" className="mt-0">
                  <SettingsPanel onSettingsUpdate={handleSettingsUpdate} storageConfig={storageConfig} />
                </TabsContent>
              </div>
            </Tabs>
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

function ConnectionsPanel({ connections, setConnections, activeConnectionId, setActiveConnectionId, storageConfig, setStorageConfig }: {
  connections: JiraConnection[];
  setConnections: any;
  activeConnectionId: string;
  setActiveConnectionId: (id: string) => void;
  storageConfig: any;
  setStorageConfig: any;
}) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [form, setForm] = useState({
    name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load Jira connections from localStorage - useLayoutEffect for synchronous read
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing with localStorage external system */
  React.useLayoutEffect(() => {
    setLoading(true);
    const updatedConnections = localConfig.getJiraConnections();
    setConnections(updatedConnections);
    setLoading(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveJira = () => {
    if (!form.name || !form.baseUrl || !form.apiToken || !form.email) {
      toast.error('All fields except Project Keys are required'); return;
    }

    const allConns = localConfig.getJiraConnections();
    const newConn: JiraConnection = {
      id: editingId || crypto.randomUUID(),
      name: form.name,
      baseUrl: form.baseUrl,
      apiToken: form.apiToken,
      email: form.email,
      projectKeys: form.projectKeys,
      isActive: true,
    };

    const updatedConns = editingId
      ? allConns.map(c => c.id === editingId ? newConn : c)
      : [...allConns, newConn];

    localConfig.saveJiraConnections(updatedConns);
    setConnections(updatedConns); // Update in-memory state
    toast.success(editingId ? 'Jira connection updated' : 'Jira connection saved');
    setForm({ name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '' });
    setEditingId(null);
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

        toast.success(`Connected to ${serverTitle}`, {
          description: `Jira ${deploymentType} (v${version}) - ${responseTime}`,
          duration: 5000,
          position: 'top-right'
        });
      } else {
        setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
        toast.error(`Connection Failed`, {
          description: data.error || 'Connection failed',
          duration: 5000,
          position: 'top-right'
        });
      }
    } catch (error) {
      setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
      toast.error('Network Error', {
        description: 'Could not reach the test server',
        duration: 5000,
        position: 'top-right'
      });
    }
    setTesting(null);
  };

  const handleDelete = async (id: string) => {
    const connection = connections.find(c => c.id === id);
    if (!connection) return;

    if (!confirm(`Are you sure you want to delete connection "${connection.name}"?\n\nThis will also delete all associated EXTRACTION data in the database. Configuration is only deleted in this browser.`)) {
      return;
    }

    try {
      await fetch(`/api/jira/master/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', storageConfig })
      });
      await fetch(`/api/jira/extract/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeDate: new Date().toISOString(), storageConfig })
      });

      const updatedConns = connections.filter(c => c.id !== id);
      localConfig.saveJiraConnections(updatedConns);
      setConnections(updatedConns); // Update in-memory state

      toast.success(`Connection "${connection.name}" and its database data deleted`);
      if (activeConnectionId === id) {
        setActiveConnectionId(updatedConns.length > 0 ? updatedConns[0].id : '');
      }
    } catch (error) {
      toast.error('Failed to clean up server-side data');
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = connections.findIndex((c) => c.id === active.id);
      const newIndex = connections.findIndex((c) => c.id === over.id);
      const newConnections = arrayMove(connections, oldIndex, newIndex);
      setConnections(newConnections);
      localConfig.saveJiraConnections(newConnections);
      toast.success('Connections reordered');
    }
  };

  return (
    <div className="space-y-6">
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
        <CardContent className="space-y-4">
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
            ) : connections.length === 0 ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No Jira connections configured yet</p>
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
                          testStatus={testStatus || {}}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Storage Panel ────────────────────────────────────────────────────────────

function StoragePanel({ storageConfig, setStorageConfig, settings, setSettings }: { storageConfig: any, setStorageConfig: any, settings: any, setSettings: any }) {
  const [pgConnections, setPgConnections] = useState<PgConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  const [pgForm, setPgForm] = useState({
    name: '', host: '', port: '5432', database: '', username: '', password: '',
    sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results',
  });
  const [editingPgId, setEditingPgId] = useState<string | null>(null);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState<{
    totalExtractions: number;
    totalSizeMB: number;
    totalTickets: number;
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

  // Load PG connections from localStorage - useLayoutEffect for synchronous read
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing with localStorage external system */
  React.useLayoutEffect(() => {
    setLoading(true);
    const updatedPgConnections = localConfig.getPgConnections();
    setPgConnections(updatedPgConnections);
    setLoading(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load storage info on mount - useLayoutEffect for synchronous operation
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: calling handleRefreshStorage which syncs with API external system */
  React.useLayoutEffect(() => {
    handleRefreshStorage();
  }, [storageConfig]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRefreshStorage = async () => {
    setLoadingStorage(true);
    try {
      const activeConnections = localConfig.getJiraConnections();
      const res = await fetch('/api/jira/extract/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeConnections, storageConfig })
      });
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
        body: JSON.stringify({ retentionDays, storageConfig }),
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
        body: JSON.stringify({ beforeDate: new Date().toISOString(), storageConfig }),
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
        body: JSON.stringify({ cleanupOrphaned: true, storageConfig }),
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

  const handleSavePg = () => {
    if (!pgForm.name || !pgForm.host || !pgForm.database || !pgForm.username) {
      toast.error('Name, host, database, and username are required'); return;
    }
    const all = localConfig.getPgConnections();
    const newConn: PgConnection = {
      id: editingPgId || crypto.randomUUID(),
      name: pgForm.name,
      host: pgForm.host,
      port: parseInt(pgForm.port) || 5432,
      database: pgForm.database,
      username: pgForm.username,
      password: pgForm.password,
      sslMode: pgForm.sslMode,
      schemaName: pgForm.schemaName,
      tableName: pgForm.tableName,
      isActive: true,
    };
    const updated = editingPgId ? all.map(c => c.id === editingPgId ? newConn : c) : [...all, newConn];
    localConfig.savePgConnections(updated);
    setPgConnections(updated); // Update in-memory state
    toast.success('PostgreSQL connection saved');
    setPgForm({ name: '', host: '', port: '5432', database: '', username: '', password: '', sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results' });
    setEditingPgId(null);
  };

  const handleTestPg = async (conn: PgConnection) => {
    setTestingId(conn.id);
    try {
      const res = await fetch('/api/pg/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: conn.host, port: conn.port, database: conn.database, username: conn.username, password: conn.password, sslMode: conn.sslMode }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Connected to ${conn.name}`);
        setTestStatus(prev => ({ ...prev, [conn.id]: 'success' }));
      } else {
        toast.error(data.error || 'Connection failed');
        setTestStatus(prev => ({ ...prev, [conn.id]: 'error' }));
      }
    } catch { toast.error('Network error testing connection'); }
    setTestingId(null);
  };

  const handleSetPrimary = (conn: PgConnection) => {
    const url = buildPgConnectionUrl(conn);
    setStorageConfig({
      ...storageConfig,
      provider: 'postgresql',
      url,
      isCustom: true,
      connectionId: conn.id
    });
    localConfig.saveStorageConfig({
      ...storageConfig,
      provider: 'postgresql',
      url,
      isCustom: true,
      connectionId: conn.id
    });
    toast.success(`${conn.name} set as Primary Storage`);
  };


  return (
    <div className="space-y-6">
      {/* Section 1: Primary Storage Selector */}
      <Card className="border-violet-500/30 bg-violet-50 dark:bg-violet-500/5 overflow-hidden">
        <div className="bg-violet-600/10 px-4 py-2 border-b border-violet-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Primary Operational Storage</span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-400 border-violet-500/30">
            {storageConfig.provider === 'sqlite' ? 'LOCAL SQLITE' : isSupabaseUrl(storageConfig.url) ? 'SUPABASE' : 'POSTGRESQL'}
          </Badge>
        </div>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => {
                const cfg = { ...storageConfig, provider: 'sqlite', url: '', isCustom: false, connectionId: undefined };
                setStorageConfig(cfg);
                localConfig.saveStorageConfig(cfg);
                toast.info('Switched to Local SQLite');
              }}
              className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${storageConfig.provider === 'sqlite' ? 'border-violet-500 bg-violet-500/10' : 'border-slate-200 dark:border-slate-800 hover:border-violet-500/50'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${storageConfig.provider === 'sqlite' ? 'bg-violet-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Local SQLite</h4>
                  <p className="text-xs text-slate-500">dev.db (Not for Vercel)</p>
                </div>
              </div>
            </div>

            <div
              onClick={() => {
                if (pgConnections.length > 0 && !storageConfig.connectionId) {
                  handleSetPrimary(pgConnections[0]);
                } else if (storageConfig.provider !== 'postgresql') {
                  setStorageConfig({ ...storageConfig, provider: 'postgresql', isCustom: true });
                }
              }}
              className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${storageConfig.provider === 'postgresql' ? 'border-violet-500 bg-violet-500/10' : 'border-slate-200 dark:border-slate-800 hover:border-violet-500/50'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${storageConfig.provider === 'postgresql' ? 'bg-violet-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">PostgreSQL / Supabase</h4>
                  <p className="text-xs text-slate-500">External DB (Cloud Ready)</p>
                </div>
              </div>
            </div>
          </div>

          {storageConfig.provider === 'postgresql' && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Active Connection</Label>
                <Select
                  value={storageConfig.connectionId || 'custom'}
                  onValueChange={(val) => {
                    if (val === 'custom') {
                      setStorageConfig({ ...storageConfig, connectionId: undefined });
                    } else {
                      const conn = pgConnections.find(c => c.id === val);
                      if (conn) handleSetPrimary(conn);
                    }
                  }}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-950 border-violet-500/20">
                    <SelectValue placeholder="Select a saved database..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">-- Use Raw URL --</SelectItem>
                    {pgConnections.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(!storageConfig.connectionId || storageConfig.connectionId === 'custom') && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-slate-500">Custom Connection String</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="postgres://user:pass@host:port/db"
                      value={storageConfig.url}
                      onChange={(e) => setStorageConfig({ ...storageConfig, url: e.target.value })}
                      className="bg-white dark:bg-slate-950 border-violet-500/20"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        localConfig.saveStorageConfig(storageConfig);
                        toast.success('Raw URL storage configuration saved');
                      }}
                      className="border-violet-500/30"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Saved Database Backends */}
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Saved DB Connections</h3>
            <Badge variant="outline">{pgConnections.length} Backends</Badge>
          </div>

          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3">
              {pgConnections.map(conn => {
                const isPrimary = storageConfig.connectionId === conn.id;
                const isSupabase = isSupabaseUrl(buildPgConnectionUrl(conn));
                return (
                  <Card key={conn.id} className={`border-slate-200 dark:border-slate-800 transition-all ${isPrimary ? 'ring-2 ring-violet-500 border-transparent shadow-lg' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-3">
                          <div className={`p-2 rounded-lg ${isPrimary ? 'bg-violet-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            <Server className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm">{conn.name}</h4>
                              <Badge variant="outline" className="text-[10px] uppercase font-bold text-violet-400 border-violet-500/30">
                                {isSupabase ? 'SUPABASE' : 'POSTGRES'}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate max-w-[200px] mt-1">{conn.host}:{conn.port}/{conn.database}</p>
                          </div>
                        </div>
                        {isPrimary ? (
                          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px]">PRIMARY</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetPrimary(conn)}
                            className="text-[10px] h-7 px-2 border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                          >
                            Set as Primary
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestPg(conn)}
                          disabled={testingId === conn.id}
                          className="text-[10px] h-7 px-2 flex-1 border-slate-200 dark:border-slate-700"
                        >
                          {testingId === conn.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                          Test
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPgForm({ ...conn, port: conn.port.toString(), password: '' });
                            setEditingPgId(conn.id);
                          }}
                          className="text-[10px] h-7 px-2 flex-1 border-slate-200 dark:border-slate-700"
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this connection?')) {
                              const updated = pgConnections.filter(c => c.id !== conn.id);
                              localConfig.savePgConnections(updated);
                              setPgConnections(updated); // Update in-memory state
                            }
                          }}
                          className="text-[10px] h-7 px-2 flex-1 border-red-200 dark:border-red-900/30 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

            </div>
          </ScrollArea>
        </div>

        {/* Section 3: Add New Forms */}
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                {editingPgId ? <Edit2 className="h-4 w-4 text-violet-400" /> : <Plus className="h-4 w-4 text-violet-400" />}
                {editingPgId ? 'Edit PostgreSQL' : 'Add PostgreSQL'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Connection Name" value={pgForm.name} onChange={(e) => setPgForm({ ...pgForm, name: e.target.value })} className="h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Host" value={pgForm.host} onChange={(e) => setPgForm({ ...pgForm, host: e.target.value })} className="col-span-2 h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />
                <Input placeholder="Port" value={pgForm.port} onChange={(e) => setPgForm({ ...pgForm, port: e.target.value })} className="h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Database" value={pgForm.database} onChange={(e) => setPgForm({ ...pgForm, database: e.target.value })} className="h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />
                <Input placeholder="Username" value={pgForm.username} onChange={(e) => setPgForm({ ...pgForm, username: e.target.value })} className="h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />
              </div>
              <Input placeholder="Password" type="password" value={pgForm.password} onChange={(e) => setPgForm({ ...pgForm, password: e.target.value })} className="h-8 text-xs bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" />

              <div className="flex gap-2 pt-1">
                <Button onClick={handleSavePg} className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-700">
                  {editingPgId ? 'Update Backend' : 'Save Backend'}
                </Button>
                {editingPgId && (
                  <Button variant="outline" size="sm" onClick={() => { setEditingPgId(null); setPgForm({ name: '', host: '', port: '5432', database: '', username: '', password: '', sslMode: 'prefer', schemaName: 'public', tableName: 'jira_kpi_results' }); }} className="h-8 text-xs">
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
                  {storageInfo?.totalExtractions || 0} extractions, {storageInfo?.totalTickets || 0} total tickets, ~{storageInfo?.totalSizeMB?.toFixed(1) || '0.0'} MB
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
                        {conn.extractions} extractions, <span className="font-semibold text-blue-600 dark:text-blue-400">{conn.totalTickets} master tickets</span>
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

// ─── Extract Panel ────────────────────────────────────────────────────────────

const ExtractPanel = React.memo(function ExtractPanel({
  connections, extractionResult, setExtractionResult, masterDatasetInfo, setMasterDatasetInfo,
  dateFrom, setDateFrom, dateTo, setDateTo,
  activeConnectionId, settings, setSettings, setKpiResults, storageConfig
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
  storageConfig: any,
}) {
  const [jql, setJql] = useState('');
  const [extracting, setExtracting] = useState(false);

  // Saved JQL state
  const [savedJqls, setSavedJqls] = useState<SavedJql[]>([]);
  const [newJqlName, setNewJqlName] = useState('');
  const [isSavingJql, setIsSavingJql] = useState(false);

  useEffect(() => {
    setSavedJqls(localConfig.getSavedJqls());
  }, []);

  const handleSaveJql = () => {
    if (!jql.trim()) { toast.error('Enter a JQL query first'); return; }
    if (!newJqlName.trim()) { toast.error('Enter a name for this query'); return; }

    const newSavedJql: SavedJql = {
      id: `jql-${Date.now()}`,
      name: newJqlName.trim(),
      query: jql.trim()
    };

    const updated = [...savedJqls, newSavedJql];
    setSavedJqls(updated);
    localConfig.saveJqls(updated);
    setNewJqlName('');
    setIsSavingJql(false);
    toast.success('JQL query saved');
  };

  const handleDeleteJql = (id: string) => {
    const updated = savedJqls.filter(j => j.id !== id);
    setSavedJqls(updated);
    localConfig.saveJqls(updated);
    toast.success('Saved JQL deleted');
  };

  // Persistence state
  const [saveThisExtraction, setSaveThisExtraction] = useState(true);

  // Polling state
  const [polling, setPolling] = useState<PollingStatus | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollInterval, setPollInterval] = useState('15');
  const [pollSaving, setPollSaving] = useState(false);

  // List filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Load polling status
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing state with polling API external system */
  React.useEffect(() => {
    const loadPolling = () => {
      // Skip polling updates during active extraction to prevent flickering
      if (extracting) return;
      
      fetch('/api/jira/poll').then((r) => r.json()).then((d) => {
        if (d.success) {
          // Only update if data actually changed to minimize re-renders
          setPolling(prev => JSON.stringify(prev) === JSON.stringify(d.polling) ? prev : d.polling);
          setPollEnabled(d.polling.enabled);
          setPollInterval(String(d.polling.intervalMinutes));
        }
      });
    };
    loadPolling();
    const timer = setInterval(loadPolling, 5000);
    return () => clearInterval(timer);
  }, [extracting]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load settings for persistence - useLayoutEffect for synchronous localStorage read
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing with localStorage external system */
  React.useLayoutEffect(() => {
    const savedSettings = localConfig.getSettings();
    setSettings(savedSettings);
    setSaveThisExtraction(savedSettings.persistence?.autoSave ?? true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', text.substring(0, 500));
      return { success: false, error: `Server error (${res.status})` };
    }
  };

  const handleExtract = async (daysBack?: number) => {
    if (!activeConnectionId) { toast.error('Please select a connection in the Connections tab'); return; }
    setExtracting(true); setKpiResults([]);

    // Show loading toast
    const loadingToast = toast.loading('Extracting issues from Jira...', { duration: 0 });

    try {
      const activeConn = connections.find(c => c.id === activeConnectionId);
      if (!activeConn) throw new Error('Selected connection not found');

      const body: Record<string, unknown> = {
        connectionRef: activeConnectionId,
        jiraCredentials: {
          baseUrl: activeConn.baseUrl,
          email: activeConn.email,
          apiToken: activeConn.apiToken,
          projectKeys: activeConn.projectKeys
        },
        rateLimit: settings?.rateLimit,
        generalSettings: settings?.general,
        customPlugins: localConfig.getKpiPlugins(),
        jql: jql || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        saveExtraction: saveThisExtraction,
        storageConfig
      };
      if (daysBack) body.daysBack = daysBack;

      const res = await fetch('/api/jira/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      const data = await safeJson(res);

      if (res.ok && data.success) {
        const extractedCount = data.summary.totalExtracted;

        // If extraction returned 0 issues, show warning instead of success
        if (extractedCount === 0) {
          toast.warning('Extraction returned 0 issues. This could be due to: invalid/expired API token, incorrect project key, or no issues in the date range. Try testing your connection and checking credentials.', { duration: 8000 });
        } else {
          const { added, updated, unchanged, deleted } = data.summary;
          const stats = [
            added > 0 ? `${added} added` : null,
            updated > 0 ? `${updated} updated` : null,
            unchanged > 0 ? `${unchanged} unchanged` : null,
            deleted > 0 ? `${deleted} deleted` : null
          ].filter(Boolean).join(', ');

          const saveMsg = saveThisExtraction ? ' and synced to master dataset' : '';
          toast.success(`Extracted ${extractedCount} issues${saveMsg}${stats ? ` (${stats})` : ''}`);
        }

        if (extractedCount === 0) {
          setExtractionResult(null);
        } else {
          setExtractionResult({ total: extractedCount, etlRunId: data.etlRunId, issues: data.issues });
        }

        // Reload master dataset info after extraction
        try {
          const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get', storageConfig })
          });
          
          const masterData = await safeJson(masterRes);
          if (masterRes.ok && masterData.success && masterData.data) {
            setMasterDatasetInfo({
              totalExtracted: masterData.data.totalExtracted,
              dateRange: masterData.data.dateRange,
              lastUpdated: masterData.data.lastUpdated,
              issues: masterData.data.issues
            });

            // Ping the polling system to let it know we just did a manual pull
            if (pollEnabled) {
              await fetch('/api/jira/poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ping' })
              }).catch(e => console.warn('Failed to ping polling system:', e));
            }
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

  const handleTogglePolling = async (targetState?: boolean, overrideInterval?: string) => {
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !pollEnabled;
    const intervalToUse = overrideInterval || pollInterval;

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
          intervalMinutes: parseInt(intervalToUse) || 15,
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

  const handleShowAllTickets = async () => {
    if (!activeConnectionId) { toast.error('Please select a connection first'); return; }
    setExtracting(true);
    const loadingToast = toast.loading('Fetching all tickets from database...', { duration: 0 });

    try {
      const res = await fetch(`/api/jira/master/${activeConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig })
      });
      
      toast.dismiss(loadingToast);
      const data = await safeJson(res);
      
      if (res.ok && data.success && data.data) {
        setExtractionResult({
          total: data.data.totalExtracted,
          issues: data.data.issues,
          isAllTickets: true
        });
        setMasterDatasetInfo({
          totalExtracted: data.data.totalExtracted,
          dateRange: data.data.dateRange,
          lastUpdated: data.data.lastUpdated,
          issues: data.data.issues
        });
        toast.success(`Loaded all ${data.data.totalExtracted} tickets from database`);
      } else {
        toast.error(data.error || 'Failed to fetch tickets');
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Network error while fetching tickets');
    } finally {
      setExtracting(false);
    }
  };

  const quickPullButtons = [
    { label: 'Since yesterday', days: 1 },
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'Last 365 days', days: 365 },
  ];

  const intervalOptions = [
    { label: '1 min', value: '1' },
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
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-emerald-400" /> Jira Extract</CardTitle>
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
            <div className="flex items-center justify-between">
              <Label className="text-slate-700 dark:text-slate-300">Custom JQL Query <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">(optional)</span></Label>
              <div className="flex gap-2">
                {savedJqls.length > 0 && (
                  <Select onValueChange={(val) => setJql(savedJqls.find(j => j.id === val)?.query || '')}>
                    <SelectTrigger className="h-7 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-[150px]">
                      <SelectValue placeholder="Load saved..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedJqls.map(j => (
                        <div key={j.id} className="flex items-center justify-between group px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer">
                          <SelectItem value={j.id} className="flex-1 cursor-pointer">{j.name}</SelectItem>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteJql(j.id); }}
                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                  onClick={() => setIsSavingJql(!isSavingJql)}
                >
                  <Save className="h-3 w-3 mr-1" /> Save Query
                </Button>
              </div>
            </div>
            
            <textarea className="w-full min-h-[80px] rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-800 dark:text-slate-200 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50" placeholder='project = "PROJ" AND created >= "2024-01-01" ORDER BY created DESC' value={jql} onChange={(e) => setJql(e.target.value)} />
            
            {isSavingJql && (
              <div className="flex items-center gap-2 mt-2 animate-in slide-in-from-top-1 duration-200">
                <Input 
                  placeholder="Query name (e.g. Bug Filter)" 
                  value={newJqlName} 
                  onChange={(e) => setNewJqlName(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
                <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600" onClick={handleSaveJql}>Confirm Save</Button>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setIsSavingJql(false)}>Cancel</Button>
              </div>
            )}
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
            {extracting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting Issues...</> : <><RefreshCw className="mr-2 h-4 w-4" />Run Jira Extraction</>}
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

          <Separator className="bg-emerald-500/10" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-400">
                <Clock className="h-4 w-4" /> Scheduled Pulling
              </Label>
              <div className="flex items-center gap-2">
                {polling?.enabled && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] animate-pulse bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    LIVE
                  </Badge>
                )}
                <Switch checked={pollEnabled} onCheckedChange={handleTogglePolling} disabled={pollSaving || !activeConnectionId} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[150px]">
                <Select value={pollInterval} onValueChange={(v) => { setPollInterval(v); if(pollEnabled) handleTogglePolling(true, v); }} disabled={pollSaving}>
                  <SelectTrigger className="h-9 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Select interval" />
                  </SelectTrigger>
                  <SelectContent>
                    {intervalOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[200px] rounded-md bg-white dark:bg-slate-900 border border-emerald-500/10 p-2">
                <div className="flex flex-col gap-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Run:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{polling?.lastRunAt ? new Date(polling.lastRunAt).toLocaleTimeString() : 'Never'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Next Run:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{polling?.nextRunAt ? new Date(polling.nextRunAt).toLocaleTimeString() : '-'}</span>
                  </div>
                  {polling?.lastError && (
                    <div className="text-red-400 truncate mt-1 border-t border-red-500/10 pt-1">
                      Error: {polling.lastError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Master Dataset Info */}
      {masterDatasetInfo && (
        <Card className="border-blue-500/20 bg-blue-50 dark:bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">< HardDrive className="h-5 w-5 text-blue-400" /> Master Dataset</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">Total tickets accumulated from all extractions for this connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Total Unique Tickets:</span>
              <span className="font-bold text-blue-400">{masterDatasetInfo.totalExtracted}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Date Range:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {masterDatasetInfo.dateRange?.from ? `${new Date(masterDatasetInfo.dateRange.from).toLocaleDateString()} - ${new Date(masterDatasetInfo.dateRange.to).toLocaleDateString()}` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Last Updated:</span>
              <span className="text-slate-700 dark:text-slate-300">{new Date(masterDatasetInfo.lastUpdated).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={handleShowAllTickets}
                disabled={extracting || !activeConnectionId || (masterDatasetInfo && masterDatasetInfo.totalExtracted === 0)}
              >
                <LayoutGrid className="mr-1 h-3 w-3" /> Show All Tickets
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={async () => {
                if (confirm('Are you sure you want to clear the entire master dataset for this connection? This cannot be undone.')) {
                  try {
                    const res = await fetch(`/api/jira/master/${activeConnectionId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'delete', storageConfig })
                    });
                    const data = await res.json();
                    if (data.success) {
                      toast.success(data.message);
                      setMasterDatasetInfo({ totalExtracted: 0, lastUpdated: new Date().toISOString() });
                      setExtractionResult(null); // Clear extraction list display
                      setKpiResults([]); // Clear KPI results
                    }
                  } catch (e) {
                    toast.error('Failed to clear master dataset');
                  }
                }
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Clear Master Dataset
            </Button>
          </div>
        </CardContent>
        </Card>
      )}

      {extractionResult && (extractionResult.total > 0 || extractionResult.issues?.length > 0) && (
        <Card className={`border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 ${extracting ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              {extractionResult.isAllTickets ? (
                <><HardDrive className="h-5 w-5" /> Master Dataset</>
              ) : (
                <><CheckCircle2 className="h-5 w-5" /> Extraction Complete</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{extractionResult.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Extracted</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">
                  {(extractionResult.issues || []).filter((i: any) => {
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    const category = (i.statusCategory || '').toLowerCase();
                    return category === 'done' || ['done', 'closed', 'close', 'resolved', 'completed'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">
                  {(extractionResult.issues || []).filter((i: any) => {
                    const status = (i.fields?.status?.name || i.status || '').toLowerCase();
                    const category = (i.statusCategory || '').toLowerCase();
                    return category !== 'done' && !['done', 'closed', 'close', 'resolved', 'completed'].includes(status);
                  }).length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Oldest</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(() => {
                    const issues = extractionResult.issues || [];
                    const dates = issues
                      .map((i: any) => i.fields?.created || i.created)
                      .filter((d: any) => d)
                      .map((d: any) => new Date(d).getTime());
                    const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
                    return oldestDate ? oldestDate.toLocaleDateString() : 'N/A';
                  })()}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by key or summary..."
                    className="pl-9 bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Array.from(new Set<string>((extractionResult.issues || []).map((i: any) => (i.fields?.status?.name || i.status) as string))).sort().map((status: string) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div 
                className="space-y-1 overflow-y-auto pr-1 custom-scrollbar"
                style={{ maxHeight: `${settings.general.listMaxHeight || 400}px`, scrollbarGutter: 'stable' }}
              >
                {(extractionResult.issues || []).filter((issue: any) => {
                  const key = (issue.key || '').toLowerCase();
                  const summary = (issue.fields?.summary || issue.summary || '').toLowerCase();
                  const status = issue.fields?.status?.name || issue.status;
                  const matchesSearch = key.includes(searchQuery.toLowerCase()) || summary.includes(searchQuery.toLowerCase());
                  const matchesStatus = statusFilter === 'all' || status === statusFilter;
                  return matchesSearch && matchesStatus;
                }).map((issue: any) => {
                  const activeConnection = connections.find(c => c.id === activeConnectionId);

                  // Ensure baseUrl has protocol
                  const baseUrl = activeConnection?.baseUrl || '';
                  const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                  const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                  const isResolved = (() => {
                    const status = (issue.fields?.status?.name || issue.status || '').toLowerCase();
                    const category = (issue.statusCategory || '').toLowerCase();
                    return category === 'done' || ['done', 'closed', 'close', 'resolved', 'completed'].includes(status);
                  })();

                  return (
                    <div key={issue.key} className="flex items-center gap-3 py-2 px-3 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-slate-700/40 dark:bg-slate-800/20 text-sm group">
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
                {(extractionResult.issues || []).length > 0 && (extractionResult.issues || []).filter((issue: any) => {
                  const key = (issue.key || '').toLowerCase();
                  const summary = (issue.fields?.summary || issue.summary || '').toLowerCase();
                  const status = issue.fields?.status?.name || issue.status;
                  const matchesSearch = key.includes(searchQuery.toLowerCase()) || summary.includes(searchQuery.toLowerCase());
                  const matchesStatus = statusFilter === 'all' || status === statusFilter;
                  return matchesSearch && matchesStatus;
                }).length === 0 && (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs italic">
                    No tickets match your filters
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

// ─── KPI Dashboard (unchanged from previous version) ─────────────────────────

function KpiDashboard({
  connections, extractionResult, masterDatasetInfo, setMasterDatasetInfo, dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion, activeConnectionId, settings, kpiResults, setKpiResults, storageConfig
}: any) {
  const [calculating, setCalculating] = useState(false);
  const [hiddenDimensions, setHiddenDimensions] = useState<Set<string>>(new Set());
  const [globalFilters, setGlobalFilters] = useState<Record<string, string[]>>({});
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Drill-down state
  const [drillDownKeys, setDrillDownKeys] = useState<string[] | null>(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [exportingPpt, setExportingPpt] = useState(false);

  const handleExportPPT = async () => {
    if (kpiResults.length === 0) { toast.error('No results to export'); return; }
    setExportingPpt(true);
    const loadingToast = toast.loading('Generating PowerPoint report...', { duration: 0 });

    try {
      const pptxgen = (await import('pptxgenjs')).default;
      const pres = new pptxgen();
      pres.title = 'Jira KPI Report';
      pres.subject = 'Performance Metrics';
      
      // 1. Title Slide
      const slide1 = pres.addSlide();
      slide1.addText('Jira Performance Analysis', { x: 1, y: 1.5, w: 8, h: 1, fontSize: 36, bold: true, color: '3b82f6', align: 'center' });
      slide1.addText(`Report Period: ${dateFrom || 'Start'} to ${dateTo || 'Today'}`, { x: 1, y: 2.5, w: 8, h: 0.5, fontSize: 18, color: '64748b', align: 'center' });
      slide1.addText(`Generated on: ${new Date().toLocaleString()}`, { x: 1, y: 3, w: 8, h: 0.5, fontSize: 14, color: '94a3b8', align: 'center' });
      
      if (Object.keys(globalFilters).length > 0) {
        let filterStr = 'Active Filters: ' + Object.entries(globalFilters).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' | ');
        slide1.addText(filterStr, { x: 1, y: 4.5, w: 8, h: 1, fontSize: 12, italic: true, color: '64748b', align: 'center' });
      }

      // 2. Overview Metrics Slide
      const slide2 = pres.addSlide();
      slide2.addText('Executive Overview', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 24, bold: true, color: '3b82f6' });
      
      let xPos = 0.5;
      let yPos = 1.0;
      
      const visibleMainKpis = mainKpis.flatMap(k => k.results).filter((r, i) => !hiddenDimensions.has(`${mainKpis[0].pluginId}|`)); // Simple check for now
      
      visibleMainKpis.slice(0, 8).forEach((kpi, idx) => {
        if (idx > 0 && idx % 4 === 0) { xPos = 0.5; yPos += 1.8; }
        
        slide2.addText(kpi.name, { x: xPos, y: yPos, w: 2.2, h: 0.4, fontSize: 12, bold: true, color: '64748b', align: 'center' });
        slide2.addText(`${kpi.value}${kpi.unit === '%' ? '%' : ' ' + kpi.unit}`, { x: xPos, y: yPos + 0.4, w: 2.2, h: 0.6, fontSize: 28, bold: true, color: '1e293b', align: 'center' });
        
        if (kpi.comparison) {
          const color = kpi.comparison.change >= 0 ? '10b981' : 'ef4444';
          const sign = kpi.comparison.change >= 0 ? '+' : '';
          slide2.addText(`${sign}${kpi.comparison.change} vs prev`, { x: xPos, y: yPos + 1.0, w: 2.2, h: 0.3, fontSize: 10, color, align: 'center' });
        }
        
        xPos += 2.3;
      });

      // 3. Status Breakdown Slide
      if (statusKpis.length > 0) {
        const slide3 = pres.addSlide();
        slide3.addText('Turnaround Time by Status', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 24, bold: true, color: '3b82f6' });
        
        const kpi = statusKpis[0];
        const rows: any[] = [['Status', 'Avg. Hours', 'Tickets']];
        kpi.results.forEach(r => {
          if (!hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status}`)) {
            rows.push([r.name, r.value.toString(), r.details?.find(d => d.label === 'Unique Issues')?.value.toString() || '']);
          }
        });
        
        slide3.addTable(rows, { x: 0.5, y: 1.0, w: 9, border: { type: 'solid', color: 'cbd5e1' }, fontSize: 11 });
      }

      // 4. Assignee Activity Slide
      if (assigneeKpis.length > 0) {
        const slide4 = pres.addSlide();
        slide4.addText('Team Workload (Open Tickets)', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 24, bold: true, color: '3b82f6' });
        
        const kpi = assigneeKpis[0];
        const rows: any[] = [['Assignee', 'Tickets']];
        kpi.results.forEach(r => {
          if (!hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.assignee}`)) {
            rows.push([r.dimensions?.assignee || 'Unassigned', r.value.toString()]);
          }
        });
        
        slide4.addTable(rows, { x: 0.5, y: 1.0, w: 6, border: { type: 'solid', color: 'cbd5e1' }, fontSize: 11 });
      }

      await pres.writeFile({ fileName: `Jira_KPI_Report_${new Date().toISOString().split('T')[0]}.pptx` });
      toast.success('PowerPoint report downloaded');
    } catch (err: any) {
      console.error('PPT Export failed:', err);
      toast.error('Failed to generate PowerPoint');
    } finally {
      toast.dismiss(loadingToast);
      setExportingPpt(false);
    }
  };

  const toggleDimension = (pluginId: string, dimensionValue: string) => {
    const key = `${pluginId}|${dimensionValue}`;
    setHiddenDimensions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetHidden = () => setHiddenDimensions(new Set());

  // Chart section state
  const [charts, setCharts] = useState<ChartConfig[]>([
    { id: 'chart-1', kpiId: '', type: 'bar', width: 'full' }
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
      width: 'full',
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

  // Extract unique values for filters from master dataset
  const filterOptions = useMemo(() => {
    const issues = (masterDatasetInfo?.issues || []) as any[];
    const getValues = (fn: (i: any) => string | string[] | undefined) => {
      const vals = new Set<string>();
      issues.forEach(i => {
        const v = fn(i);
        if (Array.isArray(v)) v.forEach(x => { if(x) vals.add(x); });
        else if (v) vals.add(v);
      });
      return Array.from(vals).sort();
    };

    return {
      assignee: getValues(i => i.fields?.assignee?.displayName || i.assignee),
      priority: getValues(i => i.fields?.priority?.name || i.priority),
      issueType: getValues(i => i.fields?.issuetype?.name || i.issueType),
      status: getValues(i => i.fields?.status?.name || i.status),
      component: getValues(i => (i.fields?.components || i.components || [])?.map((c: any) => c.name || c)),
      label: getValues(i => i.fields?.labels || i.labels),
    };
  }, [masterDatasetInfo]);

  const handleUpdateFilter = useCallback((key: string, value: string) => {
    if (value === 'all') {
      setGlobalFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      });
      return;
    }

    setGlobalFilters(prev => {
      const current = prev[key] || [];
      const isRemoving = current.includes(value);
      const next = isRemoving
        ? current.filter(v => v !== value)
        : [...current, value];
      
      const newFilters = { ...prev };
      if (next.length > 0) newFilters[key] = next;
      else delete newFilters[key];
      
      return newFilters;
    });
  }, []);

  // Auto-calculate when filters change
  useEffect(() => {
    if (kpiResults.length > 0) handleCalculate();
  }, [globalFilters]);

  const handleCalculate = async () => {
    if (!activeConnectionId) { toast.error('No active connection. Please select a connection first.'); return; }
    setCalculating(true); setKpiResults([]);

    try {
      // Load master dataset (all historical tickets)
      const masterRes = await fetch(`/api/jira/master/${activeConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig })
      });
      const masterData = await masterRes.json();

      if (!masterData.success || !masterData.data?.issues) {
        toast.error('No master dataset found. Please extract data first to build the master dataset.');
        setCalculating(false);
        return;
      }

      const issues = masterData.data.issues;

      // Calculate KPIs on the full master dataset
      // Get active plugins from localStorage
      const activePluginIdsStr = localStorage.getItem('cfg_active_plugins');
      const activePluginIds = activePluginIdsStr ? JSON.parse(activePluginIdsStr) : undefined;
      const customPlugins = localConfig.getKpiPlugins();

      const kpiRes = await fetch('/api/kpi/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: issues,
          holidays: {
            regions: region === 'all' ? [] : [region],
            slaTargetHours: settings?.general?.defaultSlaTargetHours || 40
          },
          slaTargets: settings?.sla?.statusTargets || {},
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          activePluginIds,
          customPlugins,
          globalFilters
        }),
      });

      const kpiData = await kpiRes.json();
      if (kpiData.success) {
        // Convert date strings in timeSeries to Date objects (JSON serialization)
        const processedResults: any[] = [];
        for (const item of kpiData.results) {
          const pluginId = item.pluginId;
          const results = item.results as any[];
          processedResults.push({
            pluginId,
            results: results.map((result: any) => {
              if (!result.timeSeries || result.timeSeries.length === 0) {
                return result; // No timeSeries data, return as-is
              }
              return {
                ...result,
                timeSeries: result.timeSeries.map((ts: any) => ({
                  ...ts,
                  date: new Date(ts.date)
                }))
              };
            })
          });
        }
        setKpiResults(processedResults);
        const dateRange = masterData.data.dateRange;
        setMasterDatasetInfo({
          totalExtracted: masterData.data.totalExtracted,
          dateRange: dateRange,
          lastUpdated: masterData.data.lastUpdated,
          issues: issues
        });
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

  const mainKpis = kpiResults.filter((r) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const assigneeKpis = kpiResults
    .filter((r) => r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId))
    .map(kpi => ({
      ...kpi,
      results: [...kpi.results].sort((a, b) => b.value - a.value)
    }));
  const statusKpis = kpiResults
    .filter((r) => r.results[0]?.dimensions?.status && r.pluginId === 'time_in_status' && !isTimeSeriesPlugin(r.pluginId))
    .map(kpi => ({
      ...kpi,
      results: [...kpi.results].sort((a, b) =>
        (a.dimensions?.status || '').localeCompare(b.dimensions?.status || '', undefined, { numeric: true, sensitivity: 'base' })
      )
    }));
  const slaStatusKpis = kpiResults
    .filter((r) => r.pluginId === 'sla_by_status' || r.pluginId === 'sla_by_status_excl_clone')
    .map(kpi => ({
      ...kpi,
      results: [...kpi.results].sort((a, b) =>
        (a.dimensions?.status || '').localeCompare(b.dimensions?.status || '', undefined, { numeric: true, sensitivity: 'base' })
      )
    }));
  const priorityKpis = kpiResults
    .filter((r) => r.results[0]?.dimensions?.priority && !isTimeSeriesPlugin(r.pluginId))
    .map(kpi => ({
      ...kpi,
      results: [...kpi.results].sort((a, b) =>
        (a.dimensions?.priority || '').localeCompare(b.dimensions?.priority || '', undefined, { numeric: true, sensitivity: 'base' })
      )
    }));

  // Time-series trend KPIs - show in separate section with time-series indicator
  const trendKpis = kpiResults
    .filter((r) => isTimeSeriesPlugin(r.pluginId))
    .map(kpi => ({
      ...kpi,
      results: kpi.results.map(result => ({
        ...result,
        // Convert date strings to Date objects and sort by date
        timeSeries: result.timeSeries
          ?.map((ts) => ({
            ...ts,
            date: ts.date instanceof Date ? ts.date : new Date(ts.date as string)
          }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())
      }))
    }));

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
          <div className="flex gap-3">
            <Button onClick={handleCalculate} disabled={calculating || !extractionResult} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {calculating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating...</> : <><Zap className="mr-2 h-4 w-4" />Calculate All KPIs</>}
            </Button>
            {kpiResults.length > 0 && (
              <Button onClick={handleExportPPT} disabled={exportingPpt} variant="outline" className="border-blue-500/30 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                {exportingPpt ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4 mr-2" />}
                Export PPT
              </Button>
            )}
          </div>

          {kpiResults.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Sliders className="h-4 w-4 text-emerald-500" />
                  Global Filters
                  {Object.keys(globalFilters).length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600">
                      {Object.values(globalFilters).flat().length} active
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {Object.keys(globalFilters).length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setGlobalFilters({})} className="h-7 text-[10px] text-slate-500 hover:text-red-500">
                      Clear All
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setFilterPanelOpen(!filterPanelOpen)} className="h-7 text-[10px] text-emerald-500">
                    {filterPanelOpen ? 'Hide Filters' : 'Show Filters'}
                  </Button>
                </div>
              </div>
              
              <div className="mb-2 px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center gap-2 text-[10px] text-blue-600 dark:text-blue-400">
                <Info className="h-3 w-3" />
                <span>Tip: Click on KPI cards or breakdown bars to see the specific tickets comprising that metric.</span>
              </div>

              {filterPanelOpen && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 animate-in slide-in-from-top-2 duration-200">
                  {[
                    { label: 'Assignee', key: 'assignee', options: filterOptions.assignee },
                    { label: 'Priority', key: 'priority', options: filterOptions.priority },
                    { label: 'Issue Type', key: 'issueType', options: filterOptions.issueType },
                    { label: 'Status', key: 'status', options: filterOptions.status },
                    { label: 'Component', key: 'component', options: filterOptions.component },
                    { label: 'Label', key: 'label', options: filterOptions.label },
                  ].filter(f => f.options.length > 0).map(filter => (
                    <div key={filter.key} className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{filter.label}</Label>
                      <Select 
                        value={globalFilters[filter.key]?.[0] || 'all'} 
                        onValueChange={(v) => handleUpdateFilter(filter.key, v)}
                      >
                        <SelectTrigger className="h-8 text-[11px] bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All {filter.label}s</SelectItem>
                          {filter.options.map(opt => (
                            <div key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm" onClick={(e) => { e.stopPropagation(); handleUpdateFilter(filter.key, opt); }}>
                              <Checkbox checked={globalFilters[filter.key]?.includes(opt)} />
                              <span className="text-xs">{opt}</span>
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(globalFilters).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Object.entries(globalFilters).map(([key, values]) => (
                    values.map(val => (
                      <Badge key={`${key}-${val}`} variant="outline" className="gap-1 px-1.5 py-0 h-5 text-[10px] bg-slate-50 dark:bg-slate-800/50 text-slate-600 border-slate-200">
                        <span className="text-slate-400">{key}:</span> {val}
                        <X 
                          className="h-2.5 w-2.5 cursor-pointer hover:text-red-500 pointer-events-auto" 
                          onClick={(e) => { e.stopPropagation(); handleUpdateFilter(key, val); }} 
                        />
                      </Badge>
                    ))
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {kpiResults.length > 0 && (<>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              Overview
            </h3>
            {Array.from(hiddenDimensions).some(k => mainKpis.some(mk => k === `${mk.pluginId}|`)) && (
              <Button variant="ghost" size="sm" onClick={() => {
                setHiddenDimensions(prev => {
                  const next = new Set(prev);
                  mainKpis.forEach(mk => next.delete(`${mk.pluginId}|`));
                  return next;
                });
              }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                <RotateCw className="h-3 w-3 mr-1" /> Restore All Widgets
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mainKpis.map((kpi) => kpi.results.map((result, idx) => {
              if (hiddenDimensions.has(`${kpi.pluginId}|`)) return null;
              return (
                <KpiCard 
                  key={`${kpi.pluginId}-${idx}`} 
                  result={result} 
                  pluginId={kpi.pluginId} 
                  onHide={() => toggleDimension(kpi.pluginId, '')}
                  onClick={result.ticketKeys ? () => {
                    setDrillDownKeys(result.ticketKeys || []);
                    setDrillDownTitle(result.name);
                  } : undefined}
                />
              );
            }))}
          </div>
        </div>

        {statusKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5 text-blue-400" />Turnaround Time by Status</CardTitle>
                {Array.from(hiddenDimensions).some(k => k.startsWith('time_in_status|')) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setHiddenDimensions(prev => {
                      const next = new Set(prev);
                      Array.from(next).forEach(k => { if(k.startsWith('time_in_status|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-blue-400 hover:text-blue-500 hover:bg-blue-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">{statusKpis.map((kpi) => {
                const visibleResults = kpi.results.filter(r => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`));
                const maxVal = Math.max(...visibleResults.map((r) => r.value), 1);
                
                return visibleResults.map((result, idx) => (
                  <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span 
                          className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-blue-500 hover:underline"
                          onClick={() => {
                            setDrillDownKeys(result.ticketKeys || []);
                            setDrillDownTitle(result.name);
                          }}
                        >
                          {result.name}
                        </span>
                        <button 
                          onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                          title="Hide bar"
                        >
                          <EyeOff className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-mono font-semibold text-blue-400">{result.value.toFixed(1)} {result.unit}</span>
                    </div>
                    <div 
                      className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-blue-400 transition-all"
                      onClick={() => {
                        setDrillDownKeys(result.ticketKeys || []);
                        setDrillDownTitle(result.name);
                      }}
                    >
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500" 
                        style={{ width: `${(result.value / maxVal) * 100}%` }} 
                      />
                    </div>
                  </div>
                ));
              })}</div>
            </CardContent>
          </Card>
        )}
        {priorityKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" />SLA by Priority</CardTitle>
                {Array.from(hiddenDimensions).some(k => k.startsWith('sla_by_priority|')) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setHiddenDimensions(prev => {
                      const next = new Set(prev);
                      Array.from(next).forEach(k => { if(k.startsWith('sla_by_priority|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-amber-400 hover:text-amber-500 hover:bg-amber-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{priorityKpis.map((kpi) => kpi.results.map((result, idx) => {
                if (hiddenDimensions.has(`${kpi.pluginId}|${result.dimensions?.priority}`)) return null;
                const isClickable = result.ticketKeys && result.ticketKeys.length > 0;
                return (
                  <div 
                    key={`${kpi.pluginId}-${idx}`} 
                    className={`rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 relative group transition-all ${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800' : ''}`}
                    onClick={isClickable ? () => {
                      setDrillDownKeys(result.ticketKeys || []);
                      setDrillDownTitle(`${result.name} - ${result.dimensions?.priority}`);
                    } : undefined}
                  >
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleDimension(kpi.pluginId, result.dimensions?.priority || ''); }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                      title="Hide widget"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                    <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.priority}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}%</span></div>
                  </div>
                );
              }))}</div>
            </CardContent>
          </Card>
        )}
        {slaStatusKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-emerald-400" />SLA by Status</CardTitle>
                {Array.from(hiddenDimensions).some(k => k.startsWith('sla_by_status|') || k.startsWith('sla_by_status_excl_clone|')) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setHiddenDimensions(prev => {
                      const next = new Set(prev);
                      Array.from(next).forEach(k => { if(k.startsWith('sla_by_status|') || k.startsWith('sla_by_status_excl_clone|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
              <CardDescription className="text-slate-600 dark:text-slate-400">Compliance with per-status SLA targets. Assignee comments reset the clock.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{slaStatusKpis.map((kpi) => kpi.results.map((result, idx) => {
                if (hiddenDimensions.has(`${kpi.pluginId}|${result.dimensions?.status}`)) return null;
                const isClickable = result.ticketKeys && result.ticketKeys.length > 0;
                return (
                  <div 
                    key={`${kpi.pluginId}-${idx}`} 
                    className={`rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 relative group transition-all ${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800' : ''}`}
                    onClick={isClickable ? () => {
                      setDrillDownKeys(result.ticketKeys || []);
                      setDrillDownTitle(`${result.name} - ${result.dimensions?.status}`);
                    } : undefined}
                  >
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleDimension(kpi.pluginId, result.dimensions?.status || ''); }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                      title="Hide widget"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                    <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.status}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}%</span></div>
                    {result.details && (
                      <div className="space-y-1 mt-2">
                        <div className="flex justify-between text-xs text-slate-500"><span>Target:</span><span className="font-mono">{result.details.find(d => d.label === 'Target')?.value || '-'}h</span></div>
                        <div className="flex justify-between text-xs text-slate-500"><span>Within SLA:</span><span className="font-mono">{result.details.find(d => d.label === 'Within SLA')?.value || 0}/{result.details.find(d => d.label === 'Total')?.value || 0}</span></div>
                      </div>
                    )}
                  </div>
                );
              }))}</div>
            </CardContent>
          </Card>
        )}


        {assigneeKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-indigo-400" />Tickets by Assignee</CardTitle>
                {Array.from(hiddenDimensions).some(k => k.startsWith('open_tickets_by_assignee|')) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setHiddenDimensions(prev => {
                      const next = new Set(prev);
                      Array.from(next).forEach(k => { if(k.startsWith('open_tickets_by_assignee|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-indigo-400 hover:text-indigo-500 hover:bg-indigo-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">{assigneeKpis.map((kpi) => {
                const visibleResults = kpi.results.filter(r => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.assignee || r.name}`));
                const maxVal = Math.max(...visibleResults.map((r: any) => r.value), 1);
                
                return (
                  <div key={kpi.pluginId} className="space-y-3">
                    {visibleResults.map((result, idx) => (
                      <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span 
                              className="text-slate-700 dark:text-slate-300 font-medium cursor-pointer hover:text-blue-500 hover:underline"
                              onClick={() => {
                                setDrillDownKeys(result.ticketKeys || []);
                                setDrillDownTitle(`${result.name} - ${result.dimensions?.assignee}`);
                              }}
                            >
                              {result.dimensions?.assignee || result.name}
                            </span>
                            <button 
                              onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.assignee || result.name)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                              title="Hide bar"
                            >
                              <EyeOff className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="font-mono font-bold text-indigo-400">{result.value} {result.unit}</span>
                        </div>
                        <div 
                          className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all"
                          onClick={() => {
                            setDrillDownKeys(result.ticketKeys || []);
                            setDrillDownTitle(`${result.name} - ${result.dimensions?.assignee}`);
                          }}
                        >
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all duration-700" 
                            style={{ width: `${(result.value / maxVal) * 100}%` }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}</div>
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

      {/* Drill-down Sheet */}
      <Sheet open={!!drillDownKeys} onOpenChange={(open) => !open && setDrillDownKeys(null)}>
        <SheetContent side="right" className="w-[90%] sm:w-[540px] border-l-slate-200 dark:border-l-slate-800 p-0 overflow-hidden flex flex-col">
          <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Ticket className="h-5 w-5 text-blue-500" />
              {drillDownTitle}
            </SheetTitle>
            <SheetDescription>
              Displaying {drillDownKeys?.length || 0} issues comprising this metric
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-3">
              {drillDownKeys && drillDownKeys.map(key => {
                const issue = (masterDatasetInfo?.issues || []).find((i: any) => i.key === key);
                if (!issue) return null;
                
                const activeConnection = connections.find((c: any) => c.id === activeConnectionId);
                const baseUrl = activeConnection?.baseUrl || '';
                const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                return (
                  <div key={key} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono font-bold text-blue-500 hover:underline flex items-center gap-1">
                        {key} <ExternalLink className="h-3 w-3" />
                      </a>
                      <Badge variant="outline" className="text-[10px] h-4 py-0">{issue.fields?.status?.name || issue.status}</Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 mb-2">{issue.fields?.summary || issue.summary}</p>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned'}</div>
                      <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(issue.fields?.created || issue.created).toLocaleDateString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ result, pluginId, onHide, onClick }: { 
  result: { 
    name: string; 
    value: number; 
    unit: string; 
    dimensions?: any; 
    details?: Array<{ label: string; value: number; unit?: string }>;
    ticketKeys?: string[];
    comparison?: { value: number; change: number; label: string };
  }; 
  pluginId: string; 
  onHide?: () => void;
  onClick?: () => void;
}) {
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

  const isClickable = !!onClick || (result.ticketKeys && result.ticketKeys.length > 0);

  return (
    <Card 
      className={`border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700 transition-colors group relative ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="rounded-lg p-2 bg-gray-100 dark:bg-slate-800"><div className={getColor()}>{getIcon()}</div></div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-slate-400 dark:text-slate-500">{pluginId.split('_').slice(0, 2).join(' ')}</Badge>
            {onHide && (
              <button 
                onClick={(e) => { e.stopPropagation(); onHide(); }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity p-1"
                title="Hide widget"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-bold font-mono ${getColor()}`}>{result.value % 1 !== 0 ? result.value.toFixed(2) : result.value}</p>
          {result.comparison && (
            <div className={`flex items-center text-xs font-bold ${result.comparison.change > 0 ? 'text-emerald-500' : result.comparison.change < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
              {result.comparison.change > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : result.comparison.change < 0 ? <TrendingUp className="h-3 w-3 mr-0.5 rotate-180" /> : null}
              {Math.abs(result.comparison.change)}
            </div>
          )}
        </div>

        <p className={`text-sm text-slate-500 dark:text-slate-400 mt-1 ${isClickable ? 'group-hover:underline group-hover:text-blue-500' : ''}`}>{result.name}</p>
        <div className="flex items-center justify-between mt-0.5">
          {result.unit && <p className="text-xs text-slate-400 dark:text-slate-500">{result.unit}</p>}
          {result.ticketKeys && result.ticketKeys.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-400 border-none">
              {result.ticketKeys.length} tickets
            </Badge>
          )}
        </div>

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
        // Check if this is a multi-series chart (multiple results with timeSeries)
        const hasMultipleSeriesBar = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every(r => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeriesBar) {
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
              <BarChart data={mergedData}>
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
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => formatChartValue(value, unit)}
                />
                <Legend />
                {kpi.results.map((result, idx) => (
                  <Bar
                    key={result.name || idx}
                    dataKey={`series${idx}`}
                    name={result.name}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        }

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
                itemStyle={{ color: '#e2e8f0' }}
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
                  itemStyle={{ color: '#e2e8f0' }}
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
                itemStyle={{ color: '#e2e8f0' }}
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
                itemStyle={{ color: '#e2e8f0' }}
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
                {kpiOptions.timeSeries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      📈 Time-Series Trends
                    </SelectLabel>
                    {kpiOptions.timeSeries.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {kpiOptions.regular.length > 0 && (
                  <>
                    {kpiOptions.timeSeries.length > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        📊 Standard KPIs
                      </SelectLabel>
                      {kpiOptions.regular.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
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

// @MX:NOTE[AUTO] PluginsPanel component manages KPI plugin configuration and settings UI
// Props interface for type safety (using any for compatibility with AppSettings type)
interface PluginsPanelProps {
  settings?: any;
  onSettingsUpdate?: (settings: any) => void;
}

function PluginsPanel({ settings: globalSettings, onSettingsUpdate }: PluginsPanelProps) {
  const [plugins, setPlugins] = useState<Record<string, KpiPlugin[]>>({});
  const [settings, setSettings] = useState<any>(globalSettings || localConfig.getSettings());
  const [initialSettings, setInitialSettings] = useState<any>(globalSettings || localConfig.getSettings());

  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing state with globalSettings prop changes (external system) */
  React.useEffect(() => {
    if (globalSettings) {
      setSettings(globalSettings);
      setInitialSettings(globalSettings);
    }
  }, [globalSettings]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Derived state - use useMemo instead of useEffect + setState
  const hasUnsavedSettings = React.useMemo(() => {
    if (initialSettings && settings) {
      return JSON.stringify(settings) !== JSON.stringify(initialSettings);
    }
    return false;
  }, [settings, initialSettings]);
  const [loading, setLoading] = useState(false);

  // Plugin selection state
  const [activePlugins, setActivePlugins] = useState<Set<string>>(new Set());

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

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load custom plugins from localStorage
      const customPlugins = localConfig.getKpiPlugins();

      // 2. Load built-in plugins from API
      let allPlugins = [...customPlugins];
      try {
        const res = await fetch('/api/kpi/plugins');
        const data = await res.json();
        if (data.success && data.plugins) {
          // Merge built-in plugins, avoiding duplicates by ID
          const customIds = new Set(customPlugins.map(p => p.id));
          const builtins = data.plugins.filter((p: any) => !customIds.has(p.id));
          allPlugins = [...allPlugins, ...builtins];
        }
      } catch (err) {
        console.error('Failed to fetch built-in plugins:', err);
      }

      // Group by category
      const grouped = allPlugins.reduce((acc, p: any) => {
        const cat = p.category || 'custom';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p as KpiPlugin);
        return acc;
      }, {} as Record<string, KpiPlugin[]>);

      setPlugins(grouped);

      // 3. Load active plugins from localStorage
      const savedActivePlugins = localStorage.getItem('cfg_active_plugins');
      if (savedActivePlugins) {
        try {
          const activeIds = JSON.parse(savedActivePlugins) as string[];
          setActivePlugins(new Set(activeIds));
        } catch (err) {
          console.error('Failed to parse active plugins:', err);
          setActivePlugins(new Set(allPlugins.map(p => p.id)));
        }
      } else {
        setActivePlugins(new Set(allPlugins.map(p => p.id)));
      }
    } catch {
      toast.error('Failed to load plugins');
    }
    setLoading(false);
  }, []);
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: calling loadPlugins which syncs with localStorage + API external systems */
  React.useEffect(() => { loadPlugins(); }, [loadPlugins]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveActivePlugins = useCallback((pluginIds: Set<string>) => {
    localStorage.setItem('cfg_active_plugins', JSON.stringify(Array.from(pluginIds)));
  }, []);

  const togglePlugin = useCallback((pluginId: string) => {
    setActivePlugins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pluginId)) {
        newSet.delete(pluginId);
      } else {
        newSet.add(pluginId);
      }
      saveActivePlugins(newSet);
      return newSet;
    });
  }, [saveActivePlugins]);

  const selectAllPlugins = useCallback(() => {
    const allPluginIds = Object.values(plugins).flat().map(p => p.id);
    setActivePlugins(new Set(allPluginIds));
    saveActivePlugins(new Set(allPluginIds));
  }, [plugins, saveActivePlugins]);

  const deselectAllPlugins = useCallback(() => {
    setActivePlugins(new Set());
    saveActivePlugins(new Set());
  }, [saveActivePlugins]);

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

    // Auto-generate formula if using DSL and not manually edited
    let finalFormula = builderData.formula;
    if (builderLanguage === 'dsl' && !finalFormula) {
      finalFormula = generateFormula();
    }
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
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-500" onClick={() => setBuilderData({ ...builderData, formula: generateFormula() })}><RefreshCw className="h-3 w-3 mr-1" /> Regnerate</Button>
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

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-emerald-400" /> KPI Plugin Registry</CardTitle>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setBuilderOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Create Plugin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Plugin Selection Controls */}
            {!loading && Object.keys(plugins).length > 0 && (
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {activePlugins.size} of {Object.values(plugins).flat().length} active
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={selectAllPlugins}>
                    <CheckCircle2 className="mr-1 h-3 w-3" />Select All
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs" onClick={deselectAllPlugins}>
                    <XCircle className="mr-1 h-3 w-3" />Deselect All
                  </Button>
                </div>
              </div>
            )}

            {loading ? <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-gray-100 dark:bg-slate-800" />)}</div> : (
              <div className="space-y-3">
                {Object.entries(plugins).map(([category, pluginList]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2"><Badge className={categoryLabels[category]?.color || categoryLabels['custom']?.color}>{categoryLabels[category]?.label || category}</Badge><span className="text-xs text-slate-400 dark:text-slate-500">{pluginList.length}</span></div>
                    <div className="space-y-2">{pluginList.map((plugin) => (
                      <div key={plugin.id} className={`rounded-lg border transition-colors ${activePlugins.has(plugin.id) ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-gray-100/50 dark:bg-slate-800/30'} p-3`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <Checkbox
                              id={`plugin-${plugin.id}`}
                              checked={activePlugins.has(plugin.id)}
                              onCheckedChange={() => togglePlugin(plugin.id)}
                              className="flex-shrink-0"
                            />
                            <div
                              onClick={() => togglePlugin(plugin.id)}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm">{plugin.name}</h4>
                                <Badge variant="secondary" className="text-[10px] py-0 h-4 px-1.5 opacity-70">
                                  {plugin.pluginType === 'builtin' ? 'Built-in' : 'Custom'}
                                </Badge>
                                {plugin.language === 'javascript' && (
                                  <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30 py-0 h-4 px-1.5">JS</Badge>
                                )}
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
      </div>
      {/* SLA Targets by Status */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" /> SLA Targets by Status</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Define target hours per workflow status. Assignee comments reset the SLA clock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-400">
              <Info className="inline h-3 w-3 mr-1" />
              When the assignee comments on a ticket during a status, the SLA clock resets to that comment. Only the time from the last assignee comment (or status entry if no comment) to the status exit counts against the target.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                // Detect statuses from master dataset
                try {
                  const activeConn = localConfig.getActiveConnectionId();
                  if (!activeConn) { toast.error('Select a connection first'); return; }
                  const storageCfg = localConfig.getStorageConfig();
                  const res = await fetch(`/api/jira/master/${activeConn}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'get', storageConfig: storageCfg })
                  });
                  const data = await res.json();
                  if (!data.success || !data.data?.issues) { toast.error('No extraction data found. Extract data first.'); return; }

                  const statusSet = new Set<string>();
                  for (const issue of data.data.issues) {
                    const changelog = issue.changelog?.histories || [];
                    for (const h of changelog) {
                      for (const item of h.items) {
                        if (item.field === 'status' && item.toString) statusSet.add(item.toString);
                      }
                    }
                    if (issue.fields?.status?.name) statusSet.add(issue.fields.status.name);
                  }

                  const currentTargets = { ...(settings.sla?.statusTargets || {}) };
                  for (const s of statusSet) {
                    if (!(s in currentTargets)) currentTargets[s] = 0;
                  }
                  setSettings({ ...settings, sla: { ...settings.sla, statusTargets: currentTargets } });
                  toast.success(`Detected ${statusSet.size} unique statuses`);
                } catch { toast.error('Failed to detect statuses'); }
              }}
              className="border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
            >
              <Activity className="mr-2 h-4 w-4" /> Detect Statuses from Data
            </Button>
            <span className="text-xs text-slate-400">{Object.keys(settings.sla?.statusTargets || {}).length} statuses configured</span>
          </div>
          {Object.keys(settings.sla?.statusTargets || {}).length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(settings.sla?.statusTargets || {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, hours]) => (
                  <div key={status} className="flex items-center gap-3">
                    <Badge variant="outline" className="w-48 shrink-0 justify-start text-xs truncate">{status}</Badge>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0 = disabled"
                      value={(hours as number) || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setSettings({
                          ...settings,
                          sla: {
                            ...settings.sla,
                            statusTargets: { ...settings.sla.statusTargets, [status]: val }
                          }
                        });
                      }}
                      className="w-28 h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    />
                    <span className="text-xs text-slate-400">hours</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => {
                        const updated = { ...settings.sla.statusTargets };
                        delete updated[status];
                        setSettings({ ...settings, sla: { ...settings.sla, statusTargets: updated } });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
          {Object.keys(settings.sla?.statusTargets || {}).length === 0 && (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
              <Target className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No SLA targets configured yet</p>
              <p className="text-xs mt-1">Click "Detect Statuses" to auto-populate from your extraction data</p>
            </div>
          )}
          <Button onClick={() => {
            localConfig.saveSettings(settings);
            setInitialSettings(settings);
            if (onSettingsUpdate) onSettingsUpdate(settings);
            toast.success('SLA targets saved');
          }} className="bg-amber-600 hover:bg-amber-700" disabled={!hasUnsavedSettings}>
            <Save className="mr-2 h-4 w-4" /> Save SLA Targets
          </Button>
        </CardContent>
      </Card>



      {/* KPI Calculation Defaults */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-400" /> KPI Calculation Defaults</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Configure default values for KPI calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Settings Section */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
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
                <div className="flex items-center gap-1">
                  <Label className="text-slate-700 dark:text-slate-300">Work hours start</Label>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>Business hours beginning time. Only time after this hour is counted toward turnaround time and SLA metrics.</p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                <Input type="number" value={settings.general.workStartHour} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, workStartHour: parseInt(e.target.value) || 9 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Business hours begin</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-slate-700 dark:text-slate-300">Work hours end</Label>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>Business hours ending time. Time after this hour (evening/night) is excluded from processing time calculations.</p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                <Input type="number" value={settings.general.workEndHour} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, workEndHour: parseInt(e.target.value) || 17 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Business hours end</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-slate-700 dark:text-slate-300">Default SLA target (hours)</Label>
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>The fallback target for SLA compliance if no per-status target is configured. Measured in business hours.</p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                <Input type="number" value={settings.general.defaultSlaTargetHours} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, defaultSlaTargetHours: parseInt(e.target.value) || 40 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">For SLA compliance</p>
              </div>
            </div>
          </div>


          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button onClick={() => {
              localConfig.saveSettings(settings);
              setInitialSettings(settings);
              if (onSettingsUpdate) onSettingsUpdate(settings);
              toast.success('KPI Defaults saved');
            }} className="bg-blue-600 hover:bg-blue-700" disabled={!hasUnsavedSettings}>
              <Save className="mr-2 h-4 w-4" /> Save KPI Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

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
    try {
      const res = await fetch(`/api/holidays?year=${year}&region=${region}`);
      const data = await res.json();
      if (data.success) {
        setHolidays(data.holidays);
      }
    } catch {
      toast.error('Failed to load holidays');
    }
    setLoading(false);
  }, [year, region]);
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: calling loadHolidays which syncs with API external system */
  React.useEffect(() => { loadHolidays(); }, [loadHolidays]);
  /* eslint-enable react-hooks/set-state-in-effect */
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
  extractionResult, dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion, storageConfig
}: any) {
  const [exportMode, setExportMode] = useState<'file' | 'database'>('file');
  const [pgConnections, setPgConnections] = useState<PgConnection[]>([]);
  const [selectedPgConn, setSelectedPgConn] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportDataType, setExportDataType] = useState<'kpi' | 'tickets' | 'both'>('kpi');
  const [dbResult, setDbResult] = useState<{
    rowCount: number; success: boolean; error?: string;
  } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing state with localStorage external system */
  React.useEffect(() => {
    setPgConnections(localConfig.getPgConnections());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleFileExport = async (format: string) => {
    if (!extractionResult) { toast.error('No extracted data found. Please run Jira Extraction in the Extract tab first.'); return; }
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
        const exportRes = await fetch('/api/export/file', {
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
          const a = document.createElement('a'); a.href = url; a.download = 'jira-kpi-results.json'; a.click();
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

  const handleDbPush = async () => {
    if (!extractionResult) { toast.error('No extracted data found'); return; }
    if (!selectedPgConn) { toast.error('Select a target database'); return; }

    const conn = pgConnections.find(c => c.id === selectedPgConn);
    if (!conn) { toast.error('Selected database not found'); return; }

    setExporting(true); setDbResult(null);
    try {
      const res = await fetch('/api/pg/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: conn,
          issues: extractionResult.issues,
          exportDataType,
          holidays: { regions: region === 'all' ? [] : [region] },
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDbResult({ rowCount: data.rowCount || 0, success: true });
        toast.success(`Successfully pushed ${data.rowCount} rows to ${conn.name}`);
      } else {
        setDbResult({ rowCount: 0, success: false, error: data.error });
        toast.error(data.error || 'Database push failed');
      }
    } catch { toast.error('Database push failed'); }
    setExporting(false);
  };


  return (
    <div className="space-y-6">
      {/* Export Mode Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Database Sync Mode */}
        <Card className={`border-2 transition-colors cursor-pointer ${exportMode === 'database' ? 'border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700'}`} onClick={() => setExportMode('database')}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2.5 ${exportMode === 'database' ? 'bg-indigo-600' : 'bg-gray-100 dark:bg-slate-800'}`}>
                <Database className={`h-5 w-5 ${exportMode === 'database' ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">Database Sync</CardTitle>
                <CardDescription className="text-xs mt-0.5 text-slate-600 dark:text-slate-400">Manual push of results to external PostgreSQL / Supabase.</CardDescription>
              </div>
              {exportMode === 'database' && <CheckCircle2 className="h-5 w-5 text-indigo-400" />}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Comparison Card */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><Info className="h-4 w-4 text-slate-500 dark:text-slate-400" /><span className="text-sm font-medium text-slate-700 dark:text-slate-300">When to use which?</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">CSV / JSON Export</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>Quick ad-hoc analysis</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>One-time Metabase imports</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" /><span>No database setup needed</span></li>
              </ul>
            </div>
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/5 border border-indigo-500/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Database Sync (Manual)</p>
              <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" /><span>Manual DB-to-DB bridge</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" /><span>Perfect for Metabase usage</span></li>
                <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" /><span>Export KPI & Raw Tickets</span></li>
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
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('kpi')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'kpi' ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-500 font-bold' : 'text-slate-500'}`}><Zap className="mr-1 h-3 w-3" />KPIs</Button>
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('tickets')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'tickets' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-400 font-bold' : 'text-slate-500'}`}><Ticket className="mr-1 h-3 w-3" />Raw</Button>
              <Button variant="ghost" size="sm" onClick={() => setExportDataType('both')} className={`flex-1 rounded-md text-[10px] h-8 ${exportDataType === 'both' ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-500 font-bold' : 'text-slate-500'}`}><LayoutGrid className="mr-1 h-3 w-3" />Both</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Action Buttons */}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="p-4">
          {exportMode === 'file' ? (
            <div className="flex gap-3">
              <Button onClick={() => handleFileExport('json')} disabled={exporting || !extractionResult} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileJson className="mr-2 h-4 w-4" />}
                Export JSON Results
              </Button>
              <Button onClick={() => handleFileExport('csv')} disabled={exporting || !extractionResult} variant="outline" className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700">
                <FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Target Database Backend</Label>
                <Select value={selectedPgConn} onValueChange={setSelectedPgConn}>
                  <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-500/20">
                    <SelectValue placeholder="Select target database..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pgConnections.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pgConnections.length === 0 && (
                  <p className="text-[10px] text-amber-500">No PostgreSQL backends found. Add one in the Storage tab.</p>
                )}
              </div>
              <Button onClick={handleDbPush} disabled={exporting || !extractionResult || !selectedPgConn} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {exporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Pushing to Database...</> : <><Database className="mr-2 h-4 w-4" />Push to Database</>}
              </Button>
              <p className="text-[10px] text-slate-500 text-center italic mt-2">
                * This is a manual one-way push. Updates in local storage are not automatically synced to the external DB.
              </p>
            </div>
          )}
        </CardContent>
      </Card>




      {exportMode === 'database' && dbResult && (
        <Card className={dbResult?.success ? 'border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/5' : 'border-red-500/30 bg-red-50 dark:bg-red-500/5'}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 text-sm ${dbResult?.success ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-400'}`}>
              {dbResult?.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {dbResult?.success ? 'Sync Successful' : 'Sync Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-indigo-500/10">
              <div className="flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-slate-600 dark:text-slate-400">Rows Synchronized:</span>
              </div>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{dbResult?.rowCount}</span>
            </div>
            {dbResult?.error && (
              <p className="text-[10px] text-red-500 mt-2 p-2 bg-red-500/5 rounded border border-red-500/10">{dbResult.error}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Settings Panel (Feature 3: Rate Limit + Feature 5: Config Import/Export) ─

function SettingsPanel({ onSettingsUpdate, storageConfig }: { onSettingsUpdate?: (settings: any) => void, storageConfig: any }) {
  const [settings, setSettings] = useState<AppSettings>({
    rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
    general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
    persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
    sla: { statusTargets: {} },
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configExporting, setConfigExporting] = useState(false);
  const [configImporting, setConfigImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialSettings, setInitialSettings] = useState<typeof settings | null>(null);

  // Initialize settings from localStorage on mount - useLayoutEffect for synchronous read
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: synchronizing with localStorage external system */
  React.useLayoutEffect(() => {
    const savedSettings = localConfig.getSettings() as any;
    setSettings(savedSettings);
    setInitialSettings(savedSettings);
    setLoading(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Detect unsaved changes - derived state with useMemo
  const hasUnsavedChanges = React.useMemo(() => {
    if (initialSettings) {
      return JSON.stringify(settings) !== JSON.stringify(initialSettings);
    }
    return false;
  }, [settings, initialSettings]);

  const handleSave = () => {
    setSaving(true);
    localConfig.saveSettings(settings);
    toast.success('Settings saved to browser storage');
    setInitialSettings(settings);
    if (onSettingsUpdate) onSettingsUpdate(settings);
    setSaving(false);
  };

  const handleExportConfig = () => {
    setConfigExporting(true);
    const config = localConfig.exportConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url; a.download = `jira-etl-config-${date}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
    setConfigExporting(false);
  };

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setConfigImporting(true);
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      localConfig.importConfig(config);
      toast.success('Configuration imported successfully. Please refresh.');
      setTimeout(() => window.location.reload(), 1500);
    } catch { toast.error('Failed to import configuration'); }
    setConfigImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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

          {/* UI Settings Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <Sliders className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">UI Settings</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Extraction List Max Height (px)</Label>
                <Input type="number" value={settings.general.listMaxHeight || 400} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, listMaxHeight: parseInt(e.target.value) || 400 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Control scroll area height</p>
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
    </div>
  );
}
