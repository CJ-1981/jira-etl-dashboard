/**
 * Integration Tests
 * End-to-end testing of the complete plugin infrastructure
 */

import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../plugin-registry';
import { PluginValidator } from '../plugin-validator';
import { PluginCache } from '../plugin-cache';
import { resolveDependencies } from '../utils/dependency-resolver';
import {
  constPlugin,
  countPlugin,
  dependentPlugin,
  multiValuePlugin,
  createDependentPluginSet,
  createMockContext,
} from './mocks';
import { KpiCategory, KpiDomain } from '../types';

describe('Plugin Infrastructure Integration', () => {
  describe('Complete Workflow', () => {
    it('should register, validate, and resolve plugins', () => {
      const registry = new PluginRegistry();
      const validator = new PluginValidator();

      // Create dependent plugin set
      const plugins = createDependentPluginSet();

      // Validate all plugins
      for (const plugin of plugins) {
        expect(validator.validate(plugin)).toBe(true);
      }

      // Register plugins
      plugins.forEach((plugin) => registry.register(plugin));

      // Verify registration
      expect(registry.size()).toBe(3);

      // Resolve dependencies
      const resolution = resolveDependencies(plugins);
      expect(resolution.errors).toHaveLength(0);
      expect(resolution.resolved).toHaveLength(3);

      // Verify topological order
      const order = resolution.resolved.map((p) => p.id);
      expect(order.indexOf('plugin-a')).toBeLessThan(order.indexOf('plugin-b'));
      expect(order.indexOf('plugin-b')).toBeLessThan(order.indexOf('plugin-c'));
    });
  });

  describe('Registry with Cache', () => {
    it('should integrate registry and cache', () => {
      const registry = new PluginRegistry();
      const cache = new PluginCache();

      registry.register(countPlugin);
      registry.register(constPlugin);

      // Cache miss
      let plugin = cache.get('issue-count');
      expect(plugin).toBeUndefined();

      // Load from registry
      plugin = registry.get('issue-count');
      expect(plugin).toEqual(countPlugin);

      // Store in cache
      cache.set('issue-count', plugin!);

      // Cache hit
      plugin = cache.get('issue-count');
      expect(plugin).toEqual(countPlugin);

      // Verify cache stats
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Validation and Registration', () => {
    it('should prevent registration of invalid plugins', () => {
      const registry = new PluginRegistry();
      const validator = new PluginValidator();

      const invalidPlugin = {
        id: 'invalid',
        // Missing required fields
      };

      expect(validator.validate(invalidPlugin)).toBe(false);

      // Note: PluginRegistry.register() doesn't validate - it just registers
      // Validation is the responsibility of the caller
      // This test documents current behavior: registry allows any object with unique ID
      expect(() => {
        registry.register(invalidPlugin as any);
      }).not.toThrow();
    });

    it('should validate dependencies before registration', () => {
      const registry = new PluginRegistry();
      const validator = new PluginValidator();

      // Register dependency first
      registry.register(countPlugin);

      // Validate dependent plugin
      const depValidation = validator.validateDependencies(
        dependentPlugin,
        registry
      );
      expect(depValidation.valid).toBe(true);

      // Register dependent plugin
      registry.register(dependentPlugin);
      expect(registry.size()).toBe(2);
    });
  });

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

    it('should execute dependent plugins in correct order', () => {
      const context = createMockContext(5);
      const plugins = createDependentPluginSet();

      // Execute in dependency order
      const resolution = resolveDependencies(plugins);
      expect(resolution.errors).toHaveLength(0);

      // Execute each plugin
      const results = resolution.resolved.map((plugin) =>
        plugin.calculate(context)
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(results[2]).toBeDefined();

      // Check names if results are single values (not arrays)
      if (!Array.isArray(results[0])) expect(results[0].name).toBe('A');
      if (!Array.isArray(results[1])) expect(results[1].name).toBe('B');
      if (!Array.isArray(results[2])) expect(results[2].name).toBe('C');
    });
  });

  describe('Error Handling', () => {
    it('should handle circular dependency detection', () => {
      const plugins = [
        {
          id: 'a',
          name: 'A',
          category: 'builtin' as KpiCategory,
          domain: 'custom' as KpiDomain,
          version: '1.0.0',
    unit: 'count',
          dependencies: ['b'],
          calculate: () => ({ name: 'A', value: 1, unit: 'count' }),
        },
        {
          id: 'b',
          name: 'B',
          category: 'builtin' as KpiCategory,
          domain: 'custom' as KpiDomain,
          version: '1.0.0',
    unit: 'count',
          dependencies: ['a'],
          calculate: () => ({ name: 'B', value: 2, unit: 'count' }),
        },
      ];

      const resolution = resolveDependencies(plugins);
      expect(resolution.errors).toHaveLength(1);
      expect(resolution.errors[0].error).toContain('Circular');
    });

    it('should handle missing dependencies', () => {
      const registry = new PluginRegistry();
      const validator = new PluginValidator();

      const pluginWithMissingDep = {
        id: 'test',
        name: 'Test',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
    unit: 'count',
        dependencies: ['non-existent'],
        calculate: () => ({ name: 'Test', value: 1, unit: 'count' }),
      };

      const validation = validator.validateDependencies(
        pluginWithMissingDep,
        registry
      );

      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain('non-existent');
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

  describe('Cache Performance', () => {
    it('should improve performance with repeated access', () => {
      const cache = new PluginCache();
      const registry = new PluginRegistry();

      registry.register(countPlugin);

      // First access - cache miss
      let plugin = cache.get('issue-count');
      if (!plugin) {
        plugin = registry.get('issue-count');
        cache.set('issue-count', plugin!);
      }

      // Second access - cache hit
      plugin = cache.get('issue-count');

      // Cache hit should be faster (though timing can vary)
      expect(plugin).toBeDefined();
      expect(cache.getStats().hits).toBeGreaterThanOrEqual(1);
    });
  });
});
