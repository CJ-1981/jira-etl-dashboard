/**
 * Plugin Registry Tests
 * Verify plugin registration, retrieval, and filtering functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../plugin-registry';
import { KpiPlugin, KpiCategory, KpiDomain } from '../types';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;
  let mockPlugin1: KpiPlugin;
  let mockPlugin2: KpiPlugin;
  let mockPlugin3: KpiPlugin;

  beforeEach(() => {
    registry = new PluginRegistry();

    mockPlugin1 = {
      id: 'plugin-1',
      name: 'Plugin 1',
      category: 'builtin' as KpiCategory,
      domain: 'processing-time' as KpiDomain,
      version: '1.0.0',
    unit: 'count',
      calculate: () => ({ name: 'test', value: 0, unit: 'count' }),
    };

    mockPlugin2 = {
      id: 'plugin-2',
      name: 'Plugin 2',
      category: 'custom' as KpiCategory,
      domain: 'throughput' as KpiDomain,
      version: '1.0.0',
    unit: 'count',
      calculate: () => ({ name: 'test', value: 0, unit: 'count' }),
    };

    mockPlugin3 = {
      id: 'plugin-3',
      name: 'Plugin 3',
      category: 'builtin' as KpiCategory,
      domain: 'sla' as KpiDomain,
      version: '1.0.0',
    unit: 'count',
      calculate: () => ({ name: 'test', value: 0, unit: 'count' }),
    };
  });

  describe('register()', () => {
    it('should register a plugin successfully', () => {
      registry.register(mockPlugin1);
      expect(registry.size()).toBe(1);
      expect(registry.has('plugin-1')).toBe(true);
    });

    it('should throw error when registering duplicate ID', () => {
      registry.register(mockPlugin1);

      expect(() => {
        registry.register(mockPlugin1);
      }).toThrow("Plugin with id 'plugin-1' is already registered");
    });

    it('should register multiple plugins', () => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      registry.register(mockPlugin3);

      expect(registry.size()).toBe(3);
    });
  });

  describe('get()', () => {
    it('should return registered plugin', () => {
      registry.register(mockPlugin1);
      const plugin = registry.get('plugin-1');

      expect(plugin).toEqual(mockPlugin1);
    });

    it('should return undefined for non-existent plugin', () => {
      const plugin = registry.get('non-existent');
      expect(plugin).toBeUndefined();
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      registry.register(mockPlugin3);
    });

    it('should return all plugins when no filter provided', () => {
      const plugins = registry.list();
      expect(plugins).toHaveLength(3);
    });

    it('should filter plugins by category', () => {
      const builtinPlugins = registry.list('builtin' as KpiCategory);
      expect(builtinPlugins).toHaveLength(2);
      expect(builtinPlugins.map((p) => p.id)).toEqual(['plugin-1', 'plugin-3']);

      const customPlugins = registry.list('custom' as KpiCategory);
      expect(customPlugins).toHaveLength(1);
      expect(customPlugins[0].id).toBe('plugin-2');
    });
  });

  describe('listByDomain()', () => {
    beforeEach(() => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      registry.register(mockPlugin3);
    });

    it('should return all plugins when no filter provided', () => {
      const plugins = registry.listByDomain();
      expect(plugins).toHaveLength(3);
    });

    it('should filter plugins by domain', () => {
      const processingTimePlugins = registry.listByDomain(
        'processing-time' as KpiDomain
      );
      expect(processingTimePlugins).toHaveLength(1);
      expect(processingTimePlugins[0].id).toBe('plugin-1');

      const throughputPlugins = registry.listByDomain('throughput' as KpiDomain);
      expect(throughputPlugins).toHaveLength(1);
      expect(throughputPlugins[0].id).toBe('plugin-2');
    });
  });

  describe('has()', () => {
    it('should return true for registered plugin', () => {
      registry.register(mockPlugin1);
      expect(registry.has('plugin-1')).toBe(true);
    });

    it('should return false for non-existent plugin', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all plugins', () => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      expect(registry.size()).toBe(2);

      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.has('plugin-1')).toBe(false);
    });
  });

  describe('size()', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size()).toBe(0);
    });

    it('should return count of registered plugins', () => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      expect(registry.size()).toBe(2);
    });
  });

  describe('getIds()', () => {
    it('should return array of plugin IDs', () => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);

      const ids = registry.getIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('plugin-1');
      expect(ids).toContain('plugin-2');
    });

    it('should return empty array for empty registry', () => {
      const ids = registry.getIds();
      expect(ids).toEqual([]);
    });
  });

  describe('getMultiple()', () => {
    beforeEach(() => {
      registry.register(mockPlugin1);
      registry.register(mockPlugin2);
      registry.register(mockPlugin3);
    });

    it('should return map of found plugins', () => {
      const result = registry.getMultiple(['plugin-1', 'plugin-3']);
      expect(result.size).toBe(2);
      expect(result.get('plugin-1')).toEqual(mockPlugin1);
      expect(result.get('plugin-3')).toEqual(mockPlugin3);
    });

    it('should exclude non-existent plugins', () => {
      const result = registry.getMultiple(['plugin-1', 'non-existent']);
      expect(result.size).toBe(1);
      expect(result.get('plugin-1')).toEqual(mockPlugin1);
      expect(result.get('non-existent')).toBeUndefined();
    });

    it('should return empty map for no matches', () => {
      const result = registry.getMultiple(['non-existent-1', 'non-existent-2']);
      expect(result.size).toBe(0);
    });
  });

  describe('unregister()', () => {
    it('should remove existing plugin', () => {
      registry.register(mockPlugin1);
      expect(registry.has('plugin-1')).toBe(true);

      const removed = registry.unregister('plugin-1');
      expect(removed).toBe(true);
      expect(registry.has('plugin-1')).toBe(false);
    });

    it('should return false for non-existent plugin', () => {
      const removed = registry.unregister('non-existent');
      expect(removed).toBe(false);
    });
  });
});
