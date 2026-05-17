/**
 * Diagnostic script to check Issue Owner Team field configuration
 * Run this in your browser console when the app is running
 */

console.log('=== Issue Owner Team Field Diagnostics ===\n');

// 1. Check environment variable
console.log('1. Environment Variable:');
console.log('   REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD:', process.env.REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD || 'Not set (using default: customfield_10132)');

// 2. Check field config
console.log('\n2. Field Configuration:');
try {
  const { getFieldConfig, getIssueOwnerTeamField } = require('@/lib/jira/field-config');
  const config = getFieldConfig();
  console.log('   Configured field:', config.issueOwnerTeamField);
  console.log('   getIssueOwnerTeamField():', getIssueOwnerTeamField());
} catch (e) {
  console.log('   Error loading field config:', e.message);
}

// 3. Check masterDataset (if available)
console.log('\n3. Master Dataset Check:');
if (typeof window !== 'undefined' && window.__MASTER_DATASET__) {
  const issues = window.__MASTER_DATASET__.issues || [];
  console.log('   Total issues:', issues.length);

  if (issues.length > 0) {
    const sampleIssue = issues[0];
    console.log('   Sample issue fields:', Object.keys(sampleIssue.fields || {}).join(', '));

    // Check if customfield_10132 exists
    const hasField = 'customfield_10132' in (sampleIssue.fields || {});
    console.log('   Has customfield_10132:', hasField);

    if (hasField) {
      console.log('   Field value:', sampleIssue.fields.customfield_10132);
    } else {
      console.log('   WARNING: customfield_10132 NOT FOUND in issue fields!');
      console.log('   Available custom fields:');
      Object.keys(sampleIssue.fields || {})
        .filter(key => key.startsWith('customfield_'))
        .forEach(field => console.log('     -', field));
    }
  }
} else {
  console.log('   Master dataset not available in window');
}

// 4. Check KPI calculation results
console.log('\n4. KPI Results Check:');
// Look for the issue-owner-team plugin results in calculated KPIs
// (This would be available after calculation runs)

console.log('\n=== End Diagnostics ===');
