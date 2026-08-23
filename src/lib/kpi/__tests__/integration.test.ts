/**
 * Integration Tests
 * End-to-end testing of the plugin registry infrastructure
 *
 * @MX:NOTE: Former validator/cache/dependency-resolver scenarios were removed
 * together with those modules (never wired into the engine). What remains
 * covers the production PluginRegistry plus plugin execution against a mock
 * KpiContext.
 */

import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../plugin-registry';
import {
  constPlugin,
  countPlugin,
  multiValuePlugin,
  createMockContext,
} from './mocks';
import { KpiCategory, KpiDomain } from '../types';

describe('Plugin Infrastructure Integration', () => {
  describe('Plugin Execution', () => {
    it('should execute plugins with context', () => {
      const context = createMockContext(5);

      const result = countPlugin.calculate(context);
      if (!Array.isArray(result)) {
        expect(result.value).toBe(5);
        expect(result.ticketKeys).toHaveLength(5);
      }
    });

    it('should handle plugins returning multiple results', () => {
      const context = createMockContext(10);

      const results = multiValuePlugin.calculate(context);
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results)) {
        expect(results).toHaveLength(2);
        expect(results[0].name).toBe('Resolved');
        expect(results[1].name).toBe('Unresolved');
      }
    });
  });

  describe('Filtering and Querying', () => {
    it('should filter plugins by category', () => {
      const registry = new PluginRegistry();

      registry.register(constPlugin); // builtin
      registry.register(countPlugin); // builtin

      const customPlugin = {
        id: 'custom-1',
        name: 'Custom',
        category: 'custom' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
    unit: 'count',
        calculate: () => ({ name: 'Custom', value: 1, unit: 'count' }),
      };

      registry.register(customPlugin);

      const builtin = registry.list('builtin' as KpiCategory);
      const custom = registry.list('custom' as KpiCategory);

      expect(builtin).toHaveLength(2);
      expect(custom).toHaveLength(1);
    });

    it('should filter plugins by domain', () => {
      const registry = new PluginRegistry();

      registry.register(countPlugin); // throughput
      registry.register(constPlugin); // custom

      const throughput = registry.listByDomain('throughput' as KpiDomain);
      const custom = registry.listByDomain('custom' as KpiDomain);

      expect(throughput).toHaveLength(1);
      expect(custom).toHaveLength(1);
    });
  });
});
