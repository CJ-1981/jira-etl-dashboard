import type { KpiCalcResult } from '@/types/dashboard';

/** Shared prop-bag types for the extracted dashboard widgets. */

/** Drill-down callback: opens the sheet with the given ticket keys + title. */
export type DrillDownHandler = (keys: string[], title: string) => void;

/**
 * Common state every widget needs to manage hidden dimensions and collapse.
 * Widgets never write to the store directly; they call these callbacks so
 * KpiDashboard keeps owning the store mutations.
 */
export interface WidgetChromeProps {
  /** Current hidden-dimension keys, e.g. "pluginId|dimensionValue". */
  hiddenDimensions: string[];
  /** Remove every hidden key that starts with the given prefix. */
  onRestoreAll: (prefix: string) => void;
  /** Whether this widget's card body is expanded (not collapsed). */
  isExpanded: boolean;
  /** Toggle the collapse state for a plugin id. */
  onToggleCollapse: (pluginId: string) => void;
}

/** A single widget's KPI result group (one plugin's results). */
export type WidgetKpi = KpiCalcResult;
