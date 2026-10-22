import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { KpiDataTable } from '../KpiDataTable';
import { renderWithProviders } from '@/test/mock-store';

vi.mock('@/store/app-store', () => {
  const useAppStore = (sel: any) => {
    const s = {
      settings: { alerts: { thresholds: { throughput: { warning: 5, critical: 10, operator: '>' } } } },
    };
    return typeof sel === 'function' ? sel(s) : s;
  };
  useAppStore.getState = () => ({});
  return { useAppStore };
});

const results = [
  {
    pluginId: 'throughput',
    results: [
      // Health is derived from the mocked thresholds (warning 5, critical 10,
      // operator >), not from any alertStatus field: 7 → Warning, 25/30 → Critical.
      { name: 'Open Tickets', value: 7, unit: 'tickets', dimensions: { status: 'In Progress' } },
      { name: 'Resolved', value: 30, unit: 'tickets', dimensions: { status: 'Done' } },
      { name: 'High Priority Open', value: 25, unit: 'tickets', dimensions: { priority: 'Highest' } },
    ],
  },
  {
    pluginId: 'avg_processing_hours',
    // No threshold configured → Healthy.
    results: [{ name: 'Avg. Processing Hours', value: 12.5, unit: 'hours', dimensions: {} }],
  },
];

describe('KpiDataTable filters', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function renderTable() {
    return renderWithProviders(
      <KpiDataTable results={results} onDrillDown={vi.fn()} getPluginName={(id) => id} />,
    );
  }

  /** Opens a FilterMultiSelect popover by its placeholder and ticks one option.
   *  The options live in a Radix popover portal (role=dialog). */
  function selectFilterOption(placeholder: RegExp, option: RegExp) {
    fireEvent.click(screen.getByRole('button', { name: placeholder }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText(option));
  }

  it('renders all rows and the three filter dropdowns', () => {
    renderTable();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getByText('All Plugins')).toBeInTheDocument();
    expect(screen.getByText('All Dimensions')).toBeInTheDocument();
    expect(screen.getByText('All Health States')).toBeInTheDocument();
  });

  it('health multiselect filters rows by their alert state', () => {
    renderTable();
    selectFilterOption(/all health states/i, /critical/i);

    // Critical rows stay, Warning (Open Tickets) and Healthy (Avg.) rows go
    expect(screen.getByText('High Priority Open')).toBeInTheDocument();
    expect(screen.queryByText('Open Tickets')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg. Processing Hours')).not.toBeInTheDocument();
  });

  it("plugin multiselect keeps only the selected plugin's rows", () => {
    renderTable();
    selectFilterOption(/all plugins/i, /avg_processing_hours/i);

    expect(screen.getByText('Avg. Processing Hours')).toBeInTheDocument();
    expect(screen.queryByText('High Priority Open')).not.toBeInTheDocument();
  });

  it('dimension multiselect filters by the resolved dimension type', () => {
    renderTable();
    selectFilterOption(/all dimensions/i, /status/i);

    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(screen.queryByText('Avg. Processing Hours')).not.toBeInTheDocument();
  });

  it('selecting from multiple filters intersects the results', () => {
    renderTable();
    selectFilterOption(/all plugins/i, /throughput/i);
    selectFilterOption(/all health states/i, /critical/i);

    // throughput ∧ Critical: High Priority Open stays, the Warning row of the
    // same plugin and the other plugin's rows are all filtered out
    expect(screen.getByText('High Priority Open')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.queryByText('Open Tickets')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg. Processing Hours')).not.toBeInTheDocument();
  });
});
