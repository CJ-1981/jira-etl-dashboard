/**
 * Date string conversion utilities with caching
 * @MX:NOTE: Optimized replacements for common date formatting patterns
 * @MX:REASON: Prevents redundant toISOString().split('T')[0] calls
 */

// LRU cache for date strings (YYYY-MM-DD format)
const dateStringCache = new Map<number, string>();
const DATE_CACHE_SIZE = 10000; // Store up to 10k unique dates

/**
 * Convert a Date to ISO date string (YYYY-MM-DD) with caching
 * @MX:NOTE: Cached version of date.toISOString().split('T')[0]
 * @MX:REASON: Timezone-safe date formatting is expensive, cache results
 */
export function toISODate(date: Date): string {
  // Use UTC midnight for day-level cache key (all times on same day hit the same cache entry)
  const ts = getUTCMidnight(date);

  const cached = dateStringCache.get(ts);
  if (cached !== undefined) return cached;

  const result = date.toISOString().split('T')[0];

  // FIFO eviction (insertion order, not true LRU)
  if (dateStringCache.size >= DATE_CACHE_SIZE) {
    const firstKey = dateStringCache.keys().next().value;
    if (firstKey !== undefined) {
      dateStringCache.delete(firstKey);
    }
  }

  dateStringCache.set(ts, result);
  return result;
}

/**
 * Get UTC midnight timestamp for a date (for consistent comparisons)
 * @MX:NOTE: Caches daily timestamps for faster date comparisons
 */
const utcMidnightCache = new Map<number, number>();
const UTC_CACHE_SIZE = 10000;

export function getUTCMidnight(date: Date): number {
  const ts = date.getTime();
  const dayKey = Math.floor(ts / (24 * 60 * 60 * 1000));

  const cached = utcMidnightCache.get(dayKey);
  if (cached !== undefined) return cached;

  const result = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

  if (utcMidnightCache.size >= UTC_CACHE_SIZE) {
    const firstKey = utcMidnightCache.keys().next().value;
    if (firstKey !== undefined) {
      utcMidnightCache.delete(firstKey);
    }
  }

  utcMidnightCache.set(dayKey, result);
  return result;
}

/**
 * Clear all date caches (useful for testing or memory pressure)
 */
export function clearDateCaches(): void {
  dateStringCache.clear();
  utcMidnightCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getDateCacheStats(): { dateStrings: number; utcMidnights: number } {
  return {
    dateStrings: dateStringCache.size,
    utcMidnights: utcMidnightCache.size,
  };
}
