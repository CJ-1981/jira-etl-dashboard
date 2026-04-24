# Time-Series Calculation Fixes

## Issue: Last Week Value Spikes

### Problem Description

Users reported that line charts with time-series data showed abnormal spikes in the last week's values, making the data misleading and difficult to interpret.

### Root Causes Identified

#### 1. **Incomplete Current Period** ⚠️ CRITICAL
- **Issue**: The last week/month included partial data (e.g., today is Wednesday, so the week only has 3 days)
- **Impact**: 
  - Processing time: Only includes issues resolved in those 3 days, causing skewed averages
  - Example: Week with 2 slow tickets (100h each) shows 100h average instead of including the rest of the week's data
  - Throughput: Only counts issues in partial week, showing artificially low/high values
  - SLA: Only includes partial week's resolutions, skewing compliance rate

#### 2. **Incorrect Period Date Representation**
- **Issue**: Used `issues[0].resolved` (first issue's resolution date) as the period date
- **Impact**: Charts showed misleading x-axis labels that didn't represent actual period boundaries

#### 3. **No Period Completeness Validation**
- **Issue**: No filtering to exclude incomplete periods from calculations
- **Impact**: Partial periods were included in averages and overall statistics, distorting the data

## Solutions Implemented

### Fix 1: Period Completeness Check

Added `isPeriodComplete()` function:

```typescript
function isPeriodComplete(periodEnd: Date, currentDate: Date = new Date()): boolean {
  const bufferDays = 1; // 1 day buffer to ensure period is fully complete
  const completeThreshold = new Date(periodEnd);
  completeThreshold.setDate(completeThreshold.getDate() + bufferDays);

  return currentDate > completeThreshold;
}
```

**Logic**: A period is only considered complete if:
- The current date is at least 1 day past the period's end date
- This ensures all issues for that period have been resolved and recorded

**Example**:
- Today: Wednesday, Jan 15, 2025
- Week 2 2025: Ends Sunday, Jan 12, 2025
- Complete threshold: Monday, Jan 13, 2025
- Result: Week 2 is ✅ complete, Week 3 is ❌ incomplete (still in progress)

### Fix 2: Correct Period End Dates

Added `getPeriodEnd()` function:

```typescript
function getPeriodEnd(periodKey: string, interval: TimeInterval): Date {
  // Returns the actual end date of the period
  switch (interval) {
    case 'weekly':
      return getWeekEndDate(year, week); // Sunday at 23:59:59
    case 'monthly':
      return new Date(year, month, 0); // Last day of month
    // ...
  }
}
```

**Benefits**:
- Charts now show accurate period boundaries
- X-axis labels represent actual week/month end dates
- Consistent with business reporting periods

### Fix 3: Filter Incomplete Periods

Updated all three calculation functions to filter incomplete periods:

```typescript
for (const [periodKey, issues] of Object.entries(grouped)) {
  const periodEnd = getPeriodEnd(periodKey, interval);
  const isComplete = isPeriodComplete(periodEnd);

  // Skip incomplete periods to avoid misleading spikes
  if (!isComplete) {
    hasIncompletePeriod = true;
    continue;
  }

  // Only process complete periods
  timeSeries.push({ ... });
}
```

**Result**: 
- Charts only show complete periods
- No spikes from partial data
- Accurate trend representation

### Fix 4: User Notification

Added warning in details when incomplete periods exist:

```typescript
if (hasIncompletePeriod) {
  details.push({ label: '⚠️ Current period excluded', value: 1, unit: 'incomplete' });
}
```

**User Experience**:
- Users see a clear indicator that current period data is excluded
- Details panel shows the warning with emoji for visibility
- Prevents confusion about missing current week data

## Impact & Benefits

### Before Fix
```
Week 1: 38.2h (7 days, 145 issues) ✅
Week 2: 41.8h (7 days, 167 issues) ✅
Week 3: 98.5h (3 days, 2 issues) ❌ SPIKE! (partial week)
```
**Problem**: Week 3 looks terrible due to incomplete data

### After Fix
```
Week 1: 38.2h (7 days, 145 issues) ✅
Week 2: 41.8h (7 days, 167 issues) ✅
[Current week excluded - incomplete]
```
**Result**: Clean trend line showing only complete periods

### Statistical Accuracy

**Overall Average Calculation**:
- **Before**: Included incomplete periods, skewing averages
- **After**: Only complete periods included in weighted average

```typescript
// After fix: Weighted average of complete periods only
const overallAvg = timeSeries.reduce((sum, point) => sum + point.value * point.count, 0) /
                    timeSeries.reduce((sum, point) => sum + point.count, 0);
```

### Data Quality Improvements

✅ **Accurate trends**: No more spikes from partial data
✅ **Reliable averages**: Based on complete periods only
✅ **Clear communication**: Users know when current period is excluded
✅ **Consistent reporting**: Aligns with business week/month boundaries
✅ **Better decisions**: Based on complete, accurate data

## Edge Cases Handled

### 1. First Day of Period
- **Scenario**: User calculates KPIs on Monday morning
- **Result**: Previous week is shown (complete), current week excluded (incomplete)

### 2. Very Recent Data
- **Scenario**: Date range ends today
- **Result**: Current period excluded automatically
- **User guidance**: Wait until period is complete for accurate data

### 3. Historical Data
- **Scenario**: All periods are in the past
- **Result**: All periods shown (all complete)

### 4. Small Date Ranges
- **Scenario**: Date range spans only 2 weeks
- **Result**: Shows 1-2 complete periods (may show fewer if current week incomplete)

## Technical Details

### Buffer Days

Added **1-day buffer** to period completeness check:

```typescript
const bufferDays = 1;
```

**Why**: 
- Ensures all late-arriving data is included
- Accounts for timezone differences
- Prevents edge cases where period ends at 23:59:59

### ISO Week Handling

For weekly grouping, weeks end on **Sunday at 23:59:59**:

```typescript
function getWeekEndDate(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7 + 4 - jan1.getDay();
  const endDate = new Date(year, 0, 1 + days);
  endDate.setDate(endDate.getDate() + (7 - endDate.getDay()) % 7);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}
```

### Performance Impact

- **Minimal**: Only adds one date comparison per period
- **Optimized**: Periods filtered before calculation, not after
- **Memory**: No additional storage required

## Testing & Verification

### Test Case 1: Partial Week Spike
**Before**: Week with 2 issues shows 100h average (spike)
**After**: Week excluded from chart, no spike

### Test Case 2: All Complete Periods
**Before**: Shows all periods including incomplete
**After**: Shows all periods (all complete), no change in behavior

### Test Case 3: Current Week Exclusion
**Before**: Current week shows partial data
**After**: Current week excluded, warning shown in details

### Test Case 4: User Warning
**Before**: No indication of incomplete periods
**After**: "⚠️ Current period excluded" shown in details panel

## Migration Notes

### No Breaking Changes
- API remains the same
- Return type unchanged
- Chart rendering unchanged
- Only data filtering logic improved

### Backward Compatibility
- Existing charts continue to work
- Time-series data structure unchanged
- Only data quality improved

## Future Enhancements

Potential improvements:
- [ ] Add option to include incomplete periods with warning indicator
- [ ] Show projected values for incomplete periods
- [ ] Allow users to adjust buffer days
- [ ] Add visual indicator (dashed line) for projected data
- [ ] Support custom completeness thresholds (e.g., 80% complete)

## Summary

The fixes eliminate misleading spikes in time-series charts by:
1. ✅ Filtering incomplete periods from calculations
2. ✅ Using accurate period end dates
3. ✅ Notifying users when current period is excluded
4. ✅ Providing accurate, reliable trend data

Users can now trust that the time-series charts show complete, accurate periods without distortion from partial data.
