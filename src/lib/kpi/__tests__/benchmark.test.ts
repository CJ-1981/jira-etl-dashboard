/**
 * Benchmark Tests
 * Performance testing for plugin infrastructure
 *
 * @MX:NOTE: Only the PluginRegistry is production code. The former validator,
 * cache, and dependency-resolver benchmarks were removed together with those
 * modules (never wired into the engine).
 */

import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../plugin-registry';
import { createMockPlugin } from './mocks';
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
});
