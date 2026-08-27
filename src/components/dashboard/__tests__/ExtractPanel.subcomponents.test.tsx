import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getStatus, getSummary, getAssignee, getCreated, getUpdated, getProject, isResolved, toEpoch } from '../extract/issue-utils';
import { ExtractionPreviewTable, ExtractionResult } from '../extract/ExtractionPreviewTable';
import { QuickDateSelector } from '../extract/QuickDateSelector';
import { PollingSettings } from '../extract/PollingSettings';
import { EmptyExtractionCard } from '../extract/EmptyExtractionCard';
import type { PreviewIssue } from '../extract/types';

// ── issue-utils (pure helpers that replaced the untyped `(i: any)` lambdas) ──
describe('extract/issue-utils', () => {
  const raw: PreviewIssue = {
    key: 'PROJ-1',
    statusCategory: 'done',
    fields: {
      summary: 'Raw summary',
      status: { name: 'Done' },
      assignee: { displayName: 'Alice' },
      created: '2026-01-01',
      updated: '2026-01-05',
    },
  };
  const flat: PreviewIssue = {
    key: 'PROJ-2',
    summary: 'Flat summary',
    status: 'Open',
    assignee: 'Bob',
    created: '2026-02-01',
    updated: '2026-02-02',
  };

  it('getStatus prefers fields.status.name then flat status', () => {
    expect(getStatus(raw)).toBe('Done');
    expect(getStatus(flat)).toBe('Open');
    expect(getStatus({ key: 'X' })).toBe('');
  });

  it('getSummary prefers fields.summary then flat summary', () => {
    expect(getSummary(raw)).toBe('Raw summary');
    expect(getSummary(flat)).toBe('Flat summary');
    expect(getSummary({ key: 'X' })).toBe('');
  });

  it('getAssignee falls back to "Unassigned"', () => {
    expect(getAssignee(raw)).toBe('Alice');
    expect(getAssignee(flat)).toBe('Bob');
    expect(getAssignee({ key: 'X' })).toBe('Unassigned');
  });

  it('getProject extracts the key prefix before the dash', () => {
    expect(getProject({ key: 'GE-483' })).toBe('GE');
    expect(getProject({ key: 'LONGPROJECTKEY-42' })).toBe('LONGPROJECTKEY');
    expect(getProject({ key: 'NODASH' })).toBe('');
    expect(getProject({ key: '' })).toBe('');
  });

  it('getCreated / getUpdated prefer fields then flat', () => {
    expect(getCreated(raw)).toBe('2026-01-01');
    expect(getUpdated(raw)).toBe('2026-01-05');
    expect(getCreated(flat)).toBe('2026-02-01');
    expect(getUpdated(flat)).toBe('2026-02-02');
  });

  it('isResolved is true for done category or done-like status', () => {
    expect(isResolved(raw)).toBe(true);
    expect(isResolved({ key: 'X', status: 'Resolved' })).toBe(true);
    expect(isResolved({ key: 'X', status: 'Open' })).toBe(false);
  });

  it('toEpoch returns 0 for missing/invalid and epoch for valid', () => {
    expect(toEpoch(undefined)).toBe(0);
    expect(toEpoch('not-a-date')).toBe(0);
    expect(toEpoch('1970-01-01T00:00:00.000Z')).toBe(0);
    expect(toEpoch('2026-01-01T00:00:00.000Z')).toBe(Date.UTC(2026, 0, 1));
  });
});

