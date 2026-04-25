# Bug Fix: Time-Series Date Parsing Error

## Problem
Runtime error when displaying time-series trend KPIs:
```
TypeError: a.date.getTime is not a function
```

## Root Cause
When KPI results are returned from the API, JSON serialization converts Date objects to strings:
- **Server-side**: `{ date: new Date() }` → JSON → `"{ date: "2026-03-15T23:00:00.000Z" }"`
- **Client-side**: Receives date as **string**, not Date object
- **Error**: Code tried to call `.getTime()` on a string

## Solution
Fixed the issue at the source by converting date strings to Date objects when setting kpiResults:

### Before (Broken):
```typescript
const kpiData = await kpiRes.json();
if (kpiData.success) {
  setKpiResults(kpiData.results);  // ❌ date strings remain as strings
}
```

### After (Fixed):
```typescript
const kpiData = await kpiRes.json();
if (kpiData.success) {
  // Convert all date strings in timeSeries to Date objects
  const processedResults = Object.entries(kpiData.results).reduce((acc, [pluginId, pluginResults]) => {
    acc[pluginId] = pluginResults.map((result) => ({
      ...result,
      timeSeries: result.timeSeries?.map((ts) => ({
        ...ts,
        date: new Date(ts.date)  // ✅ Convert string to Date
      }))
    }));
    return acc;
  }, {});
  setKpiResults(processedResults);
}
```

## Files Modified
- `src/app/page.tsx` (lines 1718-1732)
  - Added date conversion when setting kpiResults from API
  - Simplified trendKpis sorting (no need for nested conversion)

## Impact
This fix ensures:
1. ✅ Time-series KPIs display correctly in the dashboard
2. ✅ Trend charts render without errors
3. ✅ Date sorting works properly for time-series data
4. ✅ All time-series plugins work:
   - Processing Time Trend
   - Throughput Trend
   - SLA Trend
   - Turnaround Time by Status Trend
   - **SLA Compliance by Status Trend**

## Testing
To verify the fix:
1. Go to Plugins tab and activate a trend plugin
2. Go to KPI Dashboard tab
3. Click "Calculate All KPIs"
4. Scroll to "Time-Series Trends" section
5. Verify cards display without errors
6. Add a line chart for a trend plugin
7. Verify chart renders correctly

## Technical Details
- **Issue**: JSON serialization of Date objects
- **Pattern**: Convert serialized dates at API response boundary
- **Location**: Data hydration layer in frontend
- **Type Safety**: TypeScript interfaces show `date: Date` but runtime has string

## Related Code
- API Route: `src/app/api/kpi/calculate/route.ts`
- Chart Utils: `src/lib/chart-data-utils.ts` (transformForLineChart)
- Time-Series Plugin: `src/lib/kpi/time-series-plugin.ts`
