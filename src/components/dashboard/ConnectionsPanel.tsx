'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Server, CheckCircle2, Edit2, Trash2, Plus, GripVertical, Key, Loader2
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { localConfig, JiraConnection } from '@/lib/config/local-store';
import { useAppStore } from '@/store/app-store';

// Helper component
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

export function ConnectionsPanel() {
  const {
    connections,
    setConnections,
    activeConnectionId,
    setActiveConnectionId
  } = useAppStore();
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
    setConnections(updatedConns);
    toast.success(editingId ? 'Jira connection updated' : 'Jira connection saved');
    setForm({ name: '', baseUrl: '', apiToken: '', email: '', projectKeys: '' });
    setEditingId(null);
  };

  const handleEdit = (conn: JiraConnection) => {
    setForm({
      name: conn.name || '',
      baseUrl: conn.baseUrl || '',
      apiToken: conn.apiToken || '',
      email: conn.email || '',
      projectKeys: conn.projectKeys || '',
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
      const res = await fetch(`/api/jira/connections/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Delete failed');

      const updatedConns = connections.filter(c => c.id !== id);
      localConfig.saveJiraConnections(updatedConns);
      setConnections(updatedConns);

      toast.success(`Connection deleted`);
      if (activeConnectionId === id) {
        setActiveConnectionId(updatedConns.length > 0 ? updatedConns[0].id : '');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete connection');
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    try {
      const oldIndex = connections.findIndex((c) => c.id === active.id);
      const newIndex = connections.findIndex((c) => c.id === over.id);
      const newConnections = arrayMove(connections, oldIndex, newIndex);
      setConnections(newConnections);
      localConfig.saveJiraConnections(newConnections);
      toast.success('Connections reordered');
    } catch (e) {
      toast.error('Failed to reorder connections');
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
