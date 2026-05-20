/**
 * Debug script to check age breakdown detection
 */

// Test data mimicking what the plugin returns
const testData = {
  pluginId: 'open_tickets_by_priority',
  results: [
    {
      name: 'Priority: High (Existing)',
      value: 5,
      unit: 'tickets',
      dimensions: { priority: 'High', ageCategory: 'existing' },
      details: [{ label: 'Priority', value: 0, unit: 'High' }, { label: 'Age', value: 0, unit: '2+ weeks old' }]
    },
    {
      name: 'Priority: High (Last Week)',
      value: 3,
      unit: 'tickets',
      dimensions: { priority: 'High', ageCategory: 'last_week' },
      details: [{ label: 'Priority', value: 0, unit: 'High' }, { label: 'Age', value: 0, unit: '1 week old' }]
    },
    {
      name: 'Priority: High (This Week)',
      value: 2,
      unit: 'tickets',
      dimensions: { priority: 'High', ageCategory: 'this_week' },
      details: [{ label: 'Priority', value: 0, unit: 'High' }, { label: 'Age', value: 0, unit: 'This week' }]
    }
  ]
};

console.log('=== AGE BREAKDOWN DEBUG ===');
console.log('Plugin ID:', testData.pluginId);
console.log('Number of results:', testData.results.length);
console.log('Results:', JSON.stringify(testData.results, null, 2));

// Check if age breakdown detection would work
const hasAgeBreakdown = testData.results.some(r =>
  r.dimensions?.ageCategory ||
  r.name.includes('(Existing)') ||
  r.name.includes('(Last Week)') ||
  r.name.includes('(This Week)')
);

console.log('Has age breakdown:', hasAgeBreakdown);

// Check if legend condition would work
const kpiId = 'open_tickets_by_priority';
const showLegends = kpiId?.includes('open_tickets_by_priority') ||
                   kpiId?.includes('priority') ||
                   kpiId?.includes('assignee');

console.log('Show legends:', showLegends);
console.log('Legend condition check:');
console.log('  - includes open_tickets_by_priority:', kpiId?.includes('open_tickets_by_priority'));
console.log('  - includes priority:', kpiId?.includes('priority'));
console.log('  - includes assignee:', kpiId?.includes('assignee'));
