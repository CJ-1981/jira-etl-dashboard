# Time-Series Plugins Directory

This directory contains time-series aggregations of KPI metrics.

## Purpose

Time-series plugins provide historical trend analysis and aggregation capabilities for core metrics. They enable:
- Historical data visualization
- Trend analysis and forecasting
- Period-over-period comparisons
- Moving averages and smoothing

## Directory Structure

- `processing-time/` - Time-based aggregation of processing metrics
- `throughput/` - Throughput trends over time
- `sla/` - SLA compliance trends
- `turnaround/` - Cycle time trends
- `assignee/` - Individual performance trends

## Time-Series Plugin Requirements

- Must accept time period parameters (start, end, granularity)
- Should support multiple granularities (daily, weekly, monthly)
- Must return array of time-ordered results
- Should handle sparse data with appropriate filling/interpolation

## Data Format

Time-series plugins return KpiResult[] where each result has:
- `value` - Metric value for that time point
- `dimensions.period` - Time period identifier (ISO date string)
- Optional `dimensions.granularity` - Time granularity

## Common Patterns

1. **Daily aggregation** - One data point per day
2. **Weekly aggregation** - One data point per week (ISO week)
3. **Monthly aggregation** - One data point per month
4. **Rolling averages** - Moving window calculations
5. **Period comparison** - Current vs previous period
