/**
 * Time-Series KPI Plugin Types
 *
 * Shared types for time-series plugins
 */

import type { KpiContext } from './types';

export interface TimeSeriesResult {
  name: string;
  value: number;
  unit: string;
  timeSeries?: TimeSeriesDataPoint[];
  dimensions?: Record<string, string>;
  details?: Array<{
    label: string;
    value: number;
    unit?: string;
  }>;
  ticketKeys?: string[];
}

export interface TimeSeriesDataPoint {
  period: string;
  date: Date;
  value: number;
  count: number;
  isComplete?: boolean;
}

export type TimeInterval = 'daily' | 'weekly' | 'monthly';
