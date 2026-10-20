'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Ticket, ChevronUp, ChevronDown, Copy, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Virtuoso } from 'react-virtuoso';
import { WidgetResizeContainer } from '../WidgetResizeContainer';
import { PluginInfoIcon } from '../PluginInfoIcon';
import { FilterMultiSelect } from '../extract/ExtractionPreviewTable';
import {
  getStatus,
  getSummary,
  getAssignee,
  getParticipants,
  getParticipantNames,
  getProject,
  toEpoch,
} from '../extract/issue-utils';
import { isInteractiveShortcutTarget } from '@/hooks/useGlobalShortcuts';
import type { JiraIssue } from '@/lib/jira/client';

// @MX:NOTE: Lists above this size render through react-virtuoso so thousands of
// rows don't each mount their own DOM nodes (same threshold as TicketListWidget).
const VIRTUALIZATION_THRESHOLD = 100;

/** Widget-local keyboard shortcut that copies the visible table as TSV. */
const COPY_TSV_KEY = 't';

interface WidgetKpi {
  results: Array<{ value: number; ticketKeys?: string[] }>;
  pluginId?: string;
}

interface SimpleTicketListWidgetProps {
  pluginId: string;
  isCollapsed: boolean;
  onToggleCollapse: (pluginId: string) => void;
  kpis: WidgetKpi[];
  issueMap: Map<string, JiraIssue>;
  jiraBaseUrl: string;
}

type SortOption = 'created-desc' | 'created-asc' | 'key-asc' | 'key-desc';

function buildTsv(rows: Array<{ key: string; summary: string; assignee: string; participants: string; status: string }>): string {
  const header = ['Key', 'Summary', 'Assignee', 'Participants', 'Status'].join('\t');
  const lines = rows.map((r) =>
    [r.key, r.summary, r.assignee, r.participants, r.status]
      .map((cell) => cell.replace(/\t|\r?\n/g, ' '))
      .join('\t'),
  );
  return [header, ...lines].join('\n');
}

/**
 * Flat ticket list for the KPI Analytics tab — the same columns as the Data
 * Center extract preview (key / summary / assignee / participants / status)
 * with search, multi-select filters, sorting, and a copy-as-TSV shortcut.
 *
 * The plugin emits the in-scope ticket keys, so the KPI tab's Advanced
 * Filtering (JQL-lite + facet filters) and analysis period are already
 * applied before this widget sees the data.
 */
