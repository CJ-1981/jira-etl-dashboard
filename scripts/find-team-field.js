#!/usr/bin/env node
/**
 * Script to find the correct Issue Owner Team field in your Jira instance
 * Usage: node scripts/find-team-field.js
 */

const fs = require('fs');
const path = require('path');

// Read existing settings
const dataDir = path.join(__dirname, '../data');

// Find most recent connection data
function findMostRecentConnection() {
  if (!fs.existsSync(dataDir)) {
    console.error('❌ Data directory not found. Please extract JIRA data first.');
    process.exit(1);
  }

  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('jira-extract-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('❌ No JIRA extraction files found. Please extract data first.');
    process.exit(1);
  }

  const mostRecent = files[0];
  console.log(`📂 Using most recent extraction: ${mostRecent}`);

  const filePath = path.join(dataDir, mostRecent);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return data.connectionInfo;
}

// Analyze field values from extracted issues
function analyzeFieldValues(issues, fieldName) {
  const values = new Set();

  issues.forEach(issue => {
    const value = issue.fields?.[fieldName];
    if (value) {
      values.add(value);
    }
  });

  return Array.from(values).sort();
}

// Main function
async function main() {
  console.log('🔍 Searching for Issue Owner Team field...\n');

  const connectionInfo = findMostRecentConnection();

  // Build API URL
  const baseUrl = connectionInfo.baseUrl.replace(/\/$/, '');
  const auth = Buffer.from(`${connectionInfo.email}:${connectionInfo.apiToken}`).toString('base64');

  console.log(`🌐 Connected to: ${baseUrl}\n`);

  // Step 1: Get all custom fields
  console.log('📋 Fetching all custom fields from JIRA...');
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/field`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fields: ${response.statusText}`);
    }

    const allFields = await response.json();

    // Filter for custom fields related to "team" or "owner"
    const candidateFields = allFields.filter(field => {
      if (!field.custom) return false;
      const name = field.name.toLowerCase();
      const id = field.id.toLowerCase();
      return name.includes('team') ||
             name.includes('owner') ||
             name.includes('ltic') ||
             name.includes('component lead') ||
             id.includes('customfield');
    });

    console.log(`\n✅ Found ${candidateFields.length} candidate custom fields\n`);

    // Step 2: Test each candidate field
    console.log('🧪 Testing each candidate field...\n');
    console.log('━'.repeat(80));

    const results = [];

    for (const field of candidateFields) {
      const fieldId = field.id;
      const fieldName = field.name;

      // Fetch a few issues with this field
      const jql = `project in (${connectionInfo.projectKeys.join(',')})`;
      const searchResponse = await fetch(`${baseUrl}/rest/api/3/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          jql: jql,
          maxResults: 10,
          fields: [fieldId, 'summary', 'key']
        })
      });

      if (!searchResponse.ok) {
        console.log(`❌ ${fieldId} (${fieldName}): Failed to test`);
        continue;
      }

      const searchData = await searchResponse.json();
      const values = analyzeFieldValues(searchData.issues, fieldId);

      // Score the field based on value patterns
      let score = 0;
      let reason = [];

      // Check if values look like team names
      const hasTypicalTeamWords = values.some(v =>
        /(team|squad|group|unit|backend|frontend|fullstack|platform|data|infra|devops|qa|test|design|product)/i.test(v)
      );
      if (hasTypicalTeamWords) {
        score += 3;
        reason.push('Contains typical team keywords');
      }

      // Check if values look like feature names (bad)
      const hasFeaturePatterns = values.some(v =>
        /(view|camera|pedal|notification|antenna|sales|carplay|app|bncm|uwb|360|°|degree)/i.test(v)
      );
      if (hasFeaturePatterns) {
        score -= 2;
        reason.push('⚠️  Contains feature-like words (might be wrong field)');
      }

      // Check if values are reasonable length (team names are usually 2-5 words)
      const reasonableLength = values.every(v => v.split(' ').length <= 5);
      if (reasonableLength) {
        score += 1;
        reason.push('Reasonable length');
      }

      // Check if field name contains "team" or "owner"
      if (/team|owner|ltic/i.test(fieldName)) {
        score += 2;
        reason.push('Field name suggests team/owner field');
      }

      // Penalize if no values
      if (values.length === 0) {
        score -= 5;
        reason.push('⚠️  No values found');
      }

      // Bonus if has reasonable number of unique values (5-50)
      if (values.length >= 5 && values.length <= 50) {
        score += 1;
        reason.push('Good variety of values');
      }

      results.push({
        fieldId,
        fieldName,
        score,
        reason: reason.join(', '),
        valueCount: values.length,
        sampleValues: values.slice(0, 5)
      });
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Display results
    console.log('\n📊 RESULTS (sorted by relevance):\n');
    console.log('━'.repeat(80));

    results.forEach((result, index) => {
      const scoreEmoji = result.score >= 5 ? '🎯' : result.score >= 0 ? '📝' : '⚠️';
      console.log(`\n${scoreEmoji} #${index + 1}: ${result.fieldId} (${result.fieldName})`);
      console.log(`   Score: ${result.score > 0 ? '+' : ''}${result.score}`);
      console.log(`   Reason: ${result.reason}`);
      console.log(`   Unique values: ${result.valueCount}`);

      if (result.sampleValues.length > 0) {
        console.log(`   Sample values:`);
        result.sampleValues.forEach(v => {
          console.log(`     - ${v}`);
        });
        if (result.valueCount > 5) {
          console.log(`     ... and ${result.valueCount - 5} more`);
        }
      }
    });

    console.log('\n' + '━'.repeat(80));

    // Recommend best field
    const best = results[0];
    if (best && best.score >= 3) {
      console.log(`\n✅ RECOMMENDED FIELD: ${best.fieldId} (${best.fieldName})`);
      console.log(`\nTo use this field, update the following files:`);
      console.log(`  1. src/lib/jira/client.ts - Replace customfield_10100 with ${best.fieldId}`);
      console.log(`  2. src/components/dashboard/KpiDashboard.tsx - Replace customfield_10100 with ${best.fieldId}`);
    } else if (best) {
      console.log(`\n⚠️  No clear match found. Best candidate: ${best.fieldId} (${best.fieldName})`);
      console.log(`   Score: ${best.score} - might not be the correct field`);
      console.log(`\nRecommendation: Contact your JIRA administrator to confirm the correct field.`);
    } else {
      console.log('\n❌ No suitable fields found. Possible reasons:');
      console.log('   - Issue Owner Team field might not be a custom field');
      console.log('   - Field might be named differently than expected');
      console.log('   - No issues have this field populated');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
