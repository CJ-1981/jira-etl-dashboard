# Time-Series Plugin Enhancements

## Summary

Three major enhancements to the time-series KPI system:

1. ✅ **New Plugin**: "Turnaround Time by Status Trend"
2. ✅ **Visual Cues**: Distinctive indicators for time-series KPIs
3. ✅ **Dropdown Labels**: 📈 emoji prefix for trend plugins

---

## 1. New Plugin: Turnaround Time by Status Trend

### Overview
Tracks how long tickets spend in each workflow status over time, grouped by week.

**Plugin ID**: `time_in_status_trend`
**Name**: "Turnaround Time by Status Trend"
**Category**: Turnaround
**Unit**: Hours

### What It Measures

For each week, calculates the **average business hours** tickets spent in each status:
- "In Progress" → Time spent
- "In Review" → Time spent
- "Done" → Time spent
- And all other workflow statuses

### Data Structure

Returns **multiple time-series** (one per status):

```typescript
[
  {
    name: "Time in In Progress",
    value: 12.5,  // Overall average
    unit: "hours",
    dimensions: { status: "In Progress" },
    timeSeries: [
      { period: "2024-W01", value: 11.2, count: 45 },
      { period: "2024-W02", value: 12.8, count: 52 },
      { period: "2024-W03", value: 13.1, count: 48 },
      // ... more weeks
    ]
  },
  {
    name: "Time in Code Review",
    value: 8.3,
    unit: "hours",
    dimensions: { status: "Code Review" },
    timeSeries: [/* ... */]
  },
  // ... more statuses
]
```

### Use Cases

**Identify Bottlenecks**:
- Status with increasing times = Process getting slower
- Compare week-over-week trends per status

**Process Optimization**:
- Which statuses take the longest?
- Are certain statuses improving over time?

**Resource Planning**:
- Predict future workload based on status trends
- Allocate resources where bottlenecks form

### Example Visualization

**Line Chart** showing multiple series (one per status):
- X-axis: Weeks (2024-W01, 2024-W02, ...)
- Y-axis: Average hours
- Multiple lines: One color per status

### Details Panel

Shows for each status:
- **Periods Analyzed**: Number of weeks with data
- **Total Transitions**: Total status changes
- **Min/Max Avg Time**: Best and worst periods

---

## 2. Visual Cues for Time-Series KPIs

### Chart Card Badges

When a time-series KPI is selected, the chart card shows:

**Header Badge**:
- 📈 **"Trend"** badge in blue
- Icon color changes from emerald to blue
- Background changes from green to blue tint

**Before** (Regular KPI):
```
┌─────────────────────────────────────┐
│ [🟊] Chart Visualization         │
│ Icon color: Emerald green           │
└─────────────────────────────────────┘
```

**After** (Time-series KPI):
```
┌─────────────────────────────────────┐
│ [🔵] Chart Visualization [📈 Trend]│
│ Icon color: Blue                    │
└─────────────────────────────────────┘
```

### Color Coding

| Element | Regular KPI | Time-Series KPI |
|---------|-------------|-----------------|
| Icon Background | Emerald tint | Blue tint |
| Icon Color | Emerald | Blue |
| Badge | None | 📈 Trend (blue) |
| Border | Default | Blue accent |

---

## 3. Distinctive Dropdown Labels

### KPI Metric Dropdown

Time-series plugins now have a **📈 emoji prefix** in the dropdown:

**Example Dropdown Options**:
```
┌─────────────────────────────────────┐
│ Select KPI...                      │
├─────────────────────────────────────┤
│ Avg. Processing Hours              │
│ Median Processing Hours            │
│ 📈 Processing Time Trend          │ ← Time-series
│ 📈 Throughput Trend               │ ← Time-series
│ 📈 SLA Trend                      │ ← Time-series
│ 📈 Turnaround Time by Status Trend│ ← Time-series
│ Time in Status                    │
│ SLA Compliance Rate               │
└─────────────────────────────────────┘
```

### Benefits

✅ **Quick Identification**: instantly recognize trend plugins
✅ **Visual Separation**: Regular vs. trend KPIs clearly distinct
✅ **User-Friendly**: Emoji is universally understood
✅ **Consistent**: Same pattern across all trend plugins

---

## Implementation Details

### Files Modified

1. **`src/lib/kpi/time-series-plugin.ts`**
   - Added `timeInStatusTrendPlugin`
   - Implemented `calculateTimeInStatusTrend()` function
   - Registered new plugin in `registerTimeSeriesPlugins()`

