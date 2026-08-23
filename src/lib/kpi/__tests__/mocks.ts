/**
 * Mock plugins for testing
 * Provides realistic plugin implementations for integration tests
 */

import { KpiPlugin, KpiContext, KpiResult, KpiCategory, KpiDomain } from '../types';

/**
 * Simple plugin that returns a constant value
 */
export const constPlugin: KpiPlugin = {
  id: 'const-value',
  name: 'Constant Value',
  category: 'builtin' as KpiCategory,
  domain: 'custom' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  calculate: (context: KpiContext): KpiResult => ({
    name: 'Constant',
    value: 42,
    unit: 'count',
    ticketKeys: context.issues.map((i) => i.key),
  }),
  metadata: {
    description: 'Always returns 42',
    author: 'Test Suite',
    tags: ['test', 'mock'],
  },
};

/**
 * Plugin that counts issues
 */
export const countPlugin: KpiPlugin = {
  id: 'issue-count',
  name: 'Issue Count',
  category: 'builtin' as KpiCategory,
  domain: 'throughput' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  calculate: (context: KpiContext): KpiResult => ({
    name: 'Total Issues',
    value: context.issues.length,
    unit: 'count',
    ticketKeys: context.issues.map((i) => i.key),
  }),
  metadata: {
    description: 'Counts total number of issues',
    tags: ['test', 'mock'],
  },
};

/**
 * Plugin that returns multiple results
 */
export const multiValuePlugin: KpiPlugin = {
  id: 'multi-value',
  name: 'Multi Value Metric',
  category: 'builtin' as KpiCategory,
  domain: 'quality' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  calculate: (context: KpiContext): KpiResult[] => {
    const resolved = context.issues.filter((i) => i.resolved !== null);
    const unresolved = context.issues.filter((i) => i.resolved === null);

    return [
      {
        name: 'Resolved',
        value: resolved.length,
        unit: 'count',
        ticketKeys: resolved.map((i) => i.key),
      },
      {
        name: 'Unresolved',
        value: unresolved.length,
        unit: 'count',
        ticketKeys: unresolved.map((i) => i.key),
      },
    ];
  },
  metadata: {
    description: 'Returns multiple metric values',
    tags: ['test', 'mock', 'multi-value'],
  },
};

/**
 * Create a mock plugin with custom configuration
 */
export function createMockPlugin(
  id: string,
  overrides?: Partial<KpiPlugin>
): KpiPlugin {
  return {
    id,
    name: `Mock Plugin ${id}`,
    category: 'builtin' as KpiCategory,
    domain: 'custom' as KpiDomain,
    version: '1.0.0',
    unit: 'count',
    calculate: () => ({ name: 'Mock', value: 0, unit: 'count' }),
    ...overrides,
  };
}

/**
 * Create mock issue data for testing
 */
export function createMockIssues(count: number, overrides?: Partial<any>) {
  return Array.from({ length: count }, (_, i) => ({
    key: `TEST-${i + 1}`,
    project: 'TEST',
    summary: `Test issue ${i + 1}`,
    issueType: 'Task',
    priority: ['High', 'Medium', 'Low'][i % 3],
    status: i % 2 === 0 ? 'Open' : 'Closed',
    statusCategory: i % 2 === 0 ? 'In Progress' : 'Done',
    assignee: i % 2 === 0 ? 'user@example.com' : 'Unassigned',
    reporter: 'test@example.com',
    issueOwnerTeam: i % 3 === 0 ? 'LTIC-Team-A' : i % 3 === 1 ? 'LTIC-Team-B' : null,
    created: new Date(`2024-01-${(i % 30) + 1}`),
    updated: new Date(`2024-01-${(i % 30) + 1}`),
    resolved: i % 2 === 0 ? null : new Date(`2024-01-${(i % 30) + 2}`),
    dueDate: null,
    storyPoints: null,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...overrides,
  }));
}

/**
 * Create mock KPI context for testing
 */
export function createMockContext(
  issueCount: number = 10,
  overrides?: Partial<KpiContext>
): KpiContext {
  return {
    issues: createMockIssues(issueCount),
    holidays: {
      dates: new Set(['2024-01-01', '2024-12-25']),
      regions: [],
      workStartHour: 9,
      workEndHour: 17,
      isHoliday: (_date: Date) => false,
      isWorkingDay: (_date: Date) => true,
    },
    period: {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
    },
    slaTargets: { High: 4, Medium: 8, Low: 24 },
    useAnyoneCommentsForSla: false,
    ...overrides,
  };
}
