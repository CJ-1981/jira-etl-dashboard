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
  private accessOrder: string[] = [];
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
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }

    // Update access order (LRU)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);

    return entry.results;
  }

  set(context: CalculationContext, results: KpiCalcResult[]): void {
    const key = hashJql(context);
    const now = Date.now();

    // If already exists, update and move to end
    if (this.cache.has(key)) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    } else {
      // Evict oldest if at capacity
      if (this.cache.size >= this.config.maxEntries) {
        const oldestKey = this.accessOrder.shift();
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
    }

    this.cache.set(key, { results, timestamp: now });
    this.accessOrder.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  // Get cache statistics for debugging
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: this.accessOrder,
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
