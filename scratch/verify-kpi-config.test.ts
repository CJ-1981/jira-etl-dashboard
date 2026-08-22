/**
 * Verification test for the proposed custom KPI plugin configs.
 * Loads REAL ticket data from prisma/db/custom.db, transforms it through the
 * same pipeline the app uses, and runs every candidate formula through the
 * actual sandboxed compiler to confirm it parses and yields sane values.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compileCustomFormula } from '@/lib/kpi/custom-formula';
import { transformIssueForKpi } from '@/lib/kpi/engine-utils';
import type { TransformedIssue } from '@/lib/kpi/types';

// Compact export of MasterTicket.rawData (changelogs stripped) — produced by
// scratch/export-fixture.cjs from prisma/db/custom.db
const FIXTURE_PATH = path.resolve(__dirname, 'issues-fixture.json');

function loadIssues(): TransformedIssue[] {
  const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  return raws
    .filter((raw: unknown) => raw && typeof raw === 'object')
    .map((raw: unknown) => transformIssueForKpi(raw as Parameters<typeof transformIssueForKpi>[0]));
}

// The deliverable config file is the source of truth — this test verifies
// every plugin inside it against real production data.
const CONFIG_PATH = path.resolve(__dirname, '../kpi-plugin-config.json');

// Config and fixture are local-only (gitignored); on a fresh checkout this
// suite skips instead of failing collection.
const canRun = fs.existsSync(FIXTURE_PATH) && fs.existsSync(CONFIG_PATH);

interface ConfigPlugin {
  id: string;
  name: string;
  unit: string;
  formula: string;
  language?: 'dsl' | 'javascript';
  pluginType: string;
  isActive: boolean;
}

function loadConfig(): {
  customPlugins: ConfigPlugin[];
  activePlugins: string[];
  databaseViews?: Array<{ id: string; name: string; connectionRef: string; data: { charts?: Array<{ id: string; kpiId: string; type: string; width: string; height: string }> } }>;
} {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

describe.skipIf(!canRun)('kpi-plugin-config.json', () => {
  // Collection runs even for skipped suites, so guard the file reads.
  const issues = canRun ? loadIssues() : [];
  const config = canRun ? loadConfig() : { customPlugins: [], activePlugins: [] };

  it('loads real data from the fixture', () => {
    expect(issues.length).toBeGreaterThan(100);
    console.log(`Loaded ${issues.length} transformed issues`);
  });

  it('config shape matches the import contract (localConfig.importConfig)', () => {
    expect(Array.isArray(config.customPlugins)).toBe(true);
    expect(config.customPlugins.length).toBeGreaterThan(0);
    for (const p of config.customPlugins) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(p.pluginType).toBe('custom');
      expect(['dsl', 'javascript']).toContain(p.language);
      expect(typeof p.formula).toBe('string');
      expect(p.formula.length).toBeGreaterThan(0);
    }
    const ids = config.customPlugins.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length); // unique ids
    // activePlugins must only reference custom plugins defined here or known builtins
    for (const id of config.activePlugins) {
      const isCustom = ids.includes(id);
      const isBuiltin = !id.startsWith('custom-');
      expect(isCustom || isBuiltin).toBe(true);
    }
  });

  it('databaseViews charts reference active plugins and use valid layout values', () => {
    const views = config.databaseViews ?? [];
    expect(views.length).toBeGreaterThan(0);

    const chartTypes = ['bar', 'line', 'pie', 'area'];
    const widths = ['sm', 'md', 'lg', 'full'];
    const heights = ['short', 'md', 'tall', 'xtall'];

    for (const view of views) {
      const charts = view.data.charts ?? [];
      expect(charts.length).toBeGreaterThan(0);
      expect(charts.length).toBeLessThanOrEqual(12); // UI caps charts at 12

      for (const chart of charts) {
        expect(chartTypes).toContain(chart.type);
        expect(widths).toContain(chart.width);
        expect(heights).toContain(chart.height);
        // Chart data requires the plugin to be active, otherwise nothing renders
        expect(config.activePlugins).toContain(chart.kpiId);
      }
    }
  });

  for (const plugin of config.customPlugins) {
    it(`${plugin.id}: formula compiles and produces finite results`, () => {
      const language = plugin.language ?? 'dsl';
      const fn = compileCustomFormula(plugin.formula, language); // throws on syntax/security errors
      const out = fn({ issues }) as unknown;

      if (language === 'dsl') {
        expect(typeof out).toBe('number');
        expect(Number.isFinite(out)).toBe(true);
        console.log(`  ${plugin.name}: ${out} ${plugin.unit}`);
      } else {
        expect(Array.isArray(out)).toBe(true);
        for (const entry of out as Array<{ value: number }>) {
          expect(Number.isFinite(entry.value)).toBe(true);
        }
        console.log(`  ${plugin.name}: ${JSON.stringify(out)}`);
      }
    });
  }

  it('sanity: clone count matches label/summary expectations', () => {
    const fn = compileCustomFormula('COUNT(summary CONTAINS "CLONE")', 'dsl');
    const cloneCount = fn({ issues }) as number;
    const labelClones = issues.filter(i => (i.labels || []).some(l => String(l).toUpperCase() === 'CLONE')).length;
    console.log(`  summary-CLONE: ${cloneCount}, label-CLONE: ${labelClones}`);
    expect(cloneCount).toBeGreaterThan(0);
  });
});
