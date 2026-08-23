/**
 * KPI Engine with Extension Plugin Architecture
 *
 * Built-in KPI calculators for Jira metrics with German holiday awareness.
 * Supports custom plugins via the KpiPlugin interface.
 */

import type { GermanState } from '../holidays/german-holidays';
import type { JiraIssue } from '../jira/client';
import { extractSelectFieldValue } from '../jira/client';

// @MX:NOTE: Module-level WeakMap to cache compiled custom formula functions without mutating definitions
// @MX:REASON: Prevents pollution of caller-provided objects and enables safe garbage collection
// @MX:WARN: SECURITY BOUNDARY — values in this cache are produced exclusively by
// compileCustomFormula() (a sandboxed parser + interpreter). `new Function`/`eval`
// must never be used here: formulas arrive over unauthenticated HTTP endpoints.
type CompiledFunction = (context: KpiContext) => unknown;
const compiledFnCache = new WeakMap<object, CompiledFunction>();
import { PluginLoader } from './plugin-loader';
import { compileCustomFormula } from './custom-formula';
import type { KpiPlugin, KpiContext, KpiResult, TransformedIssue, StatusTransition } from './types';
import { transformIssueForKpi, applyFilter, splitByTopLevelOperator, getFieldValue, isIssueDone } from './engine-utils';
import { getLocalMondayWeekBounds } from '../utils/week-boundaries';

export type { KpiPlugin, KpiContext, KpiResult, TransformedIssue, StatusTransition };
export { transformIssueForKpi, applyFilter, splitByTopLevelOperator, getFieldValue, isIssueDone };

// ─── Field accessor map for O(1) lookup ───────────────────────────────────────
// Replaces the if/else chain in the global filter application below.
const FIELD_ACCESSORS: Record<string, (t: TransformedIssue) => string | string[]> = {
  assignee: (t) => t.assignee,
  priority: (t) => t.priority || 'None',
  issueType: (t) => t.issueType,
  status: (t) => t.status,
  statusCategory: (t) => t.statusCategory,
  reporter: (t) => t.reporter,
  project: (t) => t.project,
  component: (t) => t.components,
  label: (t) => t.labels,
  issueOwnerTeam: (t) => t.issueOwnerTeam || 'Unassigned',
};

// ─── Weekly Cache ──────────────────────────────────────────────────────────────

/**
 * @MX:NOTE: Weekly issue cache to prevent redundant filtering across plugin calculations
 * @MX:REASON: Weekly breakdown was running O(n²) - once per plugin. This cache ensures
 * we only filter issues by week once per calculation batch.
 */
interface WeeklyCacheEntry {
  thisWeek: JiraIssue[];
  lastWeek: JiraIssue[];
  thisWeekStart: Date;
  thisWeekEnd: Date;
  lastWeekStart: Date;
  lastWeekEnd: Date;
}

class WeeklyIssueCache {
  private cache = new Map<string, WeeklyCacheEntry>();
  private maxEntries = 5; // Keep last 5 calculation contexts

  private getCacheKey(issues: JiraIssue[], globalFilters?: Record<string, string[]>): string {
    // @MX:NOTE: Include stable issue keys and full filter values for collision prevention
    const issueKeys = issues.map(i => i.key).sort().join(',');
    const filterKey = globalFilters ? JSON.stringify(globalFilters, Object.keys(globalFilters).sort()) : 'no-filters';
    return `${issueKeys}:${filterKey}`;
  }

  get(
    issues: JiraIssue[],
    globalFilters?: Record<string, string[]>
  ): WeeklyCacheEntry | undefined {
    const key = this.getCacheKey(issues, globalFilters);
    return this.cache.get(key);
  }