export function SimpleTicketListWidget({
  pluginId,
  isCollapsed,
  onToggleCollapse,
  kpis,
  issueMap,
  jiraBaseUrl,
}: SimpleTicketListWidgetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('created-desc');

  // In-scope tickets in key order first; deterministic base for filter/sort.
  const tickets = useMemo(() => {
    const keys = kpis.flatMap((k) => k.results.flatMap((r) => r.ticketKeys || []));
    return keys
      .filter((key) => issueMap.has(key))
      .map((key) => issueMap.get(key) as JiraIssue)
      .sort((a, b) => (a.key || '').localeCompare(b.key || '', undefined, { numeric: true }));
  }, [kpis, issueMap]);

  const availableProjects = useMemo(
    () => Array.from(new Set(tickets.map((i) => getProject(i as never)))).filter(Boolean).sort(),
    [tickets],
  );
  const availableAssignees = useMemo(
    () => Array.from(new Set(tickets.map((i) => getAssignee(i as never)))).sort(),
    [tickets],
  );
  const availableParticipants = useMemo(
    () => Array.from(new Set(tickets.flatMap((i) => getParticipantNames(i as never)))).sort(),
    [tickets],
  );
  const availableStatuses = useMemo(
    () => Array.from(new Set(tickets.map((i) => getStatus(i as never)))).sort(),
    [tickets],
  );

  const visibleTickets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = tickets.filter((issue) => {
      const key = (issue.key || '').toLowerCase();
      const summary = getSummary(issue as never).toLowerCase();
      const assignee = getAssignee(issue as never).toLowerCase();
      const participants = getParticipants(issue as never).toLowerCase();
      const matchesSearch =
        key.includes(q) || summary.includes(q) || assignee.includes(q) || participants.includes(q);
      const matchesProject =
        selectedProjects.length === 0 || selectedProjects.includes(getProject(issue as never));
      const matchesAssignee =
        selectedAssignees.length === 0 || selectedAssignees.includes(getAssignee(issue as never));
      const names = getParticipantNames(issue as never);
      const matchesParticipants =
        selectedParticipants.length === 0 || names.some((n) => selectedParticipants.includes(n));
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(getStatus(issue as never));
      return matchesSearch && matchesProject && matchesAssignee && matchesParticipants && matchesStatus;
    });

    const byCreated = (a: JiraIssue, b: JiraIssue) => {
      const av = toEpoch((a as never as { fields?: { created?: string } }).fields?.created);
      const bv = toEpoch((b as never as { fields?: { created?: string } }).fields?.created);
      return sortOption === 'created-desc' ? bv - av : av - bv;
    };
    return filtered.sort((a, b) => {
      if (sortOption === 'created-desc' || sortOption === 'created-asc') return byCreated(a, b);
      return sortOption === 'key-asc'
        ? (a.key || '').localeCompare(b.key || '', undefined, { numeric: true })
        : (b.key || '').localeCompare(a.key || '', undefined, { numeric: true });
    });
  }, [tickets, searchQuery, selectedProjects, selectedAssignees, selectedParticipants, selectedStatuses, sortOption]);

  const tsvRows = useMemo(
    () =>
      visibleTickets.map((issue) => ({
        key: issue.key || '',
        summary: getSummary(issue as never),
        assignee: getAssignee(issue as never),
        participants: getParticipants(issue as never),
        status: getStatus(issue as never),
      })),
    [visibleTickets],
  );

  const copyAsTsv = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildTsv(tsvRows));
      toast.success(`Copied ${tsvRows.length} ticket${tsvRows.length === 1 ? '' : 's'} as TSV`);
    } catch {
      toast.error('Copy failed — the browser blocked clipboard access');
    }
  }, [tsvRows]);

  // Widget-local keyboard shortcut: T copies the visible table as TSV.
  // Same guard semantics as useGlobalShortcuts (no hijacking inputs/links/…).
  useEffect(() => {
    if (isCollapsed || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (isInteractiveShortcutTarget(target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== COPY_TSV_KEY) return;
      e.preventDefault();
      copyAsTsv();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCollapsed, copyAsTsv]);

  const totalTickets = tickets.length;

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            onClick={() => onToggleCollapse(pluginId)}
            className="flex items-center gap-2 group text-left"
            aria-expanded={!isCollapsed}
          >
            <Ticket className="h-4 w-4 text-blue-500 shrink-0" />
            <CardTitle className="flex items-center gap-2 text-base">Ticket List</CardTitle>
            {!isCollapsed ? (
              <ChevronUp className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            )}
            <PluginInfoIcon pluginId={pluginId} />
            {isCollapsed && (
              <span className="text-xs text-slate-400 font-normal ml-1">({totalTickets} tickets)</span>
            )}
          </button>
          {!isCollapsed && (
            <Button
              variant="outline"
              size="sm"
              onClick={copyAsTsv}
              className="h-8 text-[10px] uppercase tracking-wider font-bold border-blue-500/20 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10"
              title="Copy the visible table as TSV (shortcut: T)"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy TSV
            </Button>
          )}
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="simple-ticket-list-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by key, summary, assignee, or participant..."
                    className="pl-9 pr-8 bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <FilterMultiSelect
                  placeholder="All Projects"
                  options={availableProjects}
                  selected={selectedProjects}
                  onChange={setSelectedProjects}
                />
                <FilterMultiSelect
                  placeholder="All Assignees"
                  options={availableAssignees}
                  selected={selectedAssignees}
                  onChange={setSelectedAssignees}
                />
                <FilterMultiSelect
                  placeholder="All Participants"
                  options={availableParticipants}
                  selected={selectedParticipants}
                  onChange={setSelectedParticipants}
                />
                <FilterMultiSelect
                  placeholder="All Statuses"
                  options={availableStatuses}
                  selected={selectedStatuses}
                  onChange={setSelectedStatuses}
                />
                <Select value={sortOption} onValueChange={(v) => setSortOption(v as typeof sortOption)}>
                  <SelectTrigger className="w-full sm:w-[150px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created-desc">Newest Created</SelectItem>
                    <SelectItem value="created-asc">Oldest Created</SelectItem>
                    <SelectItem value="key-asc">Key (A-Z)</SelectItem>
                    <SelectItem value="key-desc">Key (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <WidgetResizeContainer
                widgetId={`simple-ticket-list-${pluginId}`}
                defaultHeight={420}
                minHeight={200}
                className="rounded-md border border-slate-100 dark:border-slate-800 overflow-hidden"
              >
                {visibleTickets.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-6 text-center">No tickets match the current filters</p>
                ) : visibleTickets.length > VIRTUALIZATION_THRESHOLD ? (
                  <Virtuoso
                    style={{ height: '100%' }}
                    totalCount={visibleTickets.length}
                    itemContent={(index) => {
                      const issue = visibleTickets[index];
                      return (
                        <TicketRow issue={issue} jiraBaseUrl={jiraBaseUrl} />
                      );
                    }}
                  />
                ) : (
                  <div className="overflow-y-auto max-h-[420px]">
                    {visibleTickets.map((issue) => (
                      <TicketRow key={issue.key} issue={issue} jiraBaseUrl={jiraBaseUrl} />
                    ))}
                  </div>
                )}
              </WidgetResizeContainer>
              <p className="text-[10px] text-slate-400">
                Showing {visibleTickets.length} of {totalTickets} tickets · Press{' '}
                <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">T</kbd>{' '}
                to copy the table as TSV
              </p>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function TicketRow({ issue, jiraBaseUrl }: { issue: JiraIssue; jiraBaseUrl: string }) {
  const jiraUrl = jiraBaseUrl ? `${jiraBaseUrl}/browse/${issue.key}` : '#';
  const summary = getSummary(issue as never);
  const assignee = getAssignee(issue as never);
  const participants = getParticipants(issue as never);
  const status = getStatus(issue as never);
  const resolved = (issue as never as { fields?: { status?: { statusCategory?: { name?: string } } } })
    .fields?.status?.statusCategory?.name === 'Done';

  return (
    <div
      // Fixed-width tracks (not content-sized `auto`) so every row's columns
      // align regardless of name lengths; long values truncate with tooltips.
      className="grid grid-cols-[88px_64px_110px_110px_minmax(0,1fr)_88px] items-center gap-x-2 px-3 py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors text-[11px] cursor-default"
      title={`${issue.key} — ${summary}`}
    >
      {jiraBaseUrl ? (
        <a
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-bold text-blue-500 hover:underline truncate"
        >
          {issue.key}
        </a>
      ) : (
        <span className="font-mono font-bold text-slate-500 truncate">{issue.key}</span>
      )}
      <Badge variant="outline" className="text-[9px] h-4 py-0 justify-center max-w-full truncate">
        {(issue as never as { fields?: { priority?: { name?: string } } }).fields?.priority?.name || '—'}
      </Badge>
      <span className="text-slate-600 dark:text-slate-400 truncate" title={assignee}>
        {assignee}
      </span>
      <span className="text-slate-600 dark:text-slate-400 truncate" title={participants || undefined}>
        {participants}
      </span>
      <span className="text-slate-700 dark:text-slate-300 truncate" title={summary}>
        {summary}
      </span>
      <Badge
        variant={resolved ? 'default' : 'outline'}
        className={`text-[9px] h-4 py-0 justify-center max-w-full truncate ${resolved ? 'bg-blue-600' : ''}`}
      >
        {status}
      </Badge>
    </div>
  );
}
