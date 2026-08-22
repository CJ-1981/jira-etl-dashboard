'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ticket, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Virtuoso } from 'react-virtuoso';
import { WidgetResizeContainer } from './WidgetResizeContainer';
import type { JiraIssue } from '@/lib/jira/client';

// @MX:NOTE: Lists above this size are rendered through react-virtuoso so hundreds
// of rows don't each mount their own DOM nodes.
const VIRTUALIZATION_THRESHOLD = 100;

interface WeekActivityResult {
  value: number;
  ticketKeys?: string[];
}

interface KpiResult {
  dimensions?: Record<string, string>;
  value: number;
  ticketKeys?: string[];
}

interface WidgetKpi {
  results: KpiResult[];
  pluginId?: string;
}

interface TicketListWidgetProps {
  pluginId: string;
  isCollapsed: boolean;
  onToggleCollapse: (pluginId: string) => void;
  kpis: WidgetKpi[];
  issueMap: Map<string, JiraIssue>;
  jiraBaseUrl: string;
}

/**
 * Single ticket row.
 * @MX:NOTE: The previous per-row Radix Tooltip was replaced with a native `title`
 * attribute carrying the same details — adequate for a quick hover preview and it
 * avoids instantiating one tooltip component per row.
 */
function TicketRow({
  issueKey,
  issue,
  jiraBaseUrl,
}: {
  issueKey: string;
  issue: JiraIssue;
  jiraBaseUrl: string;
}) {
  const jiraUrl = jiraBaseUrl ? `${jiraBaseUrl}/browse/${issue.key}` : '#';
  const summaryText = issue.fields?.summary || (issue as any).summary || '';
  const createdDate = issue.fields?.created || (issue as any).created;
  const isValidDate = createdDate && !isNaN(new Date(createdDate).getTime());
  const priority = issue.fields?.priority?.name || (issue as any).priority || '—';
  const status = issue.fields?.status?.name || (issue as any).status;

  const tooltipText = [
    issueKey,
    summaryText,
    `Priority: ${priority}`,
    `Status: ${status}`,
    `Assignee: ${issue.fields?.assignee?.displayName || (issue as any).assignee || 'Unassigned'}`,
    `Created: ${isValidDate ? new Date(createdDate).toLocaleDateString('en-US') : 'N/A'}`,
  ].join('\n');

  return (
    <div
      title={tooltipText}
      className="grid grid-cols-[minmax(80px,auto)_minmax(60px,auto)_1fr_minmax(60px,auto)] items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors text-[11px] cursor-default"
    >
      {jiraBaseUrl ? (
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-bold text-blue-500 hover:underline"
        >
          {issueKey}
        </a>
      ) : (
        <span className="font-mono font-bold text-slate-500">{issueKey}</span>
      )}
      <Badge variant="outline" className="text-[9px] h-4 py-0 justify-center">
        {priority}
      </Badge>
      <span
        className="text-slate-700 dark:text-slate-300 truncate"
        title={summaryText}
      >
        {summaryText}
      </span>
      <Badge variant="outline" className="text-[9px] h-4 py-0 justify-center">
        {status}
      </Badge>
    </div>
  );
}