  set(
    issues: JiraIssue[],
    globalFilters: Record<string, string[]> | undefined,
    entry: WeeklyCacheEntry
  ): void {
    const key = this.getCacheKey(issues, globalFilters);

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, entry);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Module-level singleton cache
const weeklyIssueCache = new WeeklyIssueCache();

// ─── Preprocessed data for calculateAll() batch ────────────────────────────────

interface Preprocessed {
  /** Issues filtered by global filters AND period (for each plugin's main context) */
  periodFilteredIssues: JiraIssue[];
  /** Pre-transformed issues for the period */
  transformed: TransformedIssue[];
  /** Week boundary dates */
  weekBoundaries: { thisWeekStart: Date; thisWeekEnd: Date; lastWeekStart: Date; lastWeekEnd: Date };
  /** This week's filtered issues */
  thisWeekIssues: JiraIssue[];
  /** Last week's filtered issues */
  lastWeekIssues: JiraIssue[];
  /** This week's transformed issues */
  thisWeekTransformed: TransformedIssue[];
  /** Last week's transformed issues */
  lastWeekTransformed: TransformedIssue[];
  /** Previous period filtered issues */
  prevPeriodIssues: JiraIssue[];
  /** Previous period transformed issues */
  prevPeriodTransformed: TransformedIssue[];
  /** Previous period boundaries */
  prevPeriod: { start: Date; end: Date };
}

// ─── Custom plugin result sanitization ───────────────────────────────────────
// @MX:WARN: SECURITY BOUNDARY — values produced by user-supplied formulas flow
// into storage/API responses. Formula output is sanitized at this boundary:
// values must be finite numbers, name/unit must be strings, non-object entries
// are dropped, and nested details/dimensions keep only scalar content.

/** True when the value looks like a KpiResult object (has a defined `value`). */
function hasValueProperty(entry: unknown): boolean {
  return entry !== null && typeof entry === 'object' &&
    typeof (entry as Record<string, unknown>).value !== 'undefined';
}

function finiteNumberOrZero(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Sanitize one formula-produced KpiResult object; returns null if unusable. */
function sanitizeKpiResultEntry(
  entry: unknown,
  defaults: { name: string; unit: string }
): KpiResult | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const raw = entry as Record<string, unknown>;

  const result: KpiResult = {
    name: typeof raw.name === 'string' && raw.name ? raw.name : defaults.name,
    value: finiteNumberOrZero(raw.value),
    unit: typeof raw.unit === 'string' ? raw.unit : defaults.unit,
  };

  if (raw.dimensions !== null && typeof raw.dimensions === 'object' && !Array.isArray(raw.dimensions)) {
    const dimensions: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw.dimensions as Record<string, unknown>)) {
      const t = typeof val;
      if (t === 'string' || t === 'number' || t === 'boolean') dimensions[key] = String(val);
    }
    result.dimensions = dimensions;
  }

  if (Array.isArray(raw.details)) {
    const details: NonNullable<KpiResult['details']> = [];
    for (const item of raw.details) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
      const detail = item as Record<string, unknown>;
      const sanitizedDetail: { label: string; value: number; unit?: string } = {
        label: typeof detail.label === 'string' ? detail.label : 'Detail',
        value: finiteNumberOrZero(detail.value),
      };
      if (typeof detail.unit === 'string') sanitizedDetail.unit = detail.unit;
      details.push(sanitizedDetail);
    }
    result.details = details;
  }

  return result;
}

/**
 * Normalize any formula output into a safe KpiResult[].
 * Result objects/arrays are sanitized field by field; anything else is treated
 * as a scalar value and coerced to a finite number (NaN/Infinity become 0).
 */
function sanitizeFormulaResults(
  result: unknown,
  defaults: { name: string; unit: string }
): KpiResult[] {
  if (Array.isArray(result) && result.length > 0 && hasValueProperty(result[0])) {
    const sanitized = result
      .map((entry) => sanitizeKpiResultEntry(entry, defaults))
      .filter((entry): entry is KpiResult => entry !== null);
    if (sanitized.length > 0) return sanitized;
    return [{ name: defaults.name, value: 0, unit: defaults.unit }];
  }
  if (hasValueProperty(result)) {
    const sanitized = sanitizeKpiResultEntry(result, defaults);
    if (sanitized) return [sanitized];
  }
  return [{ name: defaults.name, value: finiteNumberOrZero(result), unit: defaults.unit }];
}