2. **`src/lib/chart-data-utils.ts`**
   - Added `isTimeSeriesPlugin()` helper function
   - Updated `getKpiOptions()` to include `isTrend` flag
   - Added emoji prefix to trend plugin labels

3. **`src/app/page.tsx`**
   - Updated `ChartCard` component with visual cues
   - Added trend badge in card header
   - Dynamic icon/background colors for time-series

### Plugin Registration

All time-series plugins are auto-registered:

```typescript
export function registerTimeSeriesPlugins(engine) {
  engine.register(processingTimeTrendPlugin);
  engine.register(throughputTrendPlugin);
  engine.register(slaTrendPlugin);
  engine.register(timeInStatusTrendPlugin); // ← NEW
}
```

---

## Usage Guide

### Step 1: Calculate KPIs

1. Navigate to **KPI Dashboard** tab
2. Ensure you have extracted data (last 30-90 days recommended for trend analysis)
3. Click **"Calculate All KPIs"**

### Step 2: Add Status Trend Chart

1. Scroll to **"Visualizations"** section
2. In a chart card, click the **KPI dropdown**
3. Select **"📈 Turnaround Time by Status Trend"**
4. Chart automatically renders as line chart (recommended)

### Step 3: Analyze Trends

**Multiple Lines Chart**:
- Each line = One status
- X-axis = Weeks
- Y-axis = Average hours in status

**What to Look For**:
- **Upward trends** = Status becoming bottleneck
- **Downward trends** = Process improving
- **Seasonal patterns** = Recurring delays
- **Status comparisons** = Which statuses take longest?

### Step 4: Compare Multiple Trends

Add multiple charts to compare:
- Processing Time Trend (overall)
- Turnaround Time by Status Trend (breakdown by status)
- Throughput Trend (velocity)

---

## Technical Details

### Time-Series Detection

```typescript
export function isTimeSeriesPlugin(pluginId: string): boolean {
  return pluginId.includes('_trend');
}
```

All time-series plugins have `_trend` suffix in their ID.

### Plugin Naming Convention

**Regular KPIs**:
- `time_in_status`
- `sla_compliance`
- `avg_processing_hours`

**Time-Series KPIs**:
- `time_in_status_trend`
- `sla_trend`
- `processing_time_trend`

### Data Filtering

Like other time-series plugins, incomplete periods are automatically excluded:
- Current week/month filtered out
- Only complete periods shown
- Details panel shows "⚠️ Current period excluded" warning

### Performance Considerations

**Multiple Status Series**:
- Can generate 5-10+ time series (one per status)
- Each series has one data point per week
- 90 days = ~12 weeks × 10 statuses = 120 data points
- Performance: ✅ Excellent (Recharts handles 1000+ points easily)

**Optimization**:
- Filter to top 5 statuses if too many
- Consider date range (weekly vs. daily)

---

## Future Enhancements

Potential improvements:

### Status Filtering
- [ ] Allow users to select which statuses to display
- [ ] "Top 5 statuses by time" option
- [ ] Toggle to show/hide specific statuses

### Comparison Features
- [ ] Compare status trends across projects
- [ ] Overlay team-specific status trends
- [ ] Status trend heatmaps

### Advanced Analytics
- [ ] Correlate status times with throughput
- [ ] Predict future bottlenecks based on trends
- [ ] Alert when status time exceeds threshold

### Customization
- [ ] User-defined status groupings
- [ ] Custom time intervals (bi-weekly, quarterly)
- [ ] Smoothing options (moving averages)

---

## Troubleshooting

### Chart Shows Only One Line

**Cause**: Only one status has data in the date range

**Solution**:
- Widen date range (more weeks)
- Extract more data
- Check if tickets transition through multiple statuses

### Too Many Lines (Cluttered)

**Cause**: Jira has many workflow statuses

**Solution**:
- Focus on key statuses (In Progress, In Review, Done)
- Extract longer date range for better overview
- Consider filtering less important statuses

### No Data Showing

**Cause**: No resolved tickets or no status transitions

**Solution**:
- Ensure tickets have been resolved in the date range
- Check that tickets have status transitions (changelog data)
- Try a wider date range

---

## Summary

✅ **New Plugin**: Track status times over time
✅ **Visual Cues**: Blue badge and icon for trend KPIs  
✅ **Dropdown Labels**: 📈 emoji for easy identification
✅ **Complete**: All features working and tested

The time-series system now provides comprehensive trend analysis with clear visual indicators! 🚀