function WeekSection({
  week,
  kpis,
  issueMap,
  jiraBaseUrl,
}: {
  week: 'this_week' | 'last_week';
  kpis: WidgetKpi[];
  issueMap: Map<string, JiraIssue>;
  jiraBaseUrl: string;
}) {
  const label = week === 'this_week' ? 'This Week' : 'Last Week';
  const dotColor =
    week === 'this_week'
      ? 'bg-emerald-500'
      : 'bg-amber-500';
  const headerColor =
    week === 'this_week'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="space-y-3 overflow-hidden flex flex-col">
      <h4
        className={`text-xs font-semibold ${headerColor} uppercase tracking-wider flex items-center gap-1.5`}
      >
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </h4>
      {(['opened', 'closed'] as const).map((activity) => {
        const result = kpis
          .find((k) =>
            k.results.find(
              (r) =>
                r.dimensions?.week === week &&
                r.dimensions?.activity === activity,
            ),
          )
          ?.results.find(
            (r) =>
              r.dimensions?.week === week &&
              r.dimensions?.activity === activity,
          );
        if (!result) return null;
        const color =
          activity === 'opened'
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-emerald-600 dark:text-emerald-400';
        const bgColor =
          activity === 'opened'
            ? 'bg-rose-50 dark:bg-rose-950/30'
            : 'bg-emerald-50 dark:bg-emerald-950/30';
        return (
          <div
            key={`${week}-${activity}`}
            className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden flex-1 flex flex-col min-h-0"
          >
            <div
              className={`flex items-center justify-between px-3 py-1.5 ${bgColor} shrink-0`}
            >
              <span className={`text-xs font-semibold capitalize ${color}`}>
                {activity}
              </span>
              <Badge variant="outline" className="text-[10px] h-4 py-0">
                {result.value}
              </Badge>
            </div>
            {/* @MX:NOTE: max-h gives this scroller a deterministic height so Virtuoso can
                virtualize long lists; short lists simply size to their content. */}
            <div className="overflow-y-auto flex-1 min-h-0 max-h-[420px]">
              {(() => {
                // Skip rows whose issue is missing from the map (same behavior as before)
                const tickets = (result.ticketKeys || []).filter((key) =>
                  issueMap.has(key),
                );
                if (tickets.length === 0) {
                  return (
                    <p className="text-[10px] text-slate-400 px-3 py-2">
                      No tickets
                    </p>
                  );
                }
                if (tickets.length > VIRTUALIZATION_THRESHOLD) {
                  // Pattern mirrors DrillDownSheet's Virtuoso usage
                  return (
                    <Virtuoso
                      style={{ height: '100%' }}
                      totalCount={tickets.length}
                      itemContent={(index) => {
                        const key = tickets[index];
                        const issue = issueMap.get(key);
                        if (!issue) return null;
                        return (
                          <TicketRow
                            issueKey={key}
                            issue={issue}
                            jiraBaseUrl={jiraBaseUrl}
                          />
                        );
                      }}
                    />
                  );
                }
                return tickets.map((key) => {
                  const issue = issueMap.get(key)!;
                  return (
                    <TicketRow
                      key={key}
                      issueKey={key}
                      issue={issue}
                      jiraBaseUrl={jiraBaseUrl}
                    />
                  );
                });
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TicketListWidget({
  pluginId,
  isCollapsed,
  onToggleCollapse,
  kpis,
  issueMap,
  jiraBaseUrl,
}: TicketListWidgetProps) {
  const totalTickets = kpis.reduce(
    (acc, k) =>
      acc + k.results.reduce((a, r) => a + (r.value as number), 0),
    0,
  );

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <CardHeader className="pb-2">
        <button
          onClick={() => onToggleCollapse(pluginId)}
          className="flex items-center gap-2 group text-left w-full"
          aria-expanded={!isCollapsed}
        >
          <Ticket className="h-4 w-4 text-blue-500 shrink-0" />
          <CardTitle className="flex items-center gap-2 text-base">
            Weekly Ticket Overview
          </CardTitle>
          {!isCollapsed ? (
            <ChevronUp className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
          )}
          {isCollapsed && (
            <span className="text-xs text-slate-400 font-normal ml-1">
              ({totalTickets} tickets)
            </span>
          )}
        </button>
      </CardHeader>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="ticket-list-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent>
              <WidgetResizeContainer
                widgetId={pluginId}
                defaultHeight={400}
                minHeight={200}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <WeekSection
                  week="this_week"
                  kpis={kpis}
                  issueMap={issueMap}
                  jiraBaseUrl={jiraBaseUrl}
                />
                <WeekSection
                  week="last_week"
                  kpis={kpis}
                  issueMap={issueMap}
                  jiraBaseUrl={jiraBaseUrl}
                />
              </WidgetResizeContainer>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}