// ─── KPI Engine ──────────────────────────────────────────────────────────────

export class KpiEngine {
  private plugins: Map<string, KpiPlugin> = new Map();

  constructor() {
    // Auto-load all built-in plugins
    const loader = new PluginLoader();
    const builtinPlugins = loader.loadBuiltinPlugins();

    builtinPlugins.forEach((plugin) => this.register(plugin));

    // Auto-load time-series plugins
    const timeSeriesPlugins = loader.loadTimeSeriesPlugins();
    timeSeriesPlugins.forEach((plugin) => this.register(plugin));

    // Auto-load custom plugins (asynchronously)
    this.initCustomPlugins();
  }

  private async initCustomPlugins() {
    try {
      const loader = new PluginLoader();
      const customPlugins = await loader.loadCustomPlugins();
      customPlugins.forEach((plugin) => this.register(plugin));
      console.log(`[KPI Engine] Loaded ${customPlugins.length} custom plugins`);
    } catch (error) {
      console.error('[KPI Engine] Failed to load custom plugins:', error);
      // Continue without custom plugins rather than failing completely
    }
  }

  register(plugin: KpiPlugin) {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string) {
    this.plugins.delete(pluginId);
  }

  clearCustomPlugins(): void {
    const toDelete: string[] = [];
    for (const [id, plugin] of this.plugins) {
      if (plugin.pluginType === 'custom' || plugin.category === 'custom') {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.plugins.delete(id);
    }
  }

  getPlugin(pluginId: string): KpiPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): KpiPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByCategory(category: KpiPlugin['category']): KpiPlugin[] {
    return this.getAllPlugins().filter((p) => p.category === category);
  }

  /**
   * Filter issues to those relevant to the specified period.
   * Includes issues created, resolved, or active during the period.
   */
  private filterIssuesByPeriod(
    issues: JiraIssue[],
    period: { start: Date; end: Date }
  ): JiraIssue[] {
    return issues.filter((issue) => {
      const created = issue.fields?.created
        ? new Date(issue.fields.created)
        : (issue as any).created
          ? new Date((issue as any).created)
          : null;
      const resolved = issue.fields?.resolutiondate
        ? new Date(issue.fields.resolutiondate)
        : (issue as any).resolved
          ? new Date((issue as any).resolved)
          : null;

      // Include if created within period
      if (created && created >= period.start && created <= period.end) {
        return true;
      }

      // Include if resolved within period
      if (resolved && resolved >= period.start && resolved <= period.end) {
        return true;
      }

      // Include if open during period (created before period end, not resolved)
      if (created && created < period.end && !resolved) {
        return true;
      }

      // Include if active during period (created before, resolved after)
      if (created && created < period.start && resolved && resolved > period.start) {
        return true;
      }

      return false;
    });
  }

