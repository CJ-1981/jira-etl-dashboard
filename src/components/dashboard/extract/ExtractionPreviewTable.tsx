import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, X, HardDrive, ExternalLink, CheckCircle2, ChevronDown } from 'lucide-react';
import { JiraConnection } from '@/lib/config/local-store';
import { PreviewIssue } from './types';
import { getStatus, getSummary, getAssignee, getCreated, getUpdated, getProject, isResolved, toEpoch } from './issue-utils';

export interface ExtractionResult {
  total: number;
  etlRunId?: string;
  issues: PreviewIssue[];
  isAllTickets?: boolean;
}

type SortOption = 'default' | 'key-asc' | 'key-desc' | 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc';

interface ExtractionPreviewTableProps {
  result: ExtractionResult;
  connections: JiraConnection[];
  activeConnectionId: string;
  /** Dims the card while a new extraction is in flight. */
  extracting: boolean;
  /** Max height (px) of the scrollable ticket list, from settings. */
  listMaxHeight?: number;
}

function compareIssues(a: PreviewIssue, b: PreviewIssue, sortOption: SortOption): number {
  switch (sortOption) {
    case 'key-asc':
      return (a.key || '').localeCompare(b.key || '', undefined, { numeric: true });
    case 'key-desc':
      return (b.key || '').localeCompare(a.key || '', undefined, { numeric: true });
    case 'created-desc':
      return toEpoch(getCreated(b)) - toEpoch(getCreated(a));
    case 'created-asc':
      return toEpoch(getCreated(a)) - toEpoch(getCreated(b));
    case 'updated-desc':
      return toEpoch(getUpdated(b) || getCreated(b)) - toEpoch(getUpdated(a) || getCreated(a));
    case 'updated-asc':
      return toEpoch(getUpdated(a) || getCreated(a)) - toEpoch(getUpdated(b) || getCreated(b));
    default:
      return 0;
  }
}

/**
 * Multi-select dropdown filter (checkbox popover), shared by the Projects and
 * Statuses filters above the ticket list.
 */
function FilterMultiSelect({ placeholder, options, selected, onChange }: {
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full sm:w-[160px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0 justify-between font-normal"
        >
          <span className="truncate">
            {selected.length ? `${selected.length} selected` : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-[10px] justify-start px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => onChange([])}
          >
            Clear Selection
          </Button>
        </div>
        <div className="max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
          {options.map((option) => (
            <div
              key={option}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm"
              onClick={() =>
                onChange(
                  selected.includes(option)
                    ? selected.filter(s => s !== option)
                    : [...selected, option]
                )
              }
            >
              <Checkbox
                checked={selected.includes(option)}
                className="pointer-events-none"
              />
              <span className="text-xs truncate">{option}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The post-extraction preview card: summary stats, search/status-filter/sort
 * controls, and the scrollable ticket list.
 */
export const ExtractionPreviewTable = React.memo(function ExtractionPreviewTable({
  result,
  connections,
  activeConnectionId,
  extracting,
  listMaxHeight,
}: ExtractionPreviewTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('created-desc');

  // Memoized so downstream memos keyed on it don't invalidate every render.
  const issues = useMemo(() => result.issues || [], [result.issues]);

  const resolvedCount = issues.filter(isResolved).length;
  const openCount = issues.filter(i => !isResolved(i)).length;

  const createdTimes = issues
    .map(i => getCreated(i))
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime());
  const oldestLabel = createdTimes.length > 0 ? new Date(Math.min(...createdTimes)).toLocaleDateString() : 'N/A';
  const newestLabel = createdTimes.length > 0 ? new Date(Math.max(...createdTimes)).toLocaleDateString() : 'N/A';

  const availableStatuses = useMemo(
    () => Array.from(new Set<string>(issues.map(i => getStatus(i)))).sort(),
    [issues]
  );

  const availableProjects = useMemo(
    () => Array.from(new Set<string>(issues.map(i => getProject(i)).filter(Boolean))).sort(),
    [issues]
  );

  const visibleIssues = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return issues
      .filter(issue => {
        const key = (issue.key || '').toLowerCase();
        const summary = getSummary(issue).toLowerCase();
        const assignee = getAssignee(issue).toLowerCase();
        const status = getStatus(issue);
        const matchesSearch = key.includes(q) || summary.includes(q) || assignee.includes(q);
        const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(status);
        const project = getProject(issue);
        const matchesProject = selectedProjects.length === 0 || selectedProjects.includes(project);
        return matchesSearch && matchesStatus && matchesProject;
      })
      .sort((a, b) => compareIssues(a, b, sortOption));
  }, [issues, searchQuery, selectedStatuses, selectedProjects, sortOption]);

  const activeConnection = connections.find(c => c.id === activeConnectionId);
  const baseUrl = activeConnection?.baseUrl || '';
  const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

  return (
    <Card className={`border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 ${extracting ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-400">
          {result.isAllTickets ? (
            <><HardDrive className="h-5 w-5" /> Master Dataset</>
          ) : (
            <><CheckCircle2 className="h-5 w-5" /> Extraction Complete</>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{result.total}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Extracted</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{resolvedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Resolved</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{openCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Open</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Oldest</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{oldestLabel}</p>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 text-center">
            <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Newest</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{newestLabel}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by key, summary, or assignee..."
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
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[160px] bg-gray-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs h-9 shrink-0">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Order</SelectItem>
                <SelectItem value="key-asc">Key (A-Z)</SelectItem>
                <SelectItem value="key-desc">Key (Z-A)</SelectItem>
                <SelectItem value="created-desc">Newest Created</SelectItem>
                <SelectItem value="created-asc">Oldest Created</SelectItem>
                <SelectItem value="updated-desc">Newest Update</SelectItem>
                <SelectItem value="updated-asc">Oldest Update</SelectItem>
              </SelectContent>
            </Select>
            <FilterMultiSelect
              placeholder="All Statuses"
              options={availableStatuses}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
            />
          </div>

          <div
            className="space-y-1 overflow-y-auto pr-1 custom-scrollbar"
            style={{ maxHeight: `${listMaxHeight || 400}px` }}
          >
            {visibleIssues.map((issue) => {
              const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';
              const resolved = isResolved(issue);
              const statusName = getStatus(issue);

              return (
                <div key={issue.key} className="flex items-baseline gap-2 sm:gap-3 py-2 px-3 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-slate-700/40 dark:bg-slate-800/20 text-sm group">
                  <a
                    href={jiraUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={issue.key}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-xs font-mono shrink-0 w-20 sm:w-32 truncate transition-colors"
                  >
                    {issue.key}
                    <ExternalLink className="ml-1 inline-block h-3 w-3 align-text-bottom opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                  <span className="truncate text-slate-700 dark:text-slate-300 flex-1 min-w-0">{getSummary(issue)}</span>
                  {/* Assignee is dropped below sm — the 375px card interior cannot
                      fit four fixed columns alongside the summary. */}
                  <span className="hidden truncate text-slate-500 dark:text-slate-400 text-xs w-36 shrink-0 sm:inline">{getAssignee(issue)}</span>
                  {/* Fixed-width badge column: keeps the assignee column at a
                      stable x regardless of each status's text length (sm+ only;
                      on mobile the badge truncates to its share of the row). */}
                  <span className="max-w-[110px] shrink-0 flex justify-end sm:w-40 md:w-44 sm:max-w-none">
                    <Badge variant={resolved ? 'default' : 'secondary'} className={`text-xs max-w-full shrink-0 truncate ${resolved ? 'bg-blue-600' : ''}`}>{statusName}</Badge>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
