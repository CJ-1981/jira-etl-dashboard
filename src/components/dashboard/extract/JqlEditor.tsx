import React, { useEffect, useState } from 'react';
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
import { Trash2, Save } from 'lucide-react';
import { localConfig, SavedJql } from '@/lib/config/local-store';

interface JqlEditorProps {
  /** Current JQL text; owned by the panel so extraction/persistence can read it. */
  jql: string;
  /** Called on every edit (typing, loading a saved query, Escape to clear). */
  onJqlChange: (jql: string) => void;
}

/**
 * The "Custom JQL Query" section: editor textarea plus saved-JQL load/save/delete.
 * Owns the saved-JQL CRUD (localStorage via localConfig) internally.
 */
export const JqlEditor = React.memo(function JqlEditor({ jql, onJqlChange }: JqlEditorProps) {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <Label className="text-slate-700 dark:text-slate-300">Custom JQL Query <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">(optional)</span></Label>
        <div className="flex gap-2 ml-auto">
          {savedJqls.length > 0 && (
            <Select onValueChange={(val) => onJqlChange(savedJqls.find(j => j.id === val)?.query || '')}>
              <SelectTrigger className="h-7 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-[140px] sm:w-[150px]">
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

      <textarea
        className="w-full min-h-[80px] rounded-md bg-gray-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-800 dark:text-slate-200 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        placeholder='project = "PROJ" AND created >= "2024-01-01" ORDER BY created DESC'
        value={jql}
        onChange={(e) => onJqlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onJqlChange('');
        }}
      />

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
  );
});
