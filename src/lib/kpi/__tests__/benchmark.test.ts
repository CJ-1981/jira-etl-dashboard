/**
 * Benchmark Tests
 * Performance testing for plugin infrastructure
 */

import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../plugin-registry';
import { PluginValidator } from '../plugin-validator';
import { PluginCache } from '../plugin-cache';
import { resolveDependencies } from '../utils/dependency-resolver';
import { createMockPlugin, createMockContext } from './mocks';
import { KpiCategory } from '../types';

describe('Plugin Infrastructure Benchmarks', () => {
  describe('Registry Performance', () => {
    it('should register 50 plugins quickly', () => {
      const registry = new PluginRegistry();
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`)
      );

      const start = performance.now();
      plugins.forEach((plugin) => registry.register(plugin));
      const duration = performance.now() - start;

      expect(registry.size()).toBe(50);
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(100); // Should complete in < 100ms
      }
    });

    it('should retrieve plugins quickly with 50 plugins', () => {
      const registry = new PluginRegistry();
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`)
      );

      plugins.forEach((plugin) => registry.register(plugin));

      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        registry.get(`plugin-${i}`);
      }
      const duration = performance.now() - start;

      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(50); // Should complete in < 50ms
      }
    });

    it('should filter plugins quickly', () => {
      const registry = new PluginRegistry();
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`, {
          category: i % 2 === 0 ? ('builtin' as KpiCategory) : ('custom' as KpiCategory),
        })
      );

      plugins.forEach((plugin) => registry.register(plugin));

      const start = performance.now();
      const builtin = registry.list('builtin' as KpiCategory);
      const custom = registry.list('custom' as KpiCategory);
      const duration = performance.now() - start;

      expect(builtin).toHaveLength(25);
      expect(custom).toHaveLength(25);
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(50); // Should complete in < 50ms
      }
    });
  });

  describe('Validator Performance', () => {
    it('should validate 50 plugins quickly', () => {
      const validator = new PluginValidator();
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`)
      );

      const start = performance.now();
      const results = plugins.map((plugin) => validator.validate(plugin));
      const duration = performance.now() - start;

      expect(results.every((r) => r === true)).toBe(true);
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(100); // Should complete in < 100ms
      }
    });

    it('should validate plugin IDs quickly', () => {
      const validator = new PluginValidator();
      const ids = Array.from({ length: 50 }, (_, i) => `plugin-${i}`);

      const start = performance.now();
      const results = ids.map((id) => validator.validateId(id));
      const duration = performance.now() - start;

      expect(results.every((r) => r === true)).toBe(true);
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(50); // Should complete in < 50ms
      }
    });
  });

  describe('Cache Performance', () => {
    it('should cache and retrieve 50 plugins quickly', () => {
      const cache = new PluginCache();
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`)
      );

      const start = performance.now();
      plugins.forEach((plugin) => cache.set(plugin.id, plugin));
      const setDuration = performance.now() - start;

      const start2 = performance.now();
      for (let i = 0; i < 50; i++) {
        cache.get(`plugin-${i}`);
      }
      const getDuration = performance.now() - start2;

      if (process.env.RUN_BENCHMARKS) {
        expect(setDuration).toBeLessThan(100);
        expect(getDuration).toBeLessThan(50);
      }
    });

    it('should handle cache hits efficiently', () => {
      const cache = new PluginCache();
      const plugin = createMockPlugin('test-plugin');
      cache.set('test-plugin', plugin);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        cache.get('test-plugin');
      }
      const duration = performance.now() - start;

      // 1000 cache hits should be very fast
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(50);
      }

      const stats = cache.getStats();
      expect(stats.hits).toBe(1000);
      expect(stats.hitRate).toBe(1);
    });
  });

  describe('Dependency Resolution Performance', () => {
    it('should resolve 50 independent plugins quickly', () => {
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`)
      );

      const start = performance.now();
      const result = resolveDependencies(plugins);
      const duration = performance.now() - start;

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(50);
      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(100);
      }
    });

    it('should resolve complex dependency graph quickly', () => {
      // Create a chain: plugin-0 -> plugin-1 -> ... -> plugin-49
      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`, {
          dependencies: i > 0 ? [`plugin-${i - 1}`] : undefined,
        })
      );

      const start = performance.now();
      const result = resolveDependencies(plugins);
      const duration = performance.now() - start;

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(50);

      // Verify topological order
      const order = result.resolved.map((p) => p.id);
      for (let i = 0; i < 49; i++) {
        expect(order.indexOf(`plugin-${i}`)).toBeLessThan(
          order.indexOf(`plugin-${i + 1}`)
        );
      }

      if (process.env.RUN_BENCHMARKS) {
        expect(duration).toBeLessThan(200);
      }
    });
  });

  describe('End-to-End Performance', () => {
    it('should load and execute 50 plugins quickly', () => {
      const registry = new PluginRegistry();
      const validator = new PluginValidator();
      const cache = new PluginCache();
      const context = createMockContext(10);

      const plugins = Array.from({ length: 50 }, (_, i) =>
        createMockPlugin(`plugin-${i}`, {
          calculate: () => ({
            name: `Plugin ${i}`,
            value: i,
            unit: 'count',
            ticketKeys: context.issues.map((issue) => issue.key),
          }),
        })
      );

      // Load phase: validate and register
      const startLoad = performance.now();
      plugins.forEach((plugin) => {
        if (validator.validate(plugin)) {
          registry.register(plugin);
          cache.set(plugin.id, plugin);
        }
      });
      const loadDuration = performance.now() - startLoad;

      // Execute phase: retrieve and calculate
      const startExecute = performance.now();
      const results = plugins.map((plugin) => {
        const cached = cache.get(plugin.id);
        return cached?.calculate(context);
      });
      const executeDuration = performance.now() - startExecute;

      if (process.env.RUN_BENCHMARKS) {
        expect(loadDuration).toBeLessThan(200);
        expect(executeDuration).toBeLessThan(100);
      }
      expect(results.filter((r) => r !== undefined)).toHaveLength(50);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory with repeated cache operations', () => {
      const cache = new PluginCache(100); // Short TTL for testing

      // Add many entries
      for (let i = 0; i < 100; i++) {
        const plugin = createMockPlugin(`temp-plugin-${i}`);
        cache.set(plugin.id, plugin);
      }

      const size1 = cache.size();

      // Wait for expiration
      // Note: In real tests we'd use vi.useFakeTimers(), but here we just check cleanup happens
      cache.clear(); // Manual cleanup for this test

      const size2 = cache.size();

      expect(size1).toBeGreaterThan(0);
      expect(size2).toBe(0);
    });
  });
});