  /**
   * @MX:NOTE: Build preprocessed data (filter, transform, weekly, prev period)
   * @MX:REASON: Extracted duplicated logic from calculate() and calculateAll() for maintainability
   */
  private buildPreprocessed(
    issues: JiraIssue[],
    period: { start: Date; end: Date },
    globalFilters?: Record<string, string[]>,
    useCache: boolean = true
  ): Preprocessed {
    let processedIssues = issues;

    // 1. Apply global filters to all issues first
    if (globalFilters && Object.keys(globalFilters).length > 0) {
      processedIssues = issues.filter(issue => {
        const transformed = transformIssueForKpi(issue);
        for (const [key, values] of Object.entries(globalFilters)) {
          if (!values || values.length === 0) continue;

          if (key === 'jql') {
            let matchesAllJql = true;
            for (const query of values) {
              const result = applyFilter([transformed], query);
              if (result.length === 0) {
                matchesAllJql = false;
                break;
              }
            }
            if (!matchesAllJql) return false;
            continue;
          }

          const accessor = FIELD_ACCESSORS[key];
          let issueValue: string | string[] = accessor
            ? accessor(transformed)
            : extractSelectFieldValue((issue.fields as any)[key]) || 'None';

          const lowerValues = values.map(v => v.toLowerCase());
          const match = Array.isArray(issueValue)
            ? issueValue.some(v => lowerValues.includes(v.toLowerCase()))
            : lowerValues.includes(String(issueValue || '').toLowerCase());

          if (!match) return false;
        }
        return true;
      });
      console.log(`[KPI Engine] Filters reduced issues from ${issues.length} to ${processedIssues.length}`);
    }

    // 2. Filter issues to those relevant for the period
    const periodFilteredIssues = this.filterIssuesByPeriod(processedIssues, period);

    // 3. Transform issues for this period
    const transformed = periodFilteredIssues.map(transformIssueForKpi);

    // 4. Weekly breakdown
    // @MX:NOTE: Shared local-time Monday-week math (see src/lib/utils/week-boundaries.ts)
    const { thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd } =
      getLocalMondayWeekBounds(new Date());
    const weekBoundaries = { thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd };

    let thisWeekIssues: JiraIssue[];
    let lastWeekIssues: JiraIssue[];

    const cachedWeekly = useCache ? weeklyIssueCache.get(processedIssues, globalFilters) : undefined;

    if (cachedWeekly) {
      thisWeekIssues = cachedWeekly.thisWeek;
      lastWeekIssues = cachedWeekly.lastWeek;
    } else {
      thisWeekIssues = processedIssues.filter(i => {
        const d = i.fields?.created ? new Date(i.fields.created) : new Date((i as any).created);
        return d >= thisWeekStart && d < thisWeekEnd;
      });

      lastWeekIssues = processedIssues.filter(i => {
        const d = i.fields?.created ? new Date(i.fields.created) : new Date((i as any).created);
        return d >= lastWeekStart && d < lastWeekEnd;
      });

      if (useCache) {
        weeklyIssueCache.set(processedIssues, globalFilters, {
          thisWeek: thisWeekIssues,
          lastWeek: lastWeekIssues,
          thisWeekStart,
          thisWeekEnd,
          lastWeekStart,
          lastWeekEnd,
        });
      }
    }

    const thisWeekTransformed = thisWeekIssues.map(transformIssueForKpi);
    const lastWeekTransformed = lastWeekIssues.map(transformIssueForKpi);

    // 5. Previous period comparison
    const currentDuration = period.end.getTime() - period.start.getTime();
    const prevPeriod = {
      start: new Date(period.start.getTime() - currentDuration),
      end: new Date(period.end.getTime() - currentDuration)
    };
    const prevPeriodIssues = this.filterIssuesByPeriod(processedIssues, prevPeriod);
    const prevPeriodTransformed = prevPeriodIssues.map(transformIssueForKpi);

    return {
      periodFilteredIssues,
      transformed,
      weekBoundaries,
      thisWeekIssues,
      lastWeekIssues,
      thisWeekTransformed,
      lastWeekTransformed,
      prevPeriodIssues,
      prevPeriodTransformed,
      prevPeriod,
    };
  }

  /**
   * Run a specific KPI calculation
   * @param _preprocessed - When provided (from calculateAll()), skips filter + transform + weekly precomputation
   */
  calculate(
    pluginId: string,
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>,
    useAnyoneCommentsForSla?: boolean,
    _preprocessed?: Preprocessed
  ): KpiResult[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`KPI plugin not found: ${pluginId}`);

    let processedIssues: JiraIssue[];
    let filteredIssues: JiraIssue[];
    let transformed: TransformedIssue[];
    let thisWeekIssues: JiraIssue[];
    let lastWeekIssues: JiraIssue[];
    let thisWeekTransformed: TransformedIssue[];
    let lastWeekTransformed: TransformedIssue[];
    let prevPeriodIssues: JiraIssue[];
    let prevPeriodTransformed: TransformedIssue[];
    let prevPeriod: { start: Date; end: Date };

    const preprocessed = _preprocessed ?? this.buildPreprocessed(issues, period, globalFilters, false);

