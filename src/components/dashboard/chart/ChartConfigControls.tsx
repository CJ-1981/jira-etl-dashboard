'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectValue,
} from '@/components/ui/select';
import type { ChartConfig } from '@/types/dashboard';

interface KpiOption {
  id: string;
  label: string;
}

export interface ChartConfigControlsProps {
  config: ChartConfig;
  kpiOptions: { timeSeries: KpiOption[]; regular: KpiOption[] };
  /** Chart type after time-series coercion (bar/pie trend KPIs render as line). */
  effectiveChartType: ChartConfig['type'];
  isTimeSeries: boolean;
  onKpiChange: (kpiId: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
}

/**
 * Inline KPI / chart-type / width / height selectors shown above the chart.
 * Extracted from ChartCard to keep the orchestrator focused on state and
 * dispatch; renders exactly the same controls as before.
 */
export function ChartConfigControls({
  config,
  kpiOptions,
  effectiveChartType,
  isTimeSeries,
  onKpiChange,
  onChange,
}: ChartConfigControlsProps) {
  return (
    <div className="flex flex-wrap gap-3" data-export-ignore="true">
      <div className="w-[280px]">
        <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">KPI Metric</Label>
        <Select value={config.kpiId} onValueChange={onKpiChange}>
          <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <SelectValue placeholder="Select KPI..." />
          </SelectTrigger>
          <SelectContent>
            {kpiOptions.timeSeries.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  📈 Time-Series Trends
                </SelectLabel>
                {kpiOptions.timeSeries.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {kpiOptions.regular.length > 0 && (
              <>
                {kpiOptions.timeSeries.length > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    📊 Standard KPIs
                  </SelectLabel>
                  {kpiOptions.regular.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[140px]">
        <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Chart Type</Label>
        <Select
          value={effectiveChartType}
          onValueChange={(type: 'bar' | 'line' | 'pie' | 'area') => onChange(config.id, { ...config, type })}
          disabled={!config.kpiId}
        >
          <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!isTimeSeries && <SelectItem value="bar">Bar Chart</SelectItem>}
            <SelectItem value="line">Line Chart</SelectItem>
            {!isTimeSeries && <SelectItem value="pie">Pie Chart</SelectItem>}
            <SelectItem value="area">Area Chart</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex gap-3">
        <div className="w-[120px]">
          <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Width</Label>
          <Select
            value={config.width}
            onValueChange={(width: 'sm' | 'md' | 'lg' | 'full') => onChange(config.id, { ...config, width })}
          >
            <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="full">Full</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[120px]">
          <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Height</Label>
          <Select
            value={config.height || 'md'}
            onValueChange={(height: 'short' | 'md' | 'tall' | 'xtall') => onChange(config.id, { ...config, height })}
          >
            <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="tall">Tall</SelectItem>
              <SelectItem value="xtall">Extra Tall</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
