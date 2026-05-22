// @MX:ANCHOR: JQL Result Cache
// @MX:NOTE: LRU cache for JQL calculation results to prevent redundant API calls
// @MX:REASON: Multiple charts with same JQL should share results, improving performance

import { KpiCalcResult } from '@/types/dashboard';

interface CacheEntry {
  results: KpiCalcResult[];
  timestamp: number;
}

interface JqlCacheConfig {
  maxEntries: number;
  ttlMs: number;
}

const DEFAULT_CONFIG: JqlCacheConfig = {
  maxEntries: 10,
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

export interface CalculationContext {
  jql: string;
  mode: 'override' | 'refine';
  connectionId?: string;
  dateFrom?: string;
  dateTo?: string;
  region?: string;
  globalFilters?: Record<string, string[]>;
  settings?: any;
  issueSetId?: string | number;
}

// Simple hash function for cache keys
function hashJql(context: CalculationContext): string {
  const serializeObject = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(serializeObject);
    return Object.keys(obj).sort().reduce((result: any, key) => {
      result[key] = serializeObject(obj[key]);
      return result;
    }, {});
  };

  const str = JSON.stringify(serializeObject(context));
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `jql_${Math.abs(hash)}`;
}

class JqlCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: JqlCacheConfig;

  constructor(config: Partial<JqlCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get(context: CalculationContext): KpiCalcResult[] | null {
    const key = hashJql(context);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update access order (LRU): delete and re-insert to move to end
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.results;
  }

  set(context: CalculationContext, results: KpiCalcResult[]): void {
    const key = hashJql(context);
    const now = Date.now();

    // If already exists, delete first to move to end (Map preserves insertion order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.config.maxEntries) {
      // Evict oldest (first entry in Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { results, timestamp: now });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
let cacheInstance: JqlCache | null = null;

export function getJqlCache(config?: Partial<JqlCacheConfig>): JqlCache {
  if (!cacheInstance) {
    cacheInstance = new JqlCache(config);
  }
  return cacheInstance;
}

export function clearJqlCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
  }
}
