/**
 * Tests for the cycle-time histogram widget's collapse behavior.
 *
 * Regression: the widget synthesizes its ChartCard config, so the card's own
 * store toggle (dashboardCharts lookup) silently no-op'd and the collapse
 * chevron next to the title did nothing. Collapse state is now controlled
 * from outside via the shared collapsedWidgets store.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { CycleTimeHistogramWidget } from '../CycleTimeHistogramWidget';
import { renderWithProviders } from '@/test/mock-store';
import type { KpiCalcResult } from '@/types/dashboard';

const kpis: KpiCalcResult[] = [
  {
    pluginId: 'cycle_time_histogram',
    results: [
      { name: '< 4h', value: 5, unit: 'tickets' },
      { name: '4-8h (1d)', value: 3, unit: 'tickets' },
    ],
  } as unknown as KpiCalcResult,
];

const baseProps = {
  kpis,
  kpiResults: kpis,
  hiddenDimensions: [],
  toggleDimension: vi.fn(),
  onRemove: vi.fn(),
  onChange: vi.fn(),
  onDrillDown: vi.fn(),
  theme: 'dark' as const,
};

describe('CycleTimeHistogramWidget', () => {
  it('renders the expanded chart card with a collapse chevron', () => {
    renderWithProviders(<CycleTimeHistogramWidget {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Collapse chart' })).toBeInTheDocument();
  });

  it('clicking the chevron fires the external collapse toggle', () => {
    const onToggleCollapse = vi.fn();
    renderWithProviders(<CycleTimeHistogramWidget {...baseProps} collapsed={false} onToggleCollapse={onToggleCollapse} />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse chart' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('collapsed=true hides the chart body and offers the expand chevron', () => {
    const onToggleCollapse = vi.fn();
    renderWithProviders(
      <CycleTimeHistogramWidget {...baseProps} collapsed onToggleCollapse={onToggleCollapse} />,
    );

    // Body hidden, chevron flipped — clicking it re-expands via the same callback.
    expect(screen.queryByRole('button', { name: 'Collapse chart' })).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: 'Expand chart' });
    fireEvent.click(expand);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('without controlled props the chevron still renders in expanded state', () => {
    // Store-backed charts keep their existing behavior — the card defaults to
    // expanded and the store toggle path handles the click.
    renderWithProviders(<CycleTimeHistogramWidget {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Collapse chart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand chart' })).not.toBeInTheDocument();
  });

  it('derived card hides the management controls that cannot persist', () => {
    // The synthesized config id is not in dashboardCharts, so remove/rename/
    // move and the inline config controls would be silent no-ops — they must
    // not render. Collapse, JQL filter settings, and PNG export remain.
    renderWithProviders(<CycleTimeHistogramWidget {...baseProps} />);

    expect(screen.queryByRole('button', { name: 'Remove chart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename chart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move chart up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move chart down' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /JQL filter settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collapse chart/i })).toBeInTheDocument();
  });
});
