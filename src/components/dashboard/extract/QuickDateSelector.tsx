import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { RotateCw } from 'lucide-react';

const quickPullButtons = [
  { label: 'Since yesterday', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 365 days', days: 365 },
];

interface QuickDateSelectorProps {
  dateFrom: string;
  dateTo: string;
  updateOnly: boolean;
  /** Apply a preset window (sets dateFrom/dateTo + remembers the preset). */
  onQuickPull: (days: number) => void;
  /** Run an immediate extraction with a rolling window (Quick Update). */
  onQuickUpdate: (days: number) => void;
}

/** The "Quick Date Selection" preset buttons plus the custom days-back input. */
export const QuickDateSelector = React.memo(function QuickDateSelector({
  dateFrom,
  dateTo,
  updateOnly,
  onQuickPull,
  onQuickUpdate,
}: QuickDateSelectorProps) {
  const readCustomDays = (): number =>
    parseInt((document.getElementById('customDaysBack') as HTMLInputElement)?.value || '0', 10);

  const handleCustomDaysBack = () => {
    const days = readCustomDays();
    if (days > 0) {
      onQuickPull(days);
      toast.success(`Set date range to last ${days} days`);
    } else {
      toast.error('Please enter a valid number of days');
    }
  };

  const handleQuickUpdate = () => {
    const days = readCustomDays();
    if (days > 0) {
      onQuickUpdate(days);
    } else {
      toast.error('Please enter a valid number of days');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <RotateCw className="h-4 w-4 text-emerald-400" />
        <Label className="text-sm font-semibold">Quick Date Selection</Label>
      </div>
      <div className="flex flex-wrap gap-2">
        {quickPullButtons.map((btn) => {
          const todayStr = new Date().toISOString().split('T')[0];
          const isToday = dateTo === todayStr;
          const fromDate = dateFrom ? new Date(dateFrom) : null;
          const toDate = dateTo ? new Date(dateTo) : null;
          const diffDays = (fromDate && toDate) ? Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          const isActive = isToday && diffDays === btn.days;

          return (
            <Button
              key={btn.days}
              variant={isActive ? "default" : "outline"}
              size="sm"
              className={`h-8 text-[11px] border-slate-200 dark:border-slate-700 ${
                isActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
              onClick={() => onQuickPull(btn.days)}
            >
              {btn.label}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input id="customDaysBack" type="number" placeholder="Days back" className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-28 h-8 text-xs" min="1" />
        <Button variant="outline" size="sm" className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-100 dark:bg-emerald-500/10" onClick={handleCustomDaysBack}>
          Set Range
        </Button>
        {updateOnly && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-100 dark:bg-blue-500/10"
            onClick={handleQuickUpdate}
          >
            Quick Update
          </Button>
        )}
      </div>
    </div>
  );
});
