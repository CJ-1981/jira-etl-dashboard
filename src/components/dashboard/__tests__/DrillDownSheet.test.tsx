import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/mock-store';
import { DrillDownSheet } from '../DrillDownSheet';

// react-virtuoso relies on browser APIs at render-time; render all items inline.
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ totalCount, itemContent }: any) => (
    <div data-testid="virtuoso">
      {Array.from({ length: totalCount }, (_, i) => itemContent(i))}
    </div>
  ),
}));

function makeIssue(key: string, summary: string, status: string, assignee: string) {
  return {
    key,
    fields: {
      summary,
      status: { name: status, statusCategory: { name: 'Indeterminate' } },
      assignee: { displayName: assignee },
      created: '2026-01-15T10:00:00.000+0000',
    },
  };
}

const ISSUES = [
  makeIssue('PROJ-1', 'Fix login bug', 'Open', 'Alice'),
  makeIssue('PROJ-2', 'Refactor API', 'In Progress', 'Bob'),
];

const BASE_PROPS = {
  isOpen: true,
  onOpenChange: vi.fn(),
  drillDownTitle: 'Open tickets',
  drillDownKeys: ['PROJ-1', 'PROJ-2'],
  issues: ISSUES,
  connections: [] as any[],
  activeConnectionId: null as string | null,
};

describe('DrillDownSheet', () => {
  it('renders the title, issue count, and issue rows when open', () => {
    renderWithProviders(<DrillDownSheet {...BASE_PROPS} />);

    expect(screen.getByText('Open tickets')).toBeInTheDocument();
    expect(screen.getByText(/Displaying 2 issues/)).toBeInTheDocument();
    // Issue keys + summaries render for each drill-down key.
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
    expect(screen.getByText('PROJ-2')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.getByText('Refactor API')).toBeInTheDocument();
    // Status badges per row.
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders keys as plain spans when there is no active connection', () => {
    renderWithProviders(<DrillDownSheet {...BASE_PROPS} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
  });

  it('renders keys as Jira links when an active connection is present', () => {
    renderWithProviders(
      <DrillDownSheet
        {...BASE_PROPS}
        connections={[{ id: 'c1', baseUrl: 'https://jira.example.com' }]}
        activeConnectionId="c1"
      />,
    );

    const link = screen.getByRole('link', { name: /PROJ-1/i });
    expect(link).toHaveAttribute('href', 'https://jira.example.com/browse/PROJ-1');
  });

  it('prepends https:// to a connection baseUrl that lacks a scheme', () => {
    renderWithProviders(
      <DrillDownSheet
        {...BASE_PROPS}
        connections={[{ id: 'c1', baseUrl: 'jira.example.com' }]}
        activeConnectionId="c1"
      />,
    );

    expect(screen.getByRole('link', { name: /PROJ-1/i })).toHaveAttribute(
      'href',
      'https://jira.example.com/browse/PROJ-1',
    );
  });

  it('renders the assignee for each issue row', () => {
    renderWithProviders(<DrillDownSheet {...BASE_PROPS} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the close button is clicked', () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<DrillDownSheet {...BASE_PROPS} onOpenChange={onOpenChange} />);

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(<DrillDownSheet {...BASE_PROPS} isOpen={false} />);
    expect(screen.queryByText('Open tickets')).not.toBeInTheDocument();
    expect(screen.queryByText('PROJ-1')).not.toBeInTheDocument();
  });
});
