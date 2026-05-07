'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Ticket, ExternalLink, X, UserCheck, Calendar } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useAppStore } from '@/store/app-store';

interface KpiDrilldownDrawerProps {
  drillDownKeys: string[] | null;
  setDrillDownKeys: (keys: string[] | null) => void;
  drillDownTitle: string;
}

export function KpiDrilldownDrawer({ drillDownKeys, setDrillDownKeys, drillDownTitle }: KpiDrilldownDrawerProps) {
  const { masterDatasetInfo, connections, activeConnectionId } = useAppStore();

  const drillDownIssues = React.useMemo(() => {
    if (!drillDownKeys || !masterDatasetInfo?.issues) return [];
    return masterDatasetInfo.issues.filter((i: any) => drillDownKeys.includes(i.key));
  }, [drillDownKeys, masterDatasetInfo]);

  const activeConnection = connections.find(c => c.id === activeConnectionId);

  return (
    <Sheet open={!!drillDownKeys} onOpenChange={(open) => !open && setDrillDownKeys(null)}>
      <SheetContent side="right" className="w-[90%] sm:w-[540px] border-l-slate-200 dark:border-l-slate-800 p-0 overflow-hidden flex flex-col z-[70]">
        <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-xl font-bold">
              <Ticket className="h-5 w-5 text-blue-500" />
              {drillDownTitle}
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={() => setDrillDownKeys(null)} className="h-8 w-8 p-0 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SheetDescription className="text-slate-500 dark:text-slate-400">
            Showing {drillDownIssues.length} tickets comprising this metric
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-4 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Ticket Breakdown</p>
            {activeConnection && (
              <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-blue-500 hover:text-blue-600 gap-1" asChild>
                {(() => {
                  const baseUrl = activeConnection.baseUrl.trim().replace(/\/+$/, '');
                  const normalizedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                  const jql = `key in (${drillDownKeys?.join(',') || ''})`;
                  const jiraUrl = `${normalizedBaseUrl}/issues/?jql=${encodeURIComponent(jql)}`;
                  return (
                    <a href={jiraUrl} target="_blank" rel="noopener noreferrer">
                      View in Jira <ExternalLink className="h-3 w-3" />
                    </a>
                  );
                })()}
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-hidden bg-white dark:bg-slate-950">
            {drillDownIssues.length > 0 ? (
              <Virtuoso
                style={{ height: '100%' }}
                totalCount={drillDownIssues.length}
                itemContent={(index) => {
                  const issue = drillDownIssues[index];
                  const baseUrl = activeConnection?.baseUrl || '';
                  const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                  const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                  return (
                    <div className="px-4 pb-3">
                      <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono font-bold text-blue-500 hover:underline flex items-center gap-1">
                            {issue.key} <ExternalLink className="h-3 w-3" />
                          </a>
                          <Badge variant="outline" className="text-[10px] h-4 py-0">{issue.fields?.status?.name || issue.status}</Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 mb-2">{issue.fields?.summary || issue.summary}</p>
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                          <div className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned'}</div>
                          <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(issue.fields?.created || issue.created).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <Ticket className="h-12 w-12 text-slate-200 mb-4" />
                <p className="text-slate-500 font-medium">No tickets found for this metric</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
