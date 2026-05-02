'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Database, HardDrive, Shield, Server, RefreshCw, Edit2, Trash2, Plus, Loader2
} from 'lucide-react';
import { localConfig, PgConnection, buildPgConnectionUrl, isSupabaseUrl } from '@/lib/config/local-store';

export function StoragePanel({ storageConfig, setStorageConfig, settings, setSettings }: { storageConfig: any, setStorageConfig: any, settings: any, setSettings: any }) {
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
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

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
      if (isMounted.current) {
        if (data.success) {
          setStorageInfo(data.storage);
        } else {
          toast.error(data.error);
        }
      }
    } catch {
      if (isMounted.current) toast.error('Failed to load storage info');
    }
    if (isMounted.current) setLoadingStorage(false);
  };

  useEffect(() => {
    setLoading(true);
    const updatedPgConnections = localConfig.getPgConnections();
    setPgConnections(updatedPgConnections);
    setLoading(false);
    handleRefreshStorage();
  }, [storageConfig]);

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
    const allConns = localConfig.getPgConnections();
    const pgConnection: PgConnection = {
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
      hasPassword: !!pgForm.password
    };
    
    const configToSave = { ...pgConnection };
    delete (configToSave as any).password;
    
    const updatedConns = editingPgId 
      ? allConns.map(c => c.id === editingPgId ? pgConnection : c) 
      : [...allConns, pgConnection];
      
    const persistentConns = editingPgId
      ? allConns.map(c => c.id === editingPgId ? configToSave : c)
      : [...allConns, configToSave];

    localConfig.savePgConnections(persistentConns as any);
    setPgConnections(updatedConns);
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
                              setPgConnections(updated);
                              
                              const cfg = localConfig.getStorageConfig();
                              if (cfg.connectionId === conn.id) {
                                localConfig.saveStorageConfig({ ...cfg, connectionId: undefined });
                              }
                              
                              toast.success('Connection deleted');
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

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-400" /> Session Persistence</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Control how extraction data is saved and restored across sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
