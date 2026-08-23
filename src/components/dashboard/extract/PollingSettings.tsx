import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock } from 'lucide-react';
import { PollingStatus } from '@/types/dashboard';

const intervalOptions = [
  { label: '1 min', value: '1' },
  { label: '5 min', value: '5' },
  { label: '15 min', value: '15' },
  { label: '30 min', value: '30' },
  { label: '1 hr', value: '60' },
  { label: '4 hr', value: '240' },
];

interface PollingSettingsProps {
  polling: PollingStatus | null;
  pollEnabled: boolean;
  pollInterval: string;
  pollSaving: boolean;
  /** Disable the toggle when no connection is selected or a save is in flight. */
  toggleDisabled: boolean;
  onToggle: (targetState: boolean) => void;
  onIntervalChange: (value: string) => void;
}

/** The "Scheduled Pulling" section: enable toggle, interval picker, run status. */
export const PollingSettings = React.memo(function PollingSettings({
  polling,
  pollEnabled,
  pollInterval,
  pollSaving,
  toggleDisabled,
  onToggle,
  onIntervalChange,
}: PollingSettingsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-emerald-400" /> Scheduled Pulling
        </Label>
        <div className="flex items-center gap-2">
          {polling?.enabled && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] animate-pulse bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              LIVE
            </Badge>
          )}
          <Switch checked={pollEnabled} onCheckedChange={(checked) => onToggle(checked)} disabled={pollSaving || toggleDisabled} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[120px]">
          <Select value={pollInterval} onValueChange={onIntervalChange} disabled={pollSaving}>
            <SelectTrigger className="h-8 text-xs bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectValue placeholder="Interval" />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[180px] rounded-md bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-2">
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
  );
});
