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
 * Plugin with dependencies
 */
export const dependentPlugin: KpiPlugin = {
  id: 'dependent-metric',
  name: 'Dependent Metric',
  category: 'builtin' as KpiCategory,
  domain: 'custom' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  dependencies: ['issue-count'],
  calculate: (context: KpiContext): KpiResult => ({
    name: 'Double Count',
    value: context.issues.length * 2,
    unit: 'count',
    ticketKeys: context.issues.map((i) => i.key),
  }),
  metadata: {
    description: 'Depends on issue-count plugin',
    tags: ['test', 'mock', 'dependent'],
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
 * Plugin that uses context dimensions
 */
export const dimensionPlugin: KpiPlugin = {
  id: 'dimension-metric',
  name: 'Dimension Metric',
  category: 'custom' as KpiCategory,
  domain: 'custom' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  calculate: (context: KpiContext): KpiResult => ({
    name: 'Count by Dimension',
    value: context.issues.length,
    unit: 'count',
    dimensions: context.dimensions,
    ticketKeys: context.issues.map((i) => i.key),
  }),
  metadata: {
    description: 'Uses context dimensions',
    tags: ['test', 'mock', 'dimension'],
  },
};

/**
 * Plugin with details breakdown
 */
export const detailsPlugin: KpiPlugin = {
  id: 'details-metric',
  name: 'Details Metric',
  category: 'builtin' as KpiCategory,
  domain: 'throughput' as KpiDomain,
  version: '1.0.0',
  unit: 'count',
  calculate: (context: KpiContext): KpiResult => {
    const byPriority = context.issues.reduce((acc, issue) => {
      const priority = issue.priority || 'Unknown';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      name: 'Issues by Priority',
      value: context.issues.length,
      unit: 'count',
      details: Object.entries(byPriority).map(([label, value]) => ({
        label,
        value,
        unit: 'count',
      })),
      ticketKeys: context.issues.map((i) => i.key),
    };
  },
  metadata: {
    description: 'Breaks down results by priority',
    tags: ['test', 'mock', 'details'],
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
 * Create a set of interdependent plugins for testing dependency resolution
 */
export function createDependentPluginSet(): KpiPlugin[] {
  return [
    {
      id: 'plugin-a',
      name: 'Plugin A',
      category: 'builtin' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
      unit: 'count',
      calculate: () => ({ name: 'A', value: 1, unit: 'count' }),
    },
    {
      id: 'plugin-b',
      name: 'Plugin B',
      category: 'builtin' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
      unit: 'count',
      dependencies: ['plugin-a'],
      calculate: () => ({ name: 'B', value: 2, unit: 'count' }),
    },
    {
      id: 'plugin-c',
      name: 'Plugin C',
      category: 'builtin' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
      unit: 'count',
      dependencies: ['plugin-a', 'plugin-b'],
      calculate: () => ({ name: 'C', value: 3, unit: 'count' }),
    },
  ];
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
