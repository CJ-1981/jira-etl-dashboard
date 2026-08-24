/**
 * DashboardHeader — master-dataset badge rendering
 *
 * Regression: the empty master-dataset API response omits `lastUpdated`,
 * which used to render as "Updated Invalid Date". The badge must omit the
 * timestamp when lastUpdated is missing or invalid, and render it when valid.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHeader, type DashboardHeaderProps } from '../widgets/DashboardHeader';

vi.mock('../ViewManager', () => ({ ViewManager: () => <div data-testid="view-manager" /> }));
vi.mock('../KpiFilterPanel', () => ({ KpiFilterPanel: () => <div data-testid="filter-panel" /> }));

function renderHeader(datasetInfo: DashboardHeaderProps['masterDatasetInfo']) {
  const props: DashboardHeaderProps = {
    masterDatasetInfo: datasetInfo,
    dateFrom: '',
    dateTo: '',
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    periodAnalysis: { requiresTruncation: false, availableStartDate: null },
    onSelectPreset: vi.fn(),
    calculating: false,
    onRecalculate: vi.fn(),
    onPrint: vi.fn(),
    globalFilters: {},
    filterPanelOpen: false,
    onToggleFilterPanel: vi.fn(),
    filterPanel: {
      filters: {},
      onFilterChange: vi.fn(),
      availableValues: {},
      jqlList: [],
      onAddJql: vi.fn(),
      onEditJql: vi.fn(),
      onDeleteJql: vi.fn(),
      onToggleJql: vi.fn(),
      stagingFilters: {},
      onToggleStagingFilter: vi.fn(),
      onClearStagingFilters: vi.fn(),
      onApplyStagingFilters: vi.fn(),
    } as unknown as DashboardHeaderProps['filterPanel'],
  };
  return render(<DashboardHeader {...props} />);
}

describe('DashboardHeader master-dataset badge', () => {
  it('omits the timestamp when lastUpdated is an empty string', () => {
    renderHeader({ totalExtracted: 0, lastUpdated: '' });
    expect(screen.getByText(/0 tickets/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it('omits the timestamp when lastUpdated is not parseable', () => {
    renderHeader({ totalExtracted: 5, lastUpdated: 'not-a-date' });
    expect(screen.getByText(/5 tickets/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });

  it('renders the timestamp when lastUpdated is valid', () => {
    renderHeader({ totalExtracted: 12, lastUpdated: '2026-08-01T10:30:00.000Z' });
    expect(screen.getByText(/12 tickets/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});
