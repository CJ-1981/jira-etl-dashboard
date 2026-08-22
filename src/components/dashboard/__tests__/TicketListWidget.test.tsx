import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { createMockStore, renderWithProviders } from '@/test/mock-store';
import { TicketListWidget } from '../TicketListWidget';
import type { JiraIssue } from '@/lib/jira/client';

// react-virtuoso relies on browser APIs at render-time for large lists; stub it.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ totalCount, itemContent }: any) => (
    <div data-testid="virtuoso">
      {Array.from({ length: totalCount }, (_, i) => itemContent(i))}
    </div>
  ),
}));

// WidgetResizeContainer reads widgetHeights/setWidgetHeights from the store.
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
}));

function makeIssue(key: string, summary: string, status = 'In Progress', priority = 'Medium'): JiraIssue {
  return {
    key,
    self: '',
    fields: {
      summary,
      issuetype: { name: 'Story' },
      priority: { name: priority },
      status: { name: status, statusCategory: { name: 'Indeterminate' } },
      assignee: { displayName: 'Alice', emailAddress: 'a@x.com' },
      created: '2026-01-15T10:00:00.000+0000',
      updated: '2026-01-16T10:00:00.000+0000',
    },
  } as unknown as JiraIssue;
}

const ISSUES: JiraIssue[] = [
  makeIssue('PROJ-1', 'Fix login bug', 'Open', 'High'),
  makeIssue('PROJ-2', 'Update docs', 'Done', 'Low'),
  makeIssue('PROJ-3', 'Refactor API', 'In Progress', 'Medium'),
  makeIssue('PROJ-4', 'Add tests', 'Open', 'High'),
];

function makeIssueMap(): Map<string, JiraIssue> {
  const m = new Map<string, JiraIssue>();
  for (const i of ISSUES) m.set(i.key, i);
  return m;
}

// kpis grouped so this_week/{opened,closed} and last_week/{opened,closed} all resolve.
function makeKpis() {
  return [
    {
      pluginId: 'weekly_ticket_list',
      results: [
        { dimensions: { week: 'this_week', activity: 'opened' }, value: 2, ticketKeys: ['PROJ-1', 'PROJ-2'] },
        { dimensions: { week: 'this_week', activity: 'closed' }, value: 1, ticketKeys: ['PROJ-3'] },
        { dimensions: { week: 'last_week', activity: 'opened' }, value: 1, ticketKeys: ['PROJ-4'] },
        { dimensions: { week: 'last_week', activity: 'closed' }, value: 0, ticketKeys: [] },
      ],
    },
  ];
}

const PROPS = {
  pluginId: 'plugin-weekly_ticket_list',
  issueMap: makeIssueMap(),
  kpis: makeKpis(),
  jiraBaseUrl: 'https://jira.example.com',
};

beforeEach(() => {
  storeRef.current = createMockStore();
});

describe('TicketListWidget', () => {
  it('renders ticket rows (key/summary/status) for a seeded issue map when expanded', () => {
    renderWithProviders(<TicketListWidget {...PROPS} isCollapsed={false} onToggleCollapse={vi.fn()} />);

    // Week section headings.
    expect(screen.getByText('This Week')).toBeInTheDocument();
    expect(screen.getByText('Last Week')).toBeInTheDocument();
    // opened / closed activity labels (two of each across the weeks).
    expect(screen.getAllByText('opened').length).toBe(2);
    expect(screen.getAllByText('closed').length).toBe(2);

    // Ticket keys render as links pointing at the Jira browse URL.
    const link1 = screen.getByRole('link', { name: 'PROJ-1' });
    expect(link1).toHaveAttribute('href', 'https://jira.example.com/browse/PROJ-1');
    expect(screen.getByRole('link', { name: 'PROJ-2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PROJ-3' })).toBeInTheDocument();

    // Summaries render in the row text.
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Refactor API')).toBeInTheDocument();
  });

  it('renders the issue key as a plain span when no jiraBaseUrl is configured', () => {
    renderWithProviders(
      <TicketListWidget {...PROPS} jiraBaseUrl="" isCollapsed={false} onToggleCollapse={vi.fn()} />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
  });

  it('shows "No tickets" for an activity whose ticket list is empty', () => {
    renderWithProviders(<TicketListWidget {...PROPS} isCollapsed={false} onToggleCollapse={vi.fn()} />);

    // last_week / closed had zero ticket keys.
    expect(screen.getByText('No tickets')).toBeInTheDocument();
  });

  it('collapses the content and shows a ticket count when isCollapsed is true', () => {
    renderWithProviders(<TicketListWidget {...PROPS} isCollapsed={true} onToggleCollapse={vi.fn()} />);

    // Body hidden: week headings absent.
    expect(screen.queryByText('This Week')).not.toBeInTheDocument();
    // totalTickets = 2 + 1 + 1 + 0 = 4
    expect(screen.getByText('(4 tickets)')).toBeInTheDocument();
  });

  it('invokes onToggleCollapse with the plugin id when the header is clicked', () => {
    const onToggleCollapse = vi.fn();
    renderWithProviders(<TicketListWidget {...PROPS} isCollapsed={false} onToggleCollapse={onToggleCollapse} />);

    fireEvent.click(screen.getByRole('button', { name: /Weekly Ticket Overview/i }));
    expect(onToggleCollapse).toHaveBeenCalledWith('plugin-weekly_ticket_list');
  });

  it('renders the priority badge for a row', () => {
    renderWithProviders(<TicketListWidget {...PROPS} isCollapsed={false} onToggleCollapse={vi.fn()} />);

    // PROJ-1 has High priority.
    const link1 = screen.getByRole('link', { name: 'PROJ-1' });
    const row = link1.closest('div[title]') || link1.parentElement!.parentElement!;
    expect(within(row as HTMLElement).getByText('High')).toBeInTheDocument();
  });
});
