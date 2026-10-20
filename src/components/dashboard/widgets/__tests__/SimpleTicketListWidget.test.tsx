import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SimpleTicketListWidget } from '../SimpleTicketListWidget';
import { renderWithProviders } from '@/test/mock-store';
import type { JiraIssue } from '@/lib/jira/client';

function makeIssue(key: string, opts: { assignee?: string; participants?: string[]; status?: string } = {}): JiraIssue {
  return {
    key,
    fields: {
      summary: `Summary for ${key}`,
      status: { name: opts.status || 'Open', statusCategory: { name: opts.status === 'Done' ? 'Done' : 'In Progress' } },
      assignee: opts.assignee === undefined ? null : { displayName: opts.assignee },
      priority: { name: 'Medium' },
      created: '2026-01-01T10:00:00Z',
      updated: '2026-01-02T10:00:00Z',
      customfield_10032: (opts.participants || []).map((displayName) => ({ displayName })),
      labels: [],
      components: [],
    },
  } as unknown as JiraIssue;
}

const kpis = [
  {
    pluginId: 'simple_ticket_list',
    results: [{ value: 2, ticketKeys: ['AB-1', 'AB-2'] }],
  },
];

const issueMap = new Map<string, JiraIssue>([
  ['AB-1', makeIssue('AB-1', { assignee: 'Alice', participants: ['Bob'], status: 'Open' })],
  ['AB-2', makeIssue('AB-2', { assignee: 'Carol', participants: ['Bob', 'Dave'], status: 'Done' })],
]);

const baseProps = {
  pluginId: 'simple_ticket_list',
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
  kpis,
  issueMap,
  jiraBaseUrl: 'https://jira.example.com',
};

describe('SimpleTicketListWidget', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('renders one row per in-scope ticket with key, summary, assignee, participants, and status', () => {
    renderWithProviders(<SimpleTicketListWidget {...baseProps} />);
    expect(screen.getByText('Summary for AB-1')).toBeInTheDocument();
    expect(screen.getByText('Summary for AB-2')).toBeInTheDocument();
    expect(screen.getByText('Bob, Dave')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('search filters rows by key, summary, assignee, and participant', () => {
    renderWithProviders(<SimpleTicketListWidget {...baseProps} />);
    const search = screen.getByPlaceholderText(/search by key/i);
    fireEvent.change(search, { target: { value: 'Carol' } });
    expect(screen.getByText('Summary for AB-2')).toBeInTheDocument();
    expect(screen.queryByText('Summary for AB-1')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'Dave' } });
    expect(screen.getByText('Summary for AB-2')).toBeInTheDocument();
    expect(screen.queryByText('Summary for AB-1')).not.toBeInTheDocument();
  });

  it('copies the visible table as TSV via the button', async () => {
    renderWithProviders(<SimpleTicketListWidget {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /copy tsv/i }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const tsv = writeText.mock.calls[0][0] as string;
    const lines = tsv.split('\n');
    expect(lines[0]).toBe('Key\tSummary\tAssignee\tParticipants\tStatus');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('AB-1');
    expect(lines[1]).toContain('Alice');
    expect(lines[1]).toContain('Bob');
  });

  it('copies as TSV when the T key is pressed outside inputs', () => {
    renderWithProviders(<SimpleTicketListWidget {...baseProps} />);
    fireEvent.keyDown(window, { key: 't' });
    expect(writeText).toHaveBeenCalledTimes(1);

    // Typing guard: a T inside an input must not trigger the copy again.
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 't' });
    expect(writeText).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('collapsed state hides the table and shows the ticket count', () => {
    renderWithProviders(<SimpleTicketListWidget {...baseProps} isCollapsed />);
    expect(screen.queryByPlaceholderText(/search by key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/\(2 tickets\)/)).toBeInTheDocument();
  });
});
