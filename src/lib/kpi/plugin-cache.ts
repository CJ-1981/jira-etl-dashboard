/**
 * KPI Plugin Cache
 * LRU-style caching with TTL for plugin instances to reduce loading overhead
 * @MX:ANCHOR: Plugin caching infrastructure
 * @MX:REASON: Reduces file I/O and parsing overhead for frequently accessed plugins
 */

import { KpiPlugin } from './types';

/**
 * Cache entry with timestamp for expiration tracking
 */
interface CacheEntry {
  plugin: KpiPlugin;
  timestamp: number;
}

/**
 * Statistics for cache performance monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/**
 * LRU-style cache with TTL for KPI plugins
 * Provides automatic expiration and statistics tracking
 */
export class PluginCache {
  private cache: Map<string, CacheEntry>;
  private ttl: number;
  private hits: number;
  private misses: number;
  private maxEntries: number;

  constructor(ttl: number = 5 * 60 * 1000, maxEntries: number = 100) {
    this.cache = new Map();
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
    this.maxEntries = maxEntries;
  }

  /**
   * Get a plugin from cache if it exists and hasn't expired
   * @param id - Plugin identifier
   * @returns Plugin if found and valid, undefined otherwise
   */
  get(id: string): KpiPlugin | undefined {
    const entry = this.cache.get(id);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(id);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.plugin;
  }

  /**
   * Store a plugin in the cache
   * @param id - Plugin identifier
   * @param plugin - Plugin instance to cache
   */
  set(id: string, plugin: KpiPlugin): void {
    this.cache.set(id, {
      plugin,
      timestamp: Date.now(),
    });

    if (this.cache.size > this.maxEntries * 2) {
      this.cleanup();
    }
  }

  /**
   * Check if a plugin exists in cache and hasn't expired
   * @param id - Plugin identifier
   * @returns true if plugin exists and is valid
   */
  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  /**
   * Invalidate a specific cache entry
   * @param id - Plugin identifier to invalidate
   */
  invalidate(id: string): void {
    this.cache.delete(id);
  }

  /**
   * Clear all entries from the cache and reset statistics
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get the number of non-expired entries in the cache
   * @returns Count of valid cached entries
   */
  size(): number {
    // Count only non-expired entries
    const now = Date.now();
    let count = 0;
    for (const entry of this.cache.values()) {
      if (now - entry.timestamp <= this.ttl) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache statistics for monitoring and debugging
   * @returns Statistics object with hits, misses, size, and hit rate
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Remove expired entries from the cache
   * Automatically called when adding new entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    const entries = Array.from(this.cache.entries());
    for (const [id, entry] of entries) {
      if (now - entry.timestamp > this.ttl) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.cache.delete(id);
    }
  }

  /**
   * Get all plugin IDs currently in cache (including expired)
   * Useful for debugging and monitoring
   * @returns Array of plugin identifiers
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Set a new TTL for the cache
   * Does not affect existing entries
   * @param ttl - New time-to-live in milliseconds
   */
  setTTL(ttl: number): void {
    this.ttl = ttl;
  }

  /**
   * Get current TTL setting
   * @returns Time-to-live in milliseconds
   */
  getTTL(): number {
    return this.ttl;
  }

  /**
   * Reset statistics counters without clearing cache
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
