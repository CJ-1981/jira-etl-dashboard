/**
 * Tests for the extracted chart/ building blocks:
 *  - ChartTooltip (consolidated tooltip for all chart types)
 *  - zoom helpers (sliceForZoom, ZoomSelectionArea, useChartZoom)
 *  - per-chart-type renderers (rendered with a dimension-providing
 *    ResponsiveContainer stub so recharts lays out in jsdom)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartTooltip,
  sliceForZoom,
  ZoomSelectionArea,
  useChartZoom,
  BarChartRenderer,
  PieChartRenderer,
  LineChartRenderer,
  AreaChartRenderer,
  type ChartZoomState,
} from '../chart';
import type { ChartDatum, ChartRendererBaseProps } from '../chart/chart-shared';
import type { ChartSeriesResults } from '../chart/chart-shared';

// ─── ChartTooltip ─────────────────────────────────────────────────────────────

type TooltipEntry = {
  name?: string;
  value?: number;
  dataKey?: string;
  color?: string;
  payload?: Record<string, unknown>;
};

function renderTooltip(
  variant: 'line' | 'area' | 'seriesBar' | 'bar' | 'pie',
  payload: TooltipEntry[],
  unit = 'count',
) {
  return render(
    <ChartTooltip active payload={payload as never} variant={variant} unit={unit} />,
  );
}

describe('ChartTooltip', () => {
  it('renders nothing when inactive or without payload', () => {
    const { container: c1 } = render(
      <ChartTooltip active={false} payload={undefined} variant="bar" unit="" />,
    );
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(
      <ChartTooltip active payload={[]} variant="bar" unit="" />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it('bar variant uses the row label from the payload name and per-row unit', () => {
    renderTooltip('bar', [
      { name: 'Done', value: 12, color: '#10b981', dataKey: 'value', payload: { name: 'W1', unit: 'hours' } },
    ]);
    expect(screen.getByText('W1')).toBeInTheDocument(); // header from payload.name
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('12.0h')).toBeInTheDocument(); // hours unit from row payload
  });

  it('skips zero/undefined values', () => {
    renderTooltip('bar', [
      { name: 'A', value: 0, color: '#10b981', payload: { name: 'W1' } },
      { name: 'B', value: undefined, color: '#10b981', payload: { name: 'W1' } },
      { name: 'C', value: 5, color: '#10b981', payload: { name: 'W1' } },
    ]);
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('line variant sorts rows by value descending and uses the chart unit', () => {
    renderTooltip('line', [
      { name: 'low', value: 1, dataKey: 'series0', payload: { name: 'W1' } },
      { name: 'high', value: 9, dataKey: 'series1', payload: { name: 'W1' } },
      { name: 'mid', value: 5, dataKey: 'series2', payload: { name: 'W1' } },
    ], '%');
    const rows = screen.getAllByText(/^(low|high|mid)$/).map((n) => n.textContent);
    expect(rows).toEqual(['high', 'mid', 'low']);
    expect(screen.getByText('9.0%')).toBeInTheDocument();
  });

  it('area variant reverses payload order', () => {
    renderTooltip('area', [
      { name: 'first', value: 1, dataKey: 'series0', payload: { name: 'W1' } },
      { name: 'second', value: 2, dataKey: 'series1', payload: { name: 'W1' } },
    ]);
    const rows = screen.getAllByText(/^(first|second)$/).map((n) => n.textContent);
    expect(rows).toEqual(['second', 'first']);
  });

  it('seriesBar variant keeps natural order and resolves series colors', () => {
    const { container } = renderTooltip('seriesBar', [
      { name: 'a', value: 3, dataKey: 'series0', payload: { name: 'W1' } },
      { name: 'b', value: 4, dataKey: 'series1', payload: { name: 'W1' } },
    ]);
    const rows = screen.getAllByText(/^(a|b)$/).map((n) => n.textContent);
    expect(rows).toEqual(['a', 'b']);
    // two color swatches rendered
    expect(container.querySelectorAll('.rounded-full').length).toBe(2);
  });

  it('pie variant titles with the slice name and a single Value row', () => {
    renderTooltip('pie', [
      { name: 'Slice A', value: 42, color: '#8b5cf6', payload: { name: 'Slice A', unit: 'count', fill: '#8b5cf6' } },
    ]);
    expect(screen.getByText('Slice A')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    expect(screen.getByText('42.0count')).toBeInTheDocument();
  });

  it('pie variant hides the whole tooltip for a zero-value slice', () => {
    const { container } = renderTooltip('pie', [
      { name: 'Slice A', value: 0, payload: { name: 'Slice A' } },
    ]);
    expect(container.firstChild).toBeNull();
  });
});

// ─── Zoom helpers ─────────────────────────────────────────────────────────────

describe('sliceForZoom', () => {
  const data = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }];

  it('returns the original array when no zoom window is set', () => {
    expect(sliceForZoom(data, { leftIndex: null, rightIndex: null })).toBe(data);
  });

  it('slices inclusively across the zoom window', () => {
    const out = sliceForZoom(data, { leftIndex: 1, rightIndex: 2 });
    expect(out.map((d) => d.name)).toEqual(['b', 'c']);
  });
});

describe('ZoomSelectionArea', () => {
  const data = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

  it('renders nothing while no drag selection exists', () => {
    const out = ZoomSelectionArea({
      data,
      zoomState: { refAreaLeft: undefined, refAreaRight: undefined },
    });
    expect(out).toBeNull();
  });

  it('maps the drag indices to period names on a ReferenceArea', () => {
    const out = ZoomSelectionArea({
      data,
      zoomState: { refAreaLeft: 0, refAreaRight: 2 },
    });
    expect(out).not.toBeNull();
    // ReferenceArea element with the resolved x1/x2 category names.
    expect(out!.props.x1).toBe('a');
    expect(out!.props.x2).toBe('c');
    expect(out!.props.fill).toBe('purple');
  });
});

function ZoomHarness({ anchor = 1, extend = 3 }: { anchor?: number; extend?: number }) {
  const { zoomState, isZoomed, resetZoom, zoomMouseHandlers } = useChartZoom();
  return (
    <div>
      <span data-testid="zoomed">{String(isZoomed)}</span>
      <span data-testid="left">{String(zoomState.leftIndex)}</span>
      <span data-testid="right">{String(zoomState.rightIndex)}</span>
      <button data-testid="down" onClick={() => zoomMouseHandlers.onMouseDown({ activeTooltipIndex: anchor })} />
      <button data-testid="move" onClick={() => zoomMouseHandlers.onMouseMove({ activeTooltipIndex: extend })} />
      <button data-testid="up" onClick={() => zoomMouseHandlers.onMouseUp()} />
      <button data-testid="reset" onClick={resetZoom} />
    </div>
  );
}

describe('useChartZoom', () => {
  it('anchors, extends and commits a zoom window, then resets', () => {
    render(<ZoomHarness />);
    expect(screen.getByTestId('zoomed').textContent).toBe('false');

    fireEvent.click(screen.getByTestId('down'));
    fireEvent.click(screen.getByTestId('move'));
    fireEvent.click(screen.getByTestId('up'));

    expect(screen.getByTestId('zoomed').textContent).toBe('true');
    expect(screen.getByTestId('left').textContent).toBe('1');
    expect(screen.getByTestId('right').textContent).toBe('3');

    fireEvent.click(screen.getByTestId('reset'));
    expect(screen.getByTestId('zoomed').textContent).toBe('false');
    expect(screen.getByTestId('left').textContent).toBe('null');
  });

  it('normalises a reversed drag so left <= right', () => {
    render(<ZoomHarness anchor={3} extend={1} />);
    fireEvent.click(screen.getByTestId('down'));
    fireEvent.click(screen.getByTestId('move'));
    fireEvent.click(screen.getByTestId('up'));
    const left = Number(screen.getByTestId('left').textContent);
    const right = Number(screen.getByTestId('right').textContent);
    expect(left).toBe(1);
    expect(right).toBe(3);
  });
});

// ─── Renderers ────────────────────────────────────────────────────────────────

// Provide real dimensions so recharts lays out in jsdom (ResponsiveContainer
// normally measures via ResizeObserver, which is a no-op mock here).
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactElement<{ width?: number; height?: number }>;
    }) => React.cloneElement(children, { width: 600, height: 300 }),
  };
});

const baseProps: Omit<ChartRendererBaseProps, 'data' | 'seriesResults'> = {
  kpiId: 'throughput_trend',
  configType: 'bar',
  unit: 'count',
  chartHeight: 300,
  theme: 'light',
  hiddenDimensions: [],
  onLegendClick: vi.fn(),
  onDrillDown: vi.fn(),
  slaTarget: null,
};

const singleSeriesData: ChartDatum[] = [
  { name: 'W1', value: 5, ticketKeys: ['T1'] },
  { name: 'W2', value: 8, ticketKeys: ['T2'] },
];

const multiSeriesResults: ChartSeriesResults = [
  {
    name: 'Done',
    slaTargetHours: 40,
    timeSeries: [
      { period: 'W1', value: 3, isComplete: true, ticketKeys: ['A1'] },
      { period: 'W2', value: 5, isComplete: true, ticketKeys: ['A2'] },
    ],
  },
  {
    name: 'Open',
    timeSeries: [
      { period: 'W1', value: 2, isComplete: false, ticketKeys: ['B1'] },
    ],
  },
];

describe('BarChartRenderer', () => {
  it('renders a single-series bar chart with an x-axis category', () => {
    const { container } = render(
      <BarChartRenderer {...baseProps} data={singleSeriesData} seriesResults={[]} />,
    );
    expect(container.querySelector('.recharts-bar')).not.toBeNull();
    expect(screen.getByText('W1')).toBeInTheDocument();
  });

  it('renders one bar per series for multi-series time-series data', () => {
    const { container } = render(
      <BarChartRenderer {...baseProps} data={[]} seriesResults={multiSeriesResults} />,
    );
    const bars = container.querySelectorAll('.recharts-bar');
    expect(bars.length).toBe(2);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });
});

describe('PieChartRenderer', () => {
  it('renders a pie and a legend entry per datum', () => {
    const { container } = render(
      <PieChartRenderer
        {...baseProps}
        data={[
          { name: 'A', value: 5 },
          { name: 'B', value: 3 },
        ]}
        seriesResults={[]}
      />,
    );
    expect(container.querySelector('.recharts-pie')).not.toBeNull();
    // Legend entries render synchronously (sectors animate in).
    expect(container.querySelectorAll('.recharts-legend-item').length).toBe(2);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('filters out hidden dimensions from the pie data', () => {
    const { container } = render(
      <PieChartRenderer
        {...baseProps}
        data={[
          { name: 'A', value: 5 },
          { name: 'B', value: 3 },
        ]}
        seriesResults={[]}
        hiddenDimensions={['throughput_trend|B']}
      />,
    );
    expect(container.querySelectorAll('.recharts-legend-item').length).toBe(1);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).toBeNull();
  });
});

describe('LineChartRenderer', () => {
  it('renders a line for single-series data', () => {
    const noZoom: ChartZoomState = { leftIndex: null, rightIndex: null, refAreaLeft: undefined, refAreaRight: undefined };
    const { container } = render(
      <LineChartRenderer
        {...baseProps}
        data={singleSeriesData}
        seriesResults={[]}
        zoomState={noZoom}
        zoomMouseHandlers={{ onMouseDown: vi.fn(), onMouseMove: vi.fn(), onMouseUp: vi.fn() }}
      />,
    );
    expect(container.querySelector('.recharts-line')).not.toBeNull();
  });
});

describe('AreaChartRenderer', () => {
  it('renders a stacked area per series for multi-series data', () => {
    const noZoom: ChartZoomState = { leftIndex: null, rightIndex: null, refAreaLeft: undefined, refAreaRight: undefined };
    const { container } = render(
      <AreaChartRenderer
        {...baseProps}
        data={[]}
        seriesResults={multiSeriesResults}
        zoomState={noZoom}
        zoomMouseHandlers={{ onMouseDown: vi.fn(), onMouseMove: vi.fn(), onMouseUp: vi.fn() }}
      />,
    );
    const areas = container.querySelectorAll('.recharts-area');
    expect(areas.length).toBe(2);
  });
});