    filteredIssues = preprocessed.periodFilteredIssues;
    transformed = preprocessed.transformed;
    thisWeekIssues = preprocessed.thisWeekIssues;
    lastWeekIssues = preprocessed.lastWeekIssues;
    thisWeekTransformed = preprocessed.thisWeekTransformed;
    lastWeekTransformed = preprocessed.lastWeekTransformed;
    prevPeriodIssues = preprocessed.prevPeriodIssues;
    prevPeriodTransformed = preprocessed.prevPeriodTransformed;
    prevPeriod = preprocessed.prevPeriod;
    processedIssues = issues;

    // ── Build context and run calculation ──────────────────────────────────────

    const context: KpiContext = {
      issues: transformed,
      holidays: {
        dates: new Set(),
        regions: holidays.regions,
        workStartHour: holidays.workStartHour || 9,
        workEndHour: holidays.workEndHour || 17,
        slaTargetHours: holidays.slaTargetHours,
        isHoliday: () => false,
        isWorkingDay: () => true,
      },
      period,
      slaTargets,
      useAnyoneCommentsForSla,
      globalFilters,
    };

    console.log(`[KPI Engine] Calculating ${pluginId} with useAnyoneCommentsForSla:`, useAnyoneCommentsForSla);

    const currentResults = plugin.calculate(context);
    const currentResultsArray = Array.isArray(currentResults) ? currentResults : [currentResults];

    const weekBoundaries = _preprocessed
      ? _preprocessed.weekBoundaries
      : getLocalMondayWeekBounds(new Date());

    // ── Weekly breakdown ──────────────────────────────────────────────────────

    const thisWeekContext: KpiContext = {
      ...context,
      issues: thisWeekTransformed,
      period: { start: weekBoundaries.thisWeekStart, end: weekBoundaries.thisWeekEnd }
    };

    const lastWeekContext: KpiContext = {
      ...context,
      issues: lastWeekTransformed,
      period: { start: weekBoundaries.lastWeekStart, end: weekBoundaries.lastWeekEnd }
    };

    try {
      const thisWeekResults = plugin.calculate(thisWeekContext);
      const lastWeekResults = plugin.calculate(lastWeekContext);
      const thisWeekResultsArray = Array.isArray(thisWeekResults) ? thisWeekResults : [thisWeekResults];
      const lastWeekResultsArray = Array.isArray(lastWeekResults) ? lastWeekResults : [lastWeekResults];

      currentResultsArray.forEach(res => {
        const matchResult = (resultSet: KpiResult[]) => resultSet.find(r => {
          if (res.dimensions && r.dimensions) {
            const resKeys = Object.keys(res.dimensions);
            const rKeys = Object.keys(r.dimensions);
            if (resKeys.length !== rKeys.length) return false;
            return resKeys.every(k => res.dimensions![k] === r.dimensions![k]);
          }
          return r.name === res.name;
        });

        const tw = matchResult(thisWeekResultsArray);
        const lw = matchResult(lastWeekResultsArray);

        if (tw || lw) {
          res.details = res.details || [];
          if (tw) res.details.push({ label: 'This Week', value: tw.value, unit: tw.unit });
          if (lw) res.details.push({ label: 'Previous Week', value: lw.value, unit: lw.unit });
          if (tw && lw) {
            res.comparison = {
              value: lw.value,
              change: Number((tw.value - lw.value).toFixed(2)),
              label: 'vs. prev week'
            };
          }
        }
      });
    } catch (e) {
      console.warn(`Weekly breakdown failed for ${pluginId}:`, e);
    }

    // ── Previous period comparison ────────────────────────────────────────────

