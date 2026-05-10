/**
 * Plugin Cache Tests
 * Verify caching functionality, TTL expiration, and statistics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginCache } from '../plugin-cache';
import { KpiPlugin, KpiCategory, KpiDomain } from '../types';

describe('PluginCache', () => {
  let cache: PluginCache;
  let mockPlugin1: KpiPlugin;
  let mockPlugin2: KpiPlugin;

  beforeEach(() => {
    cache = new PluginCache(1000); // 1 second TTL for testing

    mockPlugin1 = {
      id: 'plugin-1',
      name: 'Plugin 1',
      category: 'builtin' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
    unit: 'count',
      calculate: vi.fn(),
    };

    mockPlugin2 = {
      id: 'plugin-2',
      name: 'Plugin 2',
      category: 'custom' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
    unit: 'count',
      calculate: vi.fn(),
    };
  });

  describe('get() and set()', () => {
    it('should store and retrieve plugin', () => {
      cache.set('plugin-1', mockPlugin1);
      const retrieved = cache.get('plugin-1');

      expect(retrieved).toEqual(mockPlugin1);
    });

    it('should return undefined for non-existent plugin', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for expired entry', async () => {
      cache.set('plugin-1', mockPlugin1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const retrieved = cache.get('plugin-1');
      expect(retrieved).toBeUndefined();
    });

    it('should return valid entry before expiration', async () => {
      cache.set('plugin-1', mockPlugin1);

      // Wait less than TTL
      await new Promise((resolve) => setTimeout(resolve, 500));

      const retrieved = cache.get('plugin-1');
      expect(retrieved).toEqual(mockPlugin1);
    });

    it('should update existing entry on set', () => {
      cache.set('plugin-1', mockPlugin1);
      cache.set('plugin-1', mockPlugin2);

      const retrieved = cache.get('plugin-1');
      expect(retrieved).toEqual(mockPlugin2);
    });
  });

  describe('has()', () => {
    it('should return true for existing unexpired entry', () => {
      cache.set('plugin-1', mockPlugin1);
      expect(cache.has('plugin-1')).toBe(true);
    });

    it('should return false for non-existent entry', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired entry', async () => {
      cache.set('plugin-1', mockPlugin1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.has('plugin-1')).toBe(false);
    });
  });

  describe('invalidate()', () => {
    it('should remove specific entry', () => {
      cache.set('plugin-1', mockPlugin1);
      expect(cache.has('plugin-1')).toBe(true);

      cache.invalidate('plugin-1');
      expect(cache.has('plugin-1')).toBe(false);
    });

    it('should not affect other entries', () => {
      cache.set('plugin-1', mockPlugin1);
      cache.set('plugin-2', mockPlugin2);

      cache.invalidate('plugin-1');

      expect(cache.has('plugin-1')).toBe(false);
      expect(cache.has('plugin-2')).toBe(true);
    });

    it('should be safe to invalidate non-existent entry', () => {
      expect(() => cache.invalidate('non-existent')).not.toThrow();
    });
  });

  describe('clear()', () => {
    it('should remove all entries and reset stats', () => {
      cache.set('plugin-1', mockPlugin1);
      cache.set('plugin-2', mockPlugin2);

      // Generate some stats
      cache.get('plugin-1'); // hit
      cache.get('non-existent'); // miss

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has('plugin-1')).toBe(false);
      expect(cache.has('plugin-2')).toBe(false);

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should track hits and misses correctly', () => {
      cache.set('plugin-1', mockPlugin1);

      cache.get('plugin-1'); // hit
      cache.get('plugin-1'); // hit
      cache.get('non-existent'); // miss
      cache.get('plugin-2'); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.size).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('plugin-1', mockPlugin1);

      for (let i = 0; i < 7; i++) {
        cache.get('plugin-1'); // 7 hits
      }
      for (let i = 0; i < 3; i++) {
        cache.get('non-existent'); // 3 misses
      }

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.7); // 7/10
    });

    it('should handle zero total requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('resetStats()', () => {
    it('should reset stats without clearing cache', () => {
      cache.set('plugin-1', mockPlugin1);

      cache.get('plugin-1'); // hit
      cache.get('non-existent'); // miss

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1); // Cache still has entry
    });
  });

  describe('getKeys()', () => {
    it('should return array of all keys', () => {
      cache.set('plugin-1', mockPlugin1);
      cache.set('plugin-2', mockPlugin2);

      const keys = cache.getKeys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('plugin-1');
      expect(keys).toContain('plugin-2');
    });

    it('should return empty array for empty cache', () => {
      const keys = cache.getKeys();
      expect(keys).toEqual([]);
    });
  });

  describe('setTTL() and getTTL()', () => {
    it('should get default TTL', () => {
      const defaultCache = new PluginCache();
      expect(defaultCache.getTTL()).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('should set custom TTL', () => {
      const customCache = new PluginCache(2000);
      expect(customCache.getTTL()).toBe(2000);

      customCache.setTTL(5000);
      expect(customCache.getTTL()).toBe(5000);
    });

    it('should not affect existing entries when TTL changes', async () => {
      cache.set('plugin-1', mockPlugin1);

      cache.setTTL(100); // Shorter TTL

      // Original entry still has old TTL (1 second)
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(cache.has('plugin-1')).toBe(true);

      // New entry uses new TTL
      cache.set('plugin-2', mockPlugin2);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cache.has('plugin-2')).toBe(false);
    });
  });

  describe('cleanup()', () => {
    it('should automatically clean expired entries', async () => {
      cache.set('plugin-1', mockPlugin1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Add new entry - this triggers cleanup
      cache.set('plugin-2', mockPlugin2);

      expect(cache.size()).toBe(1);
      expect(cache.has('plugin-1')).toBe(false);
      expect(cache.has('plugin-2')).toBe(true);
    });
  });
});
