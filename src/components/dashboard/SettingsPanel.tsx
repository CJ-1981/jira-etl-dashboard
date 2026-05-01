'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  SaveAll, Download, Upload, Loader2, Info, Settings, Sliders, Save
} from 'lucide-react';
import { localConfig, type AppSettings } from '@/lib/config/local-store';

interface SettingsPanelProps {
  onSettingsUpdate?: (settings: any) => void;
  storageConfig: any;
}

export function SettingsPanel({ onSettingsUpdate, storageConfig }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>({
    rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
    general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
    persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
    sla: { statusTargets: {} },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configExporting, setConfigExporting] = useState(false);
  const [configImporting, setConfigImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const savedSettings = localConfig.getSettings() as AppSettings;
    setSettings(savedSettings);
    setInitialSettings(savedSettings);
    setLoading(false);
  }, []);

  const hasUnsavedChanges = initialSettings ? JSON.stringify(settings) !== JSON.stringify(initialSettings) : false;

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
    a.href = url; a.download = `jira-etl-config-${new Date().toISOString().split('T')[0]}.json`; a.click();
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
      toast.success('Configuration imported. Please refresh.');
      setTimeout(() => window.location.reload(), 1500);
    } catch { toast.error('Failed to import configuration'); }
    setConfigImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) return <div className="p-12 text-center text-slate-500"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />Loading settings...</div>;

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><SaveAll className="h-5 w-5 text-emerald-400" /> Configuration Management</CardTitle><CardDescription>Export or import the full dashboard configuration as a JSON file</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4"><p className="text-xs text-slate-500 dark:text-slate-400"><Info className="inline h-3 w-3 mr-1" />Exported configuration includes Jira & PG connections, plugins, and settings.</p></div>
          <div className="flex gap-3">
            <Button onClick={handleExportConfig} disabled={configExporting} className="flex-1 bg-emerald-600 hover:bg-emerald-700">{configExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export</Button>
            <Button variant="outline" disabled={configImporting} className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700" onClick={() => fileInputRef.current?.click()}>{configImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Import</Button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-slate-500 dark:text-slate-400" /> General Settings & Rate Limiting</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700"><Sliders className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-semibold">API Rate Limiting</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>Delay (ms)</Label><Input type="number" value={settings.rateLimit.delayMs} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, delayMs: parseInt(e.target.value) || 0 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
              <div className="space-y-2"><Label>Max req/min</Label><Input type="number" value={settings.rateLimit.maxRequestsPerMinute} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, maxRequestsPerMinute: parseInt(e.target.value) || 60 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
              <div className="space-y-2"><Label>Batch size</Label><Input type="number" value={settings.rateLimit.batchSize} onChange={(e) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, batchSize: parseInt(e.target.value) || 50 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
              <div className="space-y-2"><Label>Backoff</Label><Select value={settings.rateLimit.backoffStrategy} onValueChange={(v) => setSettings({ ...settings, rateLimit: { ...settings.rateLimit, backoffStrategy: v } })}><SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="exponential">Exponential</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700"><Sliders className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-semibold">UI Settings</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2"><Label>List Max Height (px)</Label><Input type="number" value={settings.general.listMaxHeight || 400} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, listMaxHeight: parseInt(e.target.value) || 400 } })} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700" /></div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Settings</>}</Button>
            {hasUnsavedChanges && <div className="flex items-center gap-2 text-amber-600 text-sm"><Info className="h-4 w-4" />Unsaved changes</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