    try {
      const previousResults = plugin.calculate({
        ...context,
        issues: prevPeriodTransformed,
        period: prevPeriod,
      });
      const previousResultsArray = Array.isArray(previousResults) ? previousResults : [previousResults];
      return currentResultsArray.map(res => {
        if (res.comparison) return res;

        const prevRes = previousResultsArray.find(p => {
          const nameMatch = p.name === res.name;
          if (!nameMatch) return false;
          if (res.dimensions || p.dimensions) {
            const resDims = res.dimensions || {};
            const pDims = p.dimensions || {};
            const resKeys = Object.keys(resDims);
            const pKeys = Object.keys(pDims);
            if (resKeys.length !== pKeys.length) return false;
            return resKeys.every(k => resDims[k] === pDims[k]);
          }
          return true;
        });

        if (prevRes && typeof prevRes.value === 'number') {
          const change = res.value - prevRes.value;
          return {
            ...res,
            comparison: {
              value: prevRes.value,
              change: Number(change.toFixed(2)),
              label: 'vs. prev period'
            }
          };
        }
        return res;
      });
    } catch (e) {
      return Array.isArray(currentResults) ? currentResults : [currentResults];
    }
  }

  /**
   * Run all registered KPI calculations
   * @MX:NOTE: Pre-computes filter results, transform, and weekly breakdown once per batch
   * @MX:NOTE: Passes preprocessed data to each calculate() call to avoid N× redundant work
   */
  calculateAll(
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>,
    useAnyoneCommentsForSla?: boolean,
    pluginIds?: string[]
  ): Record<string, KpiResult[]> {
    // ── Determine which plugins to calculate ────────────────────────────
    const targetIds = (pluginIds && pluginIds.length > 0)
      ? pluginIds.filter(id => this.plugins.has(id))
      : Array.from(this.plugins.keys());

    if (targetIds.length === 0) return {};

    // ── Pre-compute once for entire batch ────────────────────────────────────
    const preprocessed = this.buildPreprocessed(issues, period, globalFilters, true);

    // ── Calculate each plugin with shared preprocessed data ──────────────────
    const results: Record<string, KpiResult[]> = {};
    try {
      for (const id of targetIds) {
        results[id] = this.calculate(id, issues, holidays, period, slaTargets, globalFilters, useAnyoneCommentsForSla, preprocessed);
      }
    } finally {
      weeklyIssueCache.clear();
    }
    return results;
  }

  /**
   * Register a custom KPI plugin from JSON definition
   * Used for extension/plugin system
   */
  registerCustomPlugin(definition: {
    id: string;
    name: string;
    description: string;
    category: KpiPlugin['category'];
    unit: string;
    formula: string; // DSL formula or JS code
    language?: 'dsl' | 'javascript';
  }) {
    const customPlugin: KpiPlugin = {
      ...definition,
      domain: 'custom',
      version: '1.0.0',
      pluginType: 'custom',
      isActive: true,
      calculate(context) {
        const defaults = { name: definition.name, unit: definition.unit };
        if (definition.language === 'javascript') {
          try {
            let fn = compiledFnCache.get(definition);
            if (!fn) {
              fn = compileCustomFormula(definition.formula, 'javascript');
              compiledFnCache.set(definition, fn);
            }
            // @MX:WARN: Formula output is sanitized at the boundary — result
            // objects get finite values/string fields, non-object entries are
            // dropped, scalars are coerced with an explicit isFinite guard.
            return sanitizeFormulaResults(fn!(context), defaults);
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Plugin JS error:', errorMessage);
            return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'JS Error', value: 0 }] }];
          }
        }
        // DSL formulas: compile once into a sandboxed evaluator (cached like JS),
        // returning the numeric value wrapped into the plugin's KpiResult shape.
        // Output passes through the same sanitizer as the JS branch.
        try {
          let fn = compiledFnCache.get(definition);
          if (!fn) {
            fn = compileCustomFormula(definition.formula, 'dsl');
            compiledFnCache.set(definition, fn);
          }
          return sanitizeFormulaResults(fn!(context), defaults);
        } catch {
          return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Parse Error', value: 0 }] }];
        }
      },
    };

    this.register(customPlugin);
    return customPlugin;
  }
}

// Singleton engine instance
let engineInstance: KpiEngine | null = null;

export function getKpiEngine(): KpiEngine {
  if (!engineInstance) {
    engineInstance = new KpiEngine();
  }
  return engineInstance;
}
