'use client';

import { useMemo } from 'react';
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
  const issuesMap = useMemo(
    () => new Map<string, any>(issues.map((i: any) => [i.key, i])),
    [issues],
  );

  const activeConnection = useMemo(
    () => connections.find((c: any) => c.id === activeConnectionId),
    [connections, activeConnectionId],
  );

  const jiraBaseUrl = activeConnection?.baseUrl || '';
  const formattedBaseUrl = jiraBaseUrl
    ? (jiraBaseUrl.startsWith('http') ? jiraBaseUrl : `https://${jiraBaseUrl}`)
    : '';

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-[540px] border-l-slate-200 dark:border-l-slate-800 p-0 overflow-hidden flex flex-col">
        <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Ticket className="h-5 w-5 text-blue-500" />
            {drillDownTitle}
          </SheetTitle>
          <SheetDescription>
            Displaying {drillDownKeys?.length ?? 0} issues comprising this metric
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {drillDownKeys && (
            <Virtuoso
              style={{ height: '100%' }}
              totalCount={drillDownKeys.length}
              itemContent={(index) => {
                const key = drillDownKeys[index];
                const issue = issuesMap.get(key);
                if (!issue) return null;

                const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                const createdRaw = issue.fields?.created || issue.created;
                const createdDate = createdRaw ? new Date(createdRaw) : null;
                const createdDisplay =
                  createdDate && !isNaN(createdDate.getTime())
                    ? createdDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '';

                return (
                  <div className="px-4 pb-3">
                    <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        {activeConnection ? (
                          <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono font-bold text-blue-500 hover:underline flex items-center gap-1">
                            {key} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs font-mono font-bold text-slate-500 flex items-center gap-1">
                            {key}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] h-4 py-0">{issue.fields?.status?.name || issue.status}</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 mb-2">{issue.fields?.summary || issue.summary}</p>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned'}</div>
                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {createdDisplay}</div>
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