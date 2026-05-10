/**
 * KPI Engine with Extension Plugin Architecture
 *
 * Built-in KPI calculators for Jira metrics with German holiday awareness.
 * Supports custom plugins via the KpiPlugin interface.
 */

import type { GermanState } from '../holidays/german-holidays';
import type { JiraIssue } from '../jira/client';
import { PluginLoader } from './plugin-loader';
import type { KpiPlugin, KpiContext, KpiResult, TransformedIssue, StatusTransition } from './types';

// ─── Legacy Type Aliases for Backward Compatibility ────────────────────────────

// Re-export types from types.ts for backward compatibility
export type { KpiPlugin, KpiContext, KpiResult, TransformedIssue, StatusTransition };

// ─── Transform ───────────────────────────────────────────────────────────────

function transformIssueForKpi(issue: JiraIssue): TransformedIssue {
  const transitions: StatusTransition[] = [];
  if (issue.changelog?.histories) {
    for (const history of issue.changelog.histories) {
      for (const item of history.items) {
        if (item.field === 'status') {
          transitions.push({
            fromStatus: item.fromString || null,
            toStatus: item.toString || 'Unknown',
            author: history.author?.displayName || 'Unknown',
            occurredAt: new Date(history.created),
          });
        }
      }
    }
  }

  // Sort transitions chronologically (Jira returns changelog in reverse order)
  transitions.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Calculate time in each status
  const timeInStatus: Record<string, number> = {};
  for (let i = 0; i < transitions.length; i++) {
    const endTime = transitions[i + 1]
      ? transitions[i + 1].occurredAt.getTime()
      : Date.now();
    const durationHours = (endTime - transitions[i].occurredAt.getTime()) / (1000 * 60 * 60);
    const status = transitions[i].toStatus;
    timeInStatus[status] = (timeInStatus[status] || 0) + durationHours;
  }

  return {
    key: issue.key,
    project: (issue.fields as any)?.project?.name || (issue.fields as any)?.project?.key || issue.key.split('-')[0],
    summary: issue.fields?.summary || (issue as any).summary || 'No Summary',
    issueType: issue.fields?.issuetype?.name || (issue as any).issueType || 'Task',
    priority: issue.fields?.priority?.name || (issue as any).priority || null,
    status: issue.fields?.status?.name || (issue as any).status || 'Unknown',
    statusCategory: issue.fields?.status?.statusCategory?.name || (issue as any).statusCategory || 'Unknown',
    assignee: issue.fields?.assignee?.displayName || (issue as any).assignee || 'Unassigned',
    reporter: issue.fields?.reporter?.displayName || (issue as any).reporter || 'Unknown',
    created: new Date(issue.fields?.created || (issue as any).created || Date.now()),
    updated: new Date(issue.fields?.updated || (issue as any).updated || Date.now()),
    resolved: (issue.fields?.resolutiondate || (issue as any).resolved) ? new Date(issue.fields?.resolutiondate || (issue as any).resolved) : null,
    dueDate: (issue.fields?.duedate || (issue as any).dueDate) ? new Date(issue.fields?.duedate || (issue as any).dueDate) : null,
    storyPoints: (issue.fields as any)?.customfield_10002 || (issue as any).storyPoints || null,
    labels: issue.fields?.labels || (issue as any).labels || [],
    components: issue.fields?.components?.map((c) => c.name) || (issue as any).components || [],
    transitions,
    timeInStatus,
    comments: ((issue.fields as any)?.comment?.comments || [])
      .map((c: { author?: { displayName?: string }; created: string | number | Date }) => ({
        author: c.author?.displayName || 'Unknown',
        created: new Date(c.created),
      }))
      .sort((a: { created: Date }, b: { created: Date }) => a.created.getTime() - b.created.getTime()),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Robust check if an issue is considered "Done" or "Resolved"
 */
export function isIssueDone(issue: TransformedIssue): boolean {
  if (issue.resolved) return true;
  const status = (issue.status || '').toLowerCase();
  const category = (issue.statusCategory || '').toLowerCase();
  return category === 'done' || ['done', 'closed', 'resolved', 'completed', 'close', 'ready to close'].includes(status);
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

    // Auto-load custom plugins (if any)
    try {
      const customPlugins = loader.loadCustomPlugins();
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
   * Run a specific KPI calculation
   */
  calculate(
    pluginId: string,
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>,
    useAnyoneCommentsForSla?: boolean
  ): KpiResult[] {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`KPI plugin not found: ${pluginId}`);

    // 1. Apply global filters to all issues first
    let processedIssues = issues;
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

          let issueValue: string | string[] = '';
          if (key === 'assignee') issueValue = transformed.assignee;
          else if (key === 'priority') issueValue = transformed.priority || 'None';
          else if (key === 'issueType') issueValue = transformed.issueType;
          else if (key === 'status') issueValue = transformed.status;
          else if (key === 'statusCategory') issueValue = transformed.statusCategory;
          else if (key === 'reporter') issueValue = transformed.reporter;
          else if (key === 'project') issueValue = transformed.project;
          else if (key === 'component') issueValue = transformed.components;
          else if (key === 'label') issueValue = transformed.labels;

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
    const filteredIssues = this.filterIssuesByPeriod(processedIssues, period);

    const context: KpiContext = {
      issues: filteredIssues.map(transformIssueForKpi),
      holidays: {
        dates: new Set(),
        regions: holidays.regions,
        workStartHour: holidays.workStartHour || 9,
        workEndHour: holidays.workEndHour || 17,
        isHoliday: () => false,
        isWorkingDay: () => true,
      },
      period,
      slaTargets,
      useAnyoneCommentsForSla,
      globalFilters,
    };

    // Debug logging to verify context is built correctly
    console.log(`[KPI Engine] Calculating ${pluginId} with useAnyoneCommentsForSla:`, useAnyoneCommentsForSla);

    const currentResults = plugin.calculate(context);
    const currentResultsArray = Array.isArray(currentResults) ? currentResults : [currentResults];

    // 3. Weekly breakdown for all cards
    const now = new Date();
    // Current week start (Monday)
    const thisWeekStart = new Date(now);
    const day = thisWeekStart.getDay();
    const diff = thisWeekStart.getDate() - day + (day === 0 ? -6 : 1);
    thisWeekStart.setDate(diff);
    thisWeekStart.setHours(0, 0, 0, 0);

    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const lastWeekEnd = new Date(thisWeekStart);

    const thisWeekIssues = processedIssues.filter(i => {
      const d = i.fields?.created ? new Date(i.fields.created) : new Date((i as any).created);
      return d >= thisWeekStart && d < thisWeekEnd;
    });

    const lastWeekIssues = processedIssues.filter(i => {
      const d = i.fields?.created ? new Date(i.fields.created) : new Date((i as any).created);
      return d >= lastWeekStart && d < lastWeekEnd;
    });

    const thisWeekContext: KpiContext = {
      ...context,
      issues: thisWeekIssues.map(transformIssueForKpi),
      period: { start: thisWeekStart, end: thisWeekEnd }
    };

    const lastWeekContext: KpiContext = {
      ...context,
      issues: lastWeekIssues.map(transformIssueForKpi),
      period: { start: lastWeekStart, end: lastWeekEnd }
    };

    try {
      const thisWeekResults = plugin.calculate(thisWeekContext);
      const lastWeekResults = plugin.calculate(lastWeekContext);
      const thisWeekResultsArray = Array.isArray(thisWeekResults) ? thisWeekResults : [thisWeekResults];
      const lastWeekResultsArray = Array.isArray(lastWeekResults) ? lastWeekResults : [lastWeekResults];

      currentResultsArray.forEach(res => {
        // Find matching result in weekly sets (match by dimensions first, then name)
        const matchResult = (resultSet: KpiResult[]) => {
          return resultSet.find(r => {
            if (res.dimensions && r.dimensions) {
              const resKeys = Object.keys(res.dimensions);
              const rKeys = Object.keys(r.dimensions);
              if (resKeys.length !== rKeys.length) return false;
              return resKeys.every(k => res.dimensions![k] === r.dimensions![k]);
            }
            return r.name === res.name;
          });
        };

        const tw = matchResult(thisWeekResultsArray);
        const lw = matchResult(lastWeekResultsArray);

        if (tw || lw) {
          res.details = res.details || [];
          if (tw) res.details.push({ label: 'This Week', value: tw.value, unit: tw.unit });
          if (lw) res.details.push({ label: 'Previous Week', value: lw.value, unit: lw.unit });

          // Update comparison for all cards to be Week-over-Week
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

    // 4. Comparison logic
    // Only run if not already set by weekly breakdown (overview cards)
    const currentDuration = period.end.getTime() - period.start.getTime();
    const prevPeriod = {
      start: new Date(period.start.getTime() - currentDuration),
      end: new Date(period.end.getTime() - currentDuration)
    };
    const prevFilteredIssues = this.filterIssuesByPeriod(processedIssues, prevPeriod);
    const prevContext: KpiContext = {
      ...context,
      issues: prevFilteredIssues.map(transformIssueForKpi),
      period: prevPeriod,
    };

    try {
      const previousResults = plugin.calculate(prevContext);
      const previousResultsArray = Array.isArray(previousResults) ? previousResults : [previousResults];
      return currentResultsArray.map(res => {
        // If we already have a comparison (e.g. from weekly breakdown), keep it
        if (res.comparison) return res;

        const prevRes = previousResultsArray.find(p => p.name === res.name);
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
   */
  calculateAll(
    issues: JiraIssue[],
    holidays: { regions: GermanState[]; workStartHour?: number; workEndHour?: number; slaTargetHours?: number },
    period: { start: Date; end: Date },
    slaTargets?: Record<string, number>,
    globalFilters?: Record<string, string[]>,
    useAnyoneCommentsForSla?: boolean
  ): Record<string, KpiResult[]> {
    const results: Record<string, KpiResult[]> = {};
    for (const id of Array.from(this.plugins.keys())) {
      results[id] = this.calculate(id, issues, holidays, period, slaTargets, globalFilters, useAnyoneCommentsForSla);
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
        if (definition.language === 'javascript') {
          try {
            const fn = new Function('context', definition.formula);
            const result = fn(context);
            if (Array.isArray(result) && result.length > 0 && typeof result[0].value !== 'undefined') {
              return result;
            }
            return [{ name: definition.name, value: Number(result) || 0, unit: definition.unit }];
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Plugin JS error:', errorMessage);
            return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'JS Error', value: 0 }] }];
          }
        }
        // Parse and execute the custom formula
        return executeCustomFormula(definition.formula, context, definition);
      },
    };

    this.register(customPlugin);
    return customPlugin;
  }
}

/**
 * Execute custom formula DSL for plugin extensions
 */
function executeCustomFormula(
  formula: string,
  context: KpiContext,
  definition: { id: string; name: string; unit: string }
): KpiResult[] {
  const issues = context.issues;

  try {
    // Simple formula parser supporting:
    // - COUNT(issues where <condition>)
    // - AVG(<field>) where <condition>
    // - SUM(<field>) where <condition>
    // - PERCENTAGE(<condition1>) of <condition2>

    const match = formula.match(/^(\w+)\((.+)\)$/i);
    if (!match) {
      return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Error', value: 0 }] }];
    }

    const func = match[1].toUpperCase();
    const args = match[2];

    let value = 0;

    switch (func) {
      case 'COUNT': {
        const filtered = applyFilter(issues, args);
        value = filtered.length;
        break;
      }
      case 'AVG': {
        const [field, whereClause] = args.split(' WHERE ');
        const filtered = whereClause ? applyFilter(issues, whereClause) : issues;
        if (filtered.length === 0) { value = 0; break; }

        let sum = 0;
        let numericCount = 0;

        for (const issue of filtered) {
          const fieldValue = getFieldValue(issue, field.trim());
          if (typeof fieldValue === 'number') {
            sum += fieldValue;
            numericCount++;
          }
        }

        if (numericCount === 0) {
          value = 0;
        } else {
          value = Math.round((sum / numericCount) * 100) / 100;
        }
        break;
      }
      case 'SUM': {
        const [field, whereClause] = args.split(' WHERE ');
        const filtered = whereClause ? applyFilter(issues, whereClause) : issues;
        value = filtered.reduce((acc, issue) => {
          const fieldValue = getFieldValue(issue, field.trim());
          return acc + (typeof fieldValue === 'number' ? fieldValue : 0);
        }, 0);
        value = Math.round(value * 100) / 100;
        break;
      }
      case 'PERCENTAGE': {
        const parts = args.split(' OF ');
        const numerator = applyFilter(issues, parts[0]).length;
        const denominator = applyFilter(issues, parts[1] || 'true').length;
        value = denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
        break;
      }
      default:
        return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Unknown Function', value: 0 }] }];
    }

    return [{ name: definition.name, value, unit: definition.unit }];
  } catch {
    return [{ name: definition.name, value: 0, unit: definition.unit, details: [{ label: 'Parse Error', value: 0 }] }];
  }
}

function applyFilter(issues: KpiContext['issues'], condition: string): KpiContext['issues'] {
  const trimmed = condition.trim();
  if (!trimmed || trimmed === 'true' || trimmed === '*') return issues;

  // 1. Handle OR (lowest precedence)
  const orParts = splitByTopLevelOperator(trimmed, 'OR');
  if (orParts.length > 1) {
    const results = orParts.map(p => applyFilter(issues, p));
    const keys = new Set<string>();
    const combinedIssues: TransformedIssue[] = [];
    results.forEach(resList => {
      resList.forEach(issue => {
        if (!keys.has(issue.key)) {
          keys.add(issue.key);
          combinedIssues.push(issue);
        }
      });
    });
    return combinedIssues;
  }

  // 2. Handle AND
  const andParts = splitByTopLevelOperator(trimmed, 'AND');
  if (andParts.length > 1) {
    let currentIssues = issues;
    for (const part of andParts) {
      currentIssues = applyFilter(currentIssues, part);
    }
    return currentIssues;
  }

  // Handle atomic conditions
  const containsMatch = trimmed.match(/^([\w.-]+)\s+(NOT\s+)?CONTAINS\s+("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (containsMatch) {
    const [, field, not, , quotedDouble, quotedSingle, unquoted] = containsMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const isNot = !!not;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = String(getFieldValue(issue, field) || '').toLowerCase();
      const contains = fieldValue.includes(cleanVal);
      return isNot ? !contains : contains;
    });
  }

  const eqMatch = trimmed.match(/^([\w.-]+)\s*={1,2}\s*("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (eqMatch) {
    const [, field, , quotedDouble, quotedSingle, unquoted] = eqMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      if (cleanVal === 'true') return !!fieldValue;
      if (cleanVal === 'false') return !fieldValue;
      return String(fieldValue || '').toLowerCase() === cleanVal;
    });
  }

  const neqMatch = trimmed.match(/^([\w.-]+)\s*!=\s*("([^"]+)"|'([^']+)'|(\S+))$/i);
  if (neqMatch) {
    const [, field, , quotedDouble, quotedSingle, unquoted] = neqMatch;
    const val = quotedDouble || quotedSingle || unquoted;
    const cleanVal = val.toLowerCase();
    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      return String(fieldValue || '').toLowerCase() !== cleanVal;
    });
  }

  // @MX:NOTE: Array-aware IN/NOT IN semantics
  // Handles both scalar values and multi-value fields (labels, components).
  // For multi-value fields, the condition matches if ANY element of the field is present in the value list.
  const inMatch = trimmed.match(/^([\w.-]+)\s+(NOT\s+)?IN\s*\((.*)\)$/i);
  if (inMatch) {
    const [, field, not, valuesStr] = inMatch;
    const isNot = !!not;
    
    // Parse comma separated values respecting quotes
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];
      if ((char === '"' || char === "'") && (i === 0 || valuesStr[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().toLowerCase());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) values.push(current.trim().toLowerCase());

    return issues.filter((issue) => {
      const fieldValue = getFieldValue(issue, field);
      
      let isIn = false;
      if (Array.isArray(fieldValue)) {
        // If issue field is an array (e.g. labels, components), match if ANY element is in the values list
        isIn = fieldValue.some(v => values.includes(String(v || '').toLowerCase()));
      } else {
        // Standard scalar comparison
        isIn = values.includes(String(fieldValue || '').toLowerCase());
      }
      
      return isNot ? !isIn : isIn;
    });
  }

  return issues;
}

/**
 * Robust splitter that respects quotes
 */
function splitByTopLevelOperator(condition: string, operator: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  const op = operator.toUpperCase();
  const search = ` ${op} `;
  
  for (let i = 0; i < condition.length; i++) {
    const char = condition[i];
    
    // Handle quotes
    if ((char === '"' || char === "'") && (i === 0 || condition[i-1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }
    
    // Check for operator if not in quotes
    if (!inQuotes && condition.substring(i).toUpperCase().startsWith(search)) {
      parts.push(current.trim());
      current = '';
      i += search.length - 1; // Skip the operator
    } else {
      current += char;
    }
  }
  
  if (current) parts.push(current.trim());
  return parts;
}

function getFieldValue(issue: TransformedIssue, field: string): unknown {
  const fieldMap: Record<string, () => unknown> = {
    storyPoints: () => issue.storyPoints,
    priority: () => issue.priority,
    status: () => issue.status,
    statusCategory: () => issue.statusCategory,
    issueType: () => issue.issueType,
    assignee: () => issue.assignee,
    reporter: () => issue.reporter,
    labels: () => issue.labels,
    components: () => issue.components,
    resolved: () => issue.resolved,
    key: () => issue.key,
    project: () => issue.project,
    summary: () => issue.summary,
    description: () => (issue as any).description || '',
  };

  // Check timeInStatus for dynamic fields
  if (field.startsWith('timeInStatus.')) {
    const statusName = field.replace('timeInStatus.', '');
    return issue.timeInStatus[statusName] || 0;
  }

  const getter = fieldMap[field];
  return getter ? getter() : null;
}

// Singleton engine instance
let engineInstance: KpiEngine | null = null;

export function getKpiEngine(): KpiEngine {
  if (!engineInstance) {
    engineInstance = new KpiEngine();
  }
  return engineInstance;
}
