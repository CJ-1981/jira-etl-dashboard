# Issue Owner Team Field Configuration - Summary

## Problem Solved

Fixed the unexpected values in the "Issue Owner Team" filter dropdown (values like "360 view", "Cameras", "Pedal" instead of team names).

## Changes Made

### 1. Created Field Configuration System
**File**: `src/lib/jira/field-config.ts`
- Central configuration for all JIRA custom field IDs
- Support for environment variable overrides
- Easy to update field mappings

### 2. Updated KPI Dashboard
**File**: `src/components/dashboard/KpiDashboard.tsx`
- Now uses configurable field ID instead of hardcoded `customfield_10100`
- Dynamic field lookup from configuration

### 3. Created Field Finder Script
**File**: `scripts/find-team-field.js`
- Automated tool to find the correct Issue Owner Team field in your JIRA instance
- Tests and scores candidate fields
- Provides recommendation

### 4. Documentation & Reference
**Files**:
- `docs/JIRA_FIELD_CONFIGURATION.md` - Complete setup guide
- `jira-field-config.json` - Configuration reference
- `find-jira-fields.html` - Visual guide for manual field discovery

## Next Steps

### Step 1: Find the Correct Field ID
Run the automated script:
```bash
node scripts/find-team-field.js
```

### Step 2: Update Configuration
Choose **one** method:

**Method A: Environment Variable (Recommended)**
Create `.env.local`:
```bash
REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD=customfield_XXXXX
```

**Method B: Direct Configuration**
Edit `src/lib/jira/field-config.ts`:
```typescript
issueOwnerTeamField: 'customfield_XXXXX'
```

### Step 3: Restart & Test
```bash
npm run dev
```

Check the Issue Owner Team filter in the dashboard - it should now show correct team names.

## What to Expect

✅ **Correct values**:
- Backend Team
- Frontend Team
- Platform Team
- QA Team
- Data Team

❌ **Incorrect values** (indicates wrong field):
- 360 view
- Cameras
- Pedal
- App notifications
- Feature names

## Files Created

1. `src/lib/jira/field-config.ts` - Field configuration module
2. `scripts/find-team-field.js` - Field finder tool
3. `docs/JIRA_FIELD_CONFIGURATION.md` - Setup documentation
4. `jira-field-config.json` - Configuration reference
5. `find-jira-fields.html` - Visual discovery guide

## Files Modified

1. `src/components/dashboard/KpiDashboard.tsx` - Now uses configurable field

## Support

If the automated script doesn't find the correct field:
1. Check `docs/JIRA_FIELD_CONFIGURATION.md` for manual discovery steps
2. Contact your JIRA administrator for the correct field ID
3. Update configuration as shown in Step 2

## Testing

After updating the field ID:
1. Open KPI Dashboard
2. Check "Issue Owner Team" dropdown
3. Verify team names appear correctly
4. Select a team and verify dashboard accuracy
