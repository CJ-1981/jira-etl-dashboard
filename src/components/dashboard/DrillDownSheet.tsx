'use client';

import { Virtuoso } from 'react-virtuoso';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Ticket, ExternalLink, UserCheck, Calendar } from 'lucide-react';

interface DrillDownSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  drillDownTitle: string;
  drillDownKeys: string[] | null;
  issues: any[];
  connections: any[];
  activeConnectionId: string | null;
}

export function DrillDownSheet({
  isOpen,
  onOpenChange,
  drillDownTitle,
  drillDownKeys,
  issues,
  connections,
  activeConnectionId,
}: DrillDownSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-[540px] border-l-slate-200 dark:border-l-slate-800 p-0 overflow-hidden flex flex-col">
        <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Ticket className="h-5 w-5 text-blue-500" />
            {drillDownTitle}
          </SheetTitle>
          <SheetDescription>
            Displaying {(drillDownKeys as any)?.length || 0} issues comprising this metric
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {drillDownKeys && (
            <Virtuoso
              style={{ height: '100%' }}
              totalCount={drillDownKeys.length}
              itemContent={(index) => {
                const key = drillDownKeys[index];
                const issue = issues.find((i: any) => i.key === key);
                if (!issue) return null;

                const activeConnection = connections.find((c: any) => c.id === activeConnectionId);
                const baseUrl = activeConnection?.baseUrl || '';
                const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                return (
                  <div className="px-4 pb-3">
                    <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
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
                  </div>
                );
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}