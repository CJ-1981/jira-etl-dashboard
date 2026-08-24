# JIRA Field Configuration Guide

## Problem

You're seeing unexpected values in the "Issue Owner Team" filter (like "360 view", "Cameras", "Pedal", etc.) because the configured custom field ID (default `customfield_10132`, set in `src/lib/jira/field-config.ts`) may not be the correct field in your JIRA instance.

## Solution

We've made the Issue Owner Team field configurable. Here's how to fix it:

### Step 1: Find the Correct Field ID

Run the automated field finder script:

```bash
node scripts/find-team-field.js
```

This script will:
1. Connect to your JIRA instance using your existing credentials
2. Scan all custom fields for ones that might contain team information
3. Test each field and score it based on likelihood
4. Recommend the best field ID

### Step 2: Update the Field Configuration

Once you have the correct field ID, update **one** of these locations:

#### Option A: Environment Variable (Recommended)

Create or update `.env.local` (or `.env`):

```bash
JIRA_ISSUE_OWNER_TEAM_FIELD=customfield_10200
```

> Note: these variables are read server-side at request time. Use the plain
> `JIRA_*` names — the legacy `REACT_APP_*` prefix was a Create React App
> convention and is ignored by Next.js.

#### Option B: Update Field Config Directly

Edit `src/lib/jira/field-config.ts`:

```typescript
export const DEFAULT_FIELD_CONFIG: JiraFieldConfig = {
  storyPointsField: 'customfield_10002',
  issueOwnerTeamField: 'customfield_10200',  // Change this
  sprintField: 'customfield_10020',
  epicLinkField: 'customfield_10014',
};
```

### Step 3: Restart the Development Server

```bash
npm run dev
```

The Issue Owner Team filter should now show the correct team names.

## Manual Field ID Discovery

If the automated script doesn't work, you can find the field ID manually:

### Using JIRA API

```bash
# List all custom fields
curl -u YOUR_EMAIL:YOUR_API_TOKEN \
  "https://YOUR-DOMAIN.atlassian.net/rest/api/3/field" | \
  grep -A 1 "customfield" | \
  python3 -m json.tool
```

### Using a Browser

1. Open any issue in your JIRA project
2. Right-click the field you think is the Issue Owner Team field
3. Select "Inspect" or "Inspect Element"
4. Look for `data-field-id` or similar attribute
5. The ID will look like `customfield_10xxx`

### Test Candidate Fields

```bash
# Test a specific field
curl -u YOUR_EMAIL:YOUR_API_TOKEN \
  "https://YOUR-DOMAIN.atlassian.net/rest/api/3/search?jql=project=YOURKEY&fields=customfield_XXXXX&maxResults=5"
```

Replace `customfield_XXXXX` with your candidate field ID. Look at the values returned:
- ✅ **Good**: Team names like "Backend Team", "Frontend Team", "Platform Team"
- ❌ **Bad**: Feature names like "360 view", "Cameras", "Pedal", etc.

## Common Issues

### Issue: Field exists but returns null

**Cause**: The field might not be populated for all issues in your project.

**Solution**: This is normal. Issues without the field will show as "Unassigned".

### Issue: Field returns an object instead of a string

**Cause**: The field might be a complex type (cascading select, multi-select, etc.).

**Solution**: The current implementation expects simple string values. You may need to modify the code to handle complex field types.

### Issue: Script can't connect to JIRA

**Cause**: No recent JIRA extraction data found.

**Solution**: Run a JIRA extraction first from the dashboard UI to establish a connection.

## Validation

After updating the field ID, verify the fix:

1. Open the KPI Dashboard
2. Check the "Issue Owner Team" filter dropdown
3. You should see team names, not feature names
4. Select a team and verify the dashboard shows correct data

## Technical Details

### Files Modified

- `src/lib/jira/field-config.ts` - New field configuration module
- `src/components/dashboard/KpiDashboard.tsx` - Uses configurable field
- `scripts/find-team-field.js` - Automated field finder
- `jira-field-config.json` - Configuration reference

### Field Type Support

Currently supports:
- ✅ Text fields (single line)
- ✅ Select fields (single choice)
- ❌ Multi-select (requires code modification)
- ❌ Cascading select (requires code modification)

For complex field types, additional code changes are needed.

## Getting Help

If you still can't identify the correct field:

1. Contact your JIRA administrator
2. Ask them to identify which custom field contains "Issue Owner Team" or "LTIC" data
3. Get the field ID from them (format: `customfield_10xxx`)
4. Update the configuration as shown in Step 2

## Rolling Back

If you need to revert to the original field:

```bash
# Remove environment variable
# .env.local
# JIRA_ISSUE_OWNER_TEAM_FIELD=customfield_10200

# Or reset field-config.ts to:
issueOwnerTeamField: 'customfield_10132'
```

Then restart the development server.
