/**
 * Time-Series KPI Plugin Types
 *
 * Shared types for time-series plugins
 */

import type { KpiResult, TimeSeriesDataPoint, TimeInterval } from './types';

export type { TimeSeriesDataPoint, TimeInterval };

export interface TimeSeriesResult extends KpiResult {
  // Inherits all properties from KpiResult
  // We can keep this interface if we want to specifically mark it as a time-series result
}
