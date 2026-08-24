import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { HardDrive, LayoutGrid, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export interface MasterDatasetInfo {
  totalExtracted: number;
  dateRange?: { from: string; to: string };
  lastUpdated: string;
}

interface MasterDatasetCardProps {
  info: MasterDatasetInfo;
  extracting: boolean;
  onShowAllTickets: () => void;
}

/** The "Master Dataset" summary card with show-all and clear actions. */
export const MasterDatasetCard = React.memo(function MasterDatasetCard({ info, extracting, onShowAllTickets }: MasterDatasetCardProps) {
  const { activeConnectionId, storageConfig, setMasterDatasetInfo, setExtractionResult, setKpiResults } = useAppStore();

  const handleClear = async () => {
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
          setExtractionResult(null);
          setKpiResults([]);
        }
      } catch {
        toast.error('Failed to clear master dataset');
      }
    }
  };

  return (
    <Card className="border-blue-500/20 bg-blue-50 dark:bg-blue-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><HardDrive className="h-5 w-5 text-blue-400" /> Master Dataset</CardTitle>
        <CardDescription className="text-slate-600 dark:text-slate-400">Total tickets accumulated from all extractions for this connection</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Total Unique Tickets:</span>
          <span className="font-bold text-blue-400">{info.totalExtracted}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Date Range:</span>
          <span className="text-slate-700 dark:text-slate-300">
            {info.dateRange?.from ? `${new Date(info.dateRange.from).toLocaleDateString()} - ${new Date(info.dateRange.to).toLocaleDateString()}` : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Last Updated:</span>
          <span className="text-slate-700 dark:text-slate-300">{new Date(info.lastUpdated).toLocaleString()}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={onShowAllTickets}
            disabled={extracting || !activeConnectionId || (info && info.totalExtracted === 0)}
          >
            <LayoutGrid className="mr-1 h-3 w-3" /> Show All Tickets
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={handleClear}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Clear Master Dataset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