// ── ExtractionPreviewTable (absorbs the ticket-list search/filter/sort) ──────
describe('ExtractionPreviewTable', () => {
  const connections = [
    { id: 'conn-1', name: 'Test', baseUrl: 'https://test.example', email: 'a@b.com', apiToken: 't', projectKeys: 'PROJ', isActive: true },
  ];

  function makeResult(issues: PreviewIssue[], isAllTickets = false): ExtractionResult {
    return { total: issues.length, issues, isAllTickets };
  }

  const issues: PreviewIssue[] = [
    { key: 'PROJ-1', statusCategory: 'done', fields: { summary: 'Bug one', status: { name: 'Done' }, assignee: { displayName: 'Alice' }, created: '2026-01-01' } },
    { key: 'PROJ-2', status: 'Open', summary: 'Task two', assignee: 'Bob', created: '2026-01-02' },
    { key: 'PROJ-3', status: 'Open', summary: 'Feature three', assignee: 'Carol', created: '2026-01-03' },
  ];

  it('renders the completion header and all issue keys', () => {
    render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    expect(screen.getByText(/Extraction Complete/i)).toBeInTheDocument();
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
    expect(screen.getByText('PROJ-2')).toBeInTheDocument();
    expect(screen.getByText('PROJ-3')).toBeInTheDocument();
  });

  it('renders the Master Dataset header when isAllTickets', () => {
    render(<ExtractionPreviewTable result={makeResult(issues, true)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    expect(screen.getByText(/Master Dataset/i)).toBeInTheDocument();
  });

  it('computes resolved/open stats from mixed shapes', () => {
    const { container } = render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    // 1 resolved (PROJ-1 done), 2 open. Status badges also render "Open", so
    // assert on the stat tiles (the large .text-2xl numbers) by position.
    const stats = container.querySelectorAll('.text-2xl');
    expect(stats[0]).toHaveTextContent('3'); // extracted
    expect(stats[1]).toHaveTextContent('1'); // resolved
    expect(stats[2]).toHaveTextContent('2'); // open
  });

  it('filters rows by search query', () => {
    render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    const search = screen.getByPlaceholderText(/search by key/i);
    fireEvent.change(search, { target: { value: 'Feature' } });
    expect(screen.getByText('PROJ-3')).toBeInTheDocument();
    expect(screen.queryByText('PROJ-2')).not.toBeInTheDocument();
  });

  it('search also matches the assignee name', () => {
    render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    const search = screen.getByPlaceholderText(/search by key/i);
    fireEvent.change(search, { target: { value: 'Carol' } });
    expect(screen.getByText('PROJ-3')).toBeInTheDocument();
    expect(screen.queryByText('PROJ-1')).not.toBeInTheDocument();
  });

  it('builds a Jira browse link from the active connection base url', () => {
    render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    const link = screen.getByText('PROJ-1').closest('a');
    expect(link).toHaveAttribute('href', 'https://test.example/browse/PROJ-1');
  });

  it('renders project and status multi-select filters above the list', () => {
    render(<ExtractionPreviewTable result={makeResult(issues)} connections={connections} activeConnectionId="conn-1" extracting={false} />);
    expect(screen.getByRole('button', { name: 'All Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All Statuses' })).toBeInTheDocument();
  });
});

// ── QuickDateSelector (quick-pull presets) ───────────────────────────────────
describe('QuickDateSelector', () => {
  it('renders preset buttons and fires onQuickPull with the day count', () => {
    const onQuickPull = vi.fn();
    render(<QuickDateSelector dateFrom="" dateTo="" updateOnly={false} onQuickPull={onQuickPull} onQuickUpdate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));
    expect(onQuickPull).toHaveBeenCalledWith(7);
  });

  it('shows the Quick Update button only when updateOnly is true', () => {
    const { rerender } = render(<QuickDateSelector dateFrom="" dateTo="" updateOnly={false} onQuickPull={vi.fn()} onQuickUpdate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /quick update/i })).not.toBeInTheDocument();
    rerender(<QuickDateSelector dateFrom="" dateTo="" updateOnly onQuickPull={vi.fn()} onQuickUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /quick update/i })).toBeInTheDocument();
  });

  it('Set Range validates the custom days input', () => {
    const onQuickPull = vi.fn();
    render(<QuickDateSelector dateFrom="" dateTo="" updateOnly={false} onQuickPull={onQuickPull} onQuickUpdate={vi.fn()} />);
    const input = document.getElementById('customDaysBack') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /set range/i }));
    expect(onQuickPull).toHaveBeenCalledWith(5);
  });
});

// ── PollingSettings ──────────────────────────────────────────────────────────
describe('PollingSettings', () => {
  const base = {
    polling: null,
    pollEnabled: false,
    pollInterval: '15',
    pollSaving: false,
    toggleDisabled: false,
    onToggle: vi.fn(),
    onIntervalChange: vi.fn(),
  };

  it('renders the Scheduled Pulling label', () => {
    render(<PollingSettings {...base} />);
    expect(screen.getByText(/scheduled pulling/i)).toBeInTheDocument();
  });

  it('shows the LIVE badge when polling is enabled', () => {
    render(<PollingSettings {...base} polling={{ enabled: true, intervalMinutes: 15, connectionId: 'c', lastRunAt: null, nextRunAt: null, runCount: 0, status: 'idle', lastError: null }} pollEnabled />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('toggling the switch calls onToggle with the new state', () => {
    const onToggle = vi.fn();
    render(<PollingSettings {...base} onToggle={onToggle} />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('disables the switch when toggleDisabled', () => {
    render(<PollingSettings {...base} toggleDisabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

// ── EmptyExtractionCard ──────────────────────────────────────────────────────
describe('EmptyExtractionCard', () => {
  it('renders the no-issues message', () => {
    render(<EmptyExtractionCard />);
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument();
  });
});
