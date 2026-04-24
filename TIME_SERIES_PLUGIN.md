# Time-Series KPI Plugin Guide

## Overview

The Time-Series KPI Plugin allows you to track KPI trends over time, grouping data by daily, weekly, or monthly intervals. This is perfect for identifying patterns, trends, and seasonality in your Jira metrics.

## Available Time-Series Plugins

Three built-in time-series plugins are now available:

### 1. Processing Time Trend (`processing_time_trend`)
- **What it measures**: Average business hours to resolve tickets per time period
- **Best for**: Identifying trends in resolution speed, spotting bottlenecks
- **Chart type**: Line chart (recommended)
- **Data returned**: Weekly/Monthly/Daily average processing times

### 2. Throughput Trend (`throughput_trend`)
- **What it measures**: Number of tickets resolved per time period
- **Best for**: Tracking team velocity, identifying peak periods
- **Chart type**: Line chart (recommended)
- **Data returned**: Tickets resolved per period

### 3. SLA Trend (`sla_trend`)
- **What it measures**: SLA compliance rate per time period
- **Best for**: Monitoring service level performance over time
- **Chart type**: Line chart (recommended)
- **Data returned**: Compliance percentage per period

## How to Use

### Step 1: Calculate KPIs

In the **KPI Dashboard** tab:

1. Ensure you have extracted data (run ETL Extraction in Extract tab)
2. Set your desired date range
3. Click **"Calculate All KPIs"**
4. The time-series plugins will be automatically calculated

### Step 2: Add Charts

1. Scroll down to the **"Visualizations"** section
2. Click **"Add Chart"** if needed (you start with one)
3. In a chart card, click the **KPI dropdown** and select:
   - "Processing Time Trend" - for weekly resolution times
   - "Throughput Trend" - for weekly throughput
   - "SLA Trend" - for weekly SLA compliance
4. The chart will automatically render as a line chart

### Step 3: Analyze Trends

- **Line charts show time-series data** with periods on the x-axis
- **Hover over data points** to see exact values
- **Look for patterns**: Upward trends, downward trends, seasonal variations
- **Compare multiple periods**: Add multiple charts to compare different metrics

## Data Structure

Time-series KPIs return extended data:

```typescript
{
  name: "Avg. Processing Time",
  value: 42.5,  // Overall average
  unit: "hours",
  timeSeries: [
    {
      period: "2024-W01",
      date: "2024-01-07T12:00:00.000Z",
      value: 38.2,  // Week 1 average
      count: 145    // Issues resolved that week
    },
    {
      period: "2024-W02",
      date: "2024-01-14T12:00:00.000Z",
      value: 41.8,  // Week 2 average
      count: 167
    },
    // ... more weeks
  ]
}
```

## Example Scenarios

### Scenario 1: Track Weekly Processing Times

**Problem**: You want to see if your team's resolution speed is improving over time.

**Solution**:
1. Extract data for the last 90 days
2. Calculate KPIs
3. Add a chart and select "Processing Time Trend"
4. View line chart showing weekly averages

**What to look for**:
- Downward trend = Improving (faster resolutions)
- Upward trend = Concern (slower resolutions)
- Spikes = Investigate what happened that week

### Scenario 2: Monitor Throughput Patterns

**Problem**: You want to identify peak workload periods.

**Solution**:
1. Extract data for the last 365 days
2. Calculate KPIs
3. Add a chart and select "Throughput Trend"
4. View line chart showing weekly throughput

**What to look for**:
- Peak weeks = Plan resource allocation
- Low weeks = Consider training or maintenance
- Seasonal patterns = Plan accordingly

### Scenario 3: SLA Compliance Tracking

**Problem**: You need to ensure SLA targets are consistently met.

**Solution**:
1. Extract data for the last 90 days
2. Calculate KPIs
3. Add a chart and select "SLA Trend"
4. View line chart showing weekly compliance rates

**What to look for**:
- Consistently high = Good performance
- Dropping trends = Investigate root cause
- Below target weeks = Review affected tickets

## Customization

### Changing Time Intervals

Currently, plugins default to **weekly** grouping. To change intervals:

Edit `src/lib/kpi/time-series-plugin.ts`:

```typescript
// In the plugin's calculate function, change the interval:
calculate(context) {
  return calculateProcessingTimeTrend(context, 'monthly'); // or 'daily'
}
```

### Creating Custom Time-Series Plugins

To create your own time-series plugin:

```typescript
export const myCustomTrendPlugin: KpiPlugin = {
  id: 'my_custom_trend',
  name: 'My Custom Trend',
  description: 'Description of what it measures',
  category: 'custom',
  unit: 'my-unit',
  calculate(context) {
    // Group by time interval
    const grouped = groupByTimeInterval(
      context.issues,
      'weekly',  // or 'daily', 'monthly'
      (issue) => issue.created  // or issue.resolved
    );

    // Calculate your metric per period
    const timeSeries = Object.entries(grouped).map(([period, issues]) => ({
      period,
      date: issues[0].created,
      value: calculateYourMetric(issues),
      count: issues.length,
    }));

    return [{
      name: 'My Custom Trend',
      value: overallAverage,
      unit: 'my-unit',
      timeSeries,
    }];
  },
};
```

Then register it in the KpiEngine constructor.

## Technical Details

### Period Key Format

- **Daily**: `YYYY-MM-DD` (e.g., "2024-01-15")
- **Weekly**: `YYYY-WWW` (e.g., "2024-W03")
- **Monthly**: `YYYY-MM` (e.g., "2024-01")

### Week Number Calculation

Uses ISO 8601 week date system:
- Week 1 = First week with majority of days in the new year
- Weeks start on Monday
- Year can have 52 or 53 weeks

### Data Filtering

Time-series plugins use the same period filtering as regular KPIs:
- Issues created within the date range
- Issues resolved within the date range
- Issues active during the period

## Troubleshooting

### No time-series data showing?

**Check**:
1. Have you run KPI calculation after extracting data?
2. Do you have resolved issues in your date range?
3. Is the date range wide enough? (Need at least 2 weeks for weekly data)

### Chart shows only one point?

**Cause**: Date range too narrow for the time interval

**Solution**: Widen your date range (use Quick Pull: "Last 90 days")

### Wrong time interval showing?

**Cause**: Plugins currently default to weekly grouping

**Solution**: Edit the plugin source to change interval (see Customization section)

## Performance Considerations

- **Daily grouping**: Best for date ranges under 60 days
- **Weekly grouping**: Best for date ranges 60-365 days (default)
- **Monthly grouping**: Best for date ranges over 365 days

Very long date ranges with daily grouping may create too many data points for clear visualization.

## Future Enhancements

Potential improvements:
- [ ] Add UI selector for time interval (daily/weekly/monthly)
- [ ] Support for custom date ranges per chart
- [ ] Moving averages to smooth noisy data
- [ ] Seasonal decomposition (trend + seasonal + residual)
- [ ] Forecasting using historical trends
- [ ] Comparison overlays (e.g., this year vs last year)
