# SLA Compliance by Status Trend Plugin - Implementation Guide

## Overview

The SLA Compliance by Status trend plugin has been successfully implemented and integrated into the KPI system.

## What Was Implemented

### 1. New Plugin: SLA Compliance by Status Trend
- **Plugin ID**: `sla_by_status_trend`
- **Name**: "SLA Compliance by Status Trend"
- **Category**: sla
- **Unit**: %
- **Type**: Time-series (weekly grouping)

### 2. Plugin Selection Feature
- Added checkboxes next to each plugin in the Plugins panel
- "Select All" / "Deselect All" buttons
- Active plugin count badge
- Persistent storage via localStorage

### 3. Time-Series KPI Display Section
- Added dedicated "Time-Series Trends" section in KPI Dashboard
- Shows all trend plugins with visual indicators
- Displays data point count and latest values

## How to Use

### Step 1: Enable the Plugin
1. Go to the **Plugins** tab
2. Find "SLA Compliance by Status Trend" in the list (under SLA category)
3. Check the checkbox to activate it
4. The plugin selection is saved automatically

### Step 2: Configure SLA Targets (Optional)
1. Go to the **Settings** tab
2. Find "SLA Targets by Status" section
3. Click "Detect Statuses" to auto-populate from your data
4. Set target hours for each status (e.g., "Done": 24, "In Progress": 8)
5. Save settings

### Step 3: Calculate KPIs
1. Go to the **KPI Dashboard** tab
2. Ensure you have data in the master dataset
3. Select date period if needed
4. Click "Calculate All KPIs"

### Step 4: Visualize the Trend
1. Scroll to **Time-Series Trends** section
2. Find "SLA Compliance by Status Trend" cards (one per status)
3. To create a line chart:
   - Scroll to **Visualizations** section
   - Click "Add Chart"
   - In the KPI dropdown, look for "📈 SLA Compliance by Status Trend"
   - Select "Line" as chart type
   - The chart will show multiple lines (one per status)

## Features

### Time-Series Data Structure
The plugin returns multiple time-series results (one per status):
```typescript
{
  name: "SLA Compliance - Done",
  value: 85.5,
  unit: "%",
  dimensions: { status: "Done" },
  timeSeries: [
    { period: "2026-W12", date: ..., value: 82.3, count: 15 },
    { period: "2026-W13", date: ..., value: 85.5, count: 18 },
    ...
  ]
}
```

### SLA Target Handling
- Uses per-status targets from `settings.sla.statusTargets`
- Falls back to default SLA (40 hours) if no status-specific target
- Assignee comments reset the SLA clock (extends deadline)

### Incomplete Period Filtering
- Current partial week/month is excluded from calculations
- Prevents misleading spikes from incomplete data
- Shows "⚠️ Current period excluded" indicator when applicable

## Chart Visualization

### Recommended Chart Types
- **Line Chart**: Best for trend visualization (default)
- **Multi-Line**: Each status becomes a separate line
- **Bar Chart**: Shows weekly compliance rates side-by-side

### Data Point Display
- X-axis: Time periods (weeks, e.g., "2026-W12", "2026-W13")
- Y-axis: SLA compliance percentage
- Multiple lines: One colored line per status
- Tooltips: Show exact percentage and ticket count

## Troubleshooting

### Plugin Not Showing in Dropdown
1. Check that the plugin is activated in Plugins tab
2. Verify KPIs have been calculated after activation
3. Refresh the page and try again

### No Data Showing
1. Ensure you have extracted data with comment fields
2. Check that tickets have status transitions
3. Verify SLA targets are configured in Settings
4. Look for console warnings about missing data

### Chart Not Rendering
1. Verify the plugin has time-series data (check card for "Data points: N")
2. Try selecting a different chart type (Bar vs Line)
3. Check browser console for errors

## Technical Details

### Plugin Location
- File: `src/lib/kpi/time-series-plugin.ts`
- Function: `calculateSlaByStatusTrend()`
- Registered in: `registerTimeSeriesPlugins()`

### API Integration
- Route: `src/app/api/kpi/calculate/route.ts`
- Parameter: `activePluginIds: string[]`
- Returns: Time-series results with multiple series

### Storage
- Active plugins: `localStorage['cfg_active_plugins']`
- SLA targets: `localStorage['cfg_app_settings'].sla.statusTargets`

## Related Plugins

Other time-series trend plugins available:
- **Processing Time Trend**: Average resolution time over time
- **Throughput Trend**: Tickets resolved per time period
- **SLA Trend**: Overall SLA compliance over time
- **Turnaround Time by Status Trend**: Time in each status over time

All these plugins are displayed in the "Time-Series Trends" section and support line chart visualization.
