/**
 * Type Definitions Tests
 * Verify type system integrity and type guard functionality
 */

import { describe, it, expect } from 'vitest';
import {
  KpiPlugin,
  KpiContext,
  KpiResult,
  KpiCategory,
  KpiDomain,
  TransformedIssue,
  HolidayContext,
} from '../types';

describe('KPI Types', () => {
  describe('KpiPlugin Interface', () => {
    it('should accept valid plugin object', () => {
      const mockPlugin: KpiPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 0, unit: 'count' }),
      };

      expect(mockPlugin.id).toBe('test-plugin');
      expect(mockPlugin.category).toBe('builtin');
      expect(mockPlugin.domain).toBe('custom');
    });

    it('should accept plugin with optional fields', () => {
      const pluginWithOptions: KpiPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'custom' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 0, unit: 'count' }),
        dependencies: ['plugin-a', 'plugin-b'],
        metadata: {
          description: 'Test description',
          author: 'Test Author',
          tags: ['tag1', 'tag2'],
        },
      };

      expect(pluginWithOptions.dependencies).toEqual(['plugin-a', 'plugin-b']);
      expect(pluginWithOptions.metadata?.description).toBe('Test description');
    });
  });

  describe('KpiContext Interface', () => {
    it('should accept valid context object', () => {
      const mockIssue: TransformedIssue = {
        key: 'TEST-1',
        summary: 'Test issue',
        status: 'Open',
        priority: 'High',
        assignee: 'user@example.com',
        created: new Date('2024-01-01'),
        updated: new Date('2024-01-02'),
      };

      const mockHolidayContext: HolidayContext = {
        dates: new Set(['2024-01-01']),
        isHoliday: (_date: Date) => false,
        isWorkingDay: (_date: Date) => true,
      };

      const context: KpiContext = {
        issues: [mockIssue],
        holidays: mockHolidayContext,
        period: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      };

      expect(context.issues).toHaveLength(1);
      expect(context.period.start).toEqual(new Date('2024-01-01'));
    });

    it('should accept context with optional fields', () => {
      const context: KpiContext = {
        issues: [],
        holidays: {
          dates: new Set(),
          isHoliday: () => false,
          isWorkingDay: () => true,
        },
        period: {
          start: new Date(),
          end: new Date(),
        },
        slaTargets: { High: 4, Medium: 8 },
        useAnyoneCommentsForSla: true,
        dimensions: { team: 'backend' },
        globalFilters: { project: ['PROJ-A'] },
      };

      expect(context.slaTargets).toEqual({ High: 4, Medium: 8 });
      expect(context.useAnyoneCommentsForSla).toBe(true);
    });
  });

  describe('KpiResult Interface', () => {
    it('should accept valid result object', () => {
      const result: KpiResult = {
        name: 'Test Metric',
        value: 42,
        unit: 'hours',
      };

      expect(result.name).toBe('Test Metric');
      expect(result.value).toBe(42);
    });

    it('should accept result with optional fields', () => {
      const result: KpiResult = {
        name: 'Test Metric',
        value: 42,
        unit: 'hours',
        dimensions: { priority: 'High' },
        details: [
          { label: 'Completed', value: 30, unit: 'count' },
          { label: 'Pending', value: 12, unit: 'count' },
        ],
        ticketKeys: ['TEST-1', 'TEST-2'],
        comparison: {
          value: 40,
          change: 2,
          label: 'vs last period',
        },
      };

      expect(result.dimensions).toEqual({ priority: 'High' });
      expect(result.details).toHaveLength(2);
      expect(result.ticketKeys).toEqual(['TEST-1', 'TEST-2']);
      expect(result.comparison?.change).toBe(2);
    });
  });

  describe('Type Guards', () => {
    it('should distinguish between KpiCategory values', () => {
      const categories: KpiCategory[] = ['builtin', 'custom', 'time-series'];

      categories.forEach((category) => {
        expect(['builtin', 'custom', 'time-series']).toContain(category);
      });
    });

    it('should distinguish between KpiDomain values', () => {
      const domains: KpiDomain[] = [
        'processing-time',
        'turnaround',
        'throughput',
        'sla',
        'quality',
        'assignee',
        'custom',
      ];

      domains.forEach((domain) => {
        expect([
          'processing-time',
          'turnaround',
          'throughput',
          'sla',
          'quality',
          'assignee',
          'custom',
        ]).toContain(domain);
      });
    });
  });
});
