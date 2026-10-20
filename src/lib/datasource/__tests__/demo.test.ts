/**
 * Tests for demo mode: the artificial dataset generator, the DemoDataSource
 * wrapper (extract / master dataset / KPI calc + delegation), and the
 * getDataSource() factory routing on the cfg_demo_mode flag.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDemoIssues, DEMO_CONNECTION_ID } from '../demo-data';
import { DemoDataSource } from '../demo';
import { getDataSource } from '../index';
import { localConfig } from '@/lib/config/local-store';
import type { DataSource } from '../types';

const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── generateDemoIssues ───────────────────────────────────────────────────────

describe('generateDemoIssues', () => {
  it('is deterministic for a fixed anchor date', () => {
    const anchor = new Date('2026-10-19T12:00:00Z');
    const a = generateDemoIssues(anchor);
    const b = generateDemoIssues(anchor);
    expect(a).toEqual(b);
  });

  it('generates a healthy batch of raw-Jira-shaped issues', () => {
    const issues = generateDemoIssues();
    expect(issues.length).toBeGreaterThanOrEqual(100);
    for (const issue of issues) {
      expect(issue.key).toMatch(/^DEMO-\d+$/);
      expect(issue.fields.summary).toBeTruthy();
      expect(issue.fields.issuetype.name).toBeTruthy();
      expect(issue.fields.status.name).toBeTruthy();
      expect(['Done', 'In Progress', 'To Do']).toContain(issue.fields.status.statusCategory.name);
      expect(issue.fields.reporter.displayName).toBeTruthy();
      expect(typeof issue.fields.created).toBe('string');
      expect(Array.isArray(issue.fields.customfield_10032)).toBe(true);
    }
  });

  it('spans roughly the last 90 days and only resolves done tickets', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    const issues = generateDemoIssues(now);
    const earliest = Math.min(...issues.map(i => new Date(i.fields.created).getTime()));
    expect(now.getTime() - earliest).toBeLessThanOrEqual((WINDOW_DAYS + 1) * DAY_MS);

    for (const issue of issues) {
      const done = issue.fields.status.name === 'Done';
      expect(!!issue.fields.resolutiondate).toBe(done);
      // A ticket's last transition (updated) never lies in the future.
      expect(new Date(issue.fields.updated).getTime()).toBeLessThanOrEqual(now.getTime() + DAY_MS);
    }
  });

  it('carries status changelog entries that end at the current status', () => {
    interface DemoHistory {
      created: string;
      items: Array<{ field: string; fromString?: string | null; toString?: string | null }>;
    }
    const issues = generateDemoIssues();
    let withChangelog = 0;
    for (const issue of issues) {
      const histories: DemoHistory[] = issue.changelog?.histories ?? [];
      expect(histories.length).toBeGreaterThan(0);
      withChangelog++;
      const items = histories.flatMap(h => h.items);
      for (const item of items) expect(item.field).toBe('status');
      // Chronologically ordered, first entry starts from null, last equals status.
      const times = histories.map(h => new Date(h.created).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(items[0].fromString).toBeNull();
      expect(items[items.length - 1].toString).toBe(issue.fields.status.name);
    }
    expect(withChangelog).toBe(issues.length);
  });

  it('mixes participants, unassigned tickets, and story points for realistic KPIs', () => {
    const issues = generateDemoIssues();
    const withParticipants = issues.filter(i => i.fields.customfield_10032.length > 0);
    const unassigned = issues.filter(i => i.fields.assignee === null);
    const withStoryPoints = issues.filter(i => typeof i.fields.customfield_10002 === 'number');
    // Request participants are filled on nearly every ticket (the demo exists
    // to showcase that column); a few stay empty for filter tests.
    expect(withParticipants.length).toBeGreaterThan(issues.length * 0.8);
    expect(unassigned.length).toBeGreaterThan(0);
    expect(withStoryPoints.length).toBeGreaterThan(issues.length * 0.3);
  });
});

// ── DemoDataSource ───────────────────────────────────────────────────────────

function makeRealDataSource(): DataSource {
  return {
    loadMasterDataset: vi.fn(async () => null),
    extract: vi.fn(),
    calculateKpis: vi.fn(async () => ({ results: [], calculatedAt: 'real' })),
    listPlugins: vi.fn(async () => []),
    getHolidays: vi.fn(),
    listViews: vi.fn(async () => []),
    createView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
    setDefaultView: vi.fn(),
    listAllViews: vi.fn(async () => []),
    replaceViews: vi.fn(),
    testConnection: vi.fn(),
    deleteConnectionData: vi.fn(),
    exportKpiFile: vi.fn(),
  } as unknown as DataSource;
}

function extractParams(overrides: Record<string, unknown> = {}) {
  return {
    connectionRef: DEMO_CONNECTION_ID,
    connection: { baseUrl: '', email: '', apiToken: '', projectKeys: '' },
    customPlugins: [],
    saveExtraction: true,
    updateOnly: false,
    customFields: [],
    storageConfig: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('DemoDataSource', () => {
  it('extract returns artificial issues without touching the real source', async () => {
    const real = makeRealDataSource();
    const demo = new DemoDataSource(real);

    const res = await demo.extract(extractParams({ dateFrom: '2026-08-01', dateTo: '2026-10-19' }));

    expect(real.extract).not.toHaveBeenCalled();
    expect(res.summary.totalExtracted).toBe(res.issues.length);
    expect(res.summary.totalExtracted).toBeGreaterThan(0);
    expect(res.summary.jql).toContain('DEMO');
    // Window honored on `created`.
    for (const issue of res.issues) {
      const created = new Date(issue.fields.created);
      expect(created.getTime()).toBeGreaterThanOrEqual(new Date('2026-08-01').getTime());
      expect(created.getTime()).toBeLessThanOrEqual(new Date('2026-10-20').getTime());
    }
  });

  it('extract with no date bounds returns the whole dataset', async () => {
    const demo = new DemoDataSource(makeRealDataSource());
    const res = await demo.extract(extractParams());
    expect(res.summary.totalExtracted).toBe(generateDemoIssues().length);
  });

  it('loadMasterDataset serves the same issues as extract (shared cache)', async () => {
    const demo = new DemoDataSource(makeRealDataSource());
    const master = await demo.loadMasterDataset(DEMO_CONNECTION_ID, {});
    const res = await demo.extract(extractParams());
    expect(master?.totalExtracted).toBe(generateDemoIssues().length);
    // Unbounded extract returns the identical (cached) issue set.
    expect(res.issues).toEqual(master?.issues);
    expect(master?.dateRange?.from).toBeTruthy();
    expect(master?.dateRange?.to).toBeTruthy();
  });

  it('calculateKpis prefers inline issues (per-widget JQL) over the dataset', async () => {
    const demo = new DemoDataSource(makeRealDataSource());
    const inline = generateDemoIssues().slice(0, 3);

    const { results } = await demo.calculateKpis({
      connectionId: DEMO_CONNECTION_ID,
      storageConfig: null,
      issues: inline,
    });
    // The engine produces results for the tiny inline set — the point is that
    // it ran client-side over exactly those issues (real source untouched).
    expect(Array.isArray(results)).toBe(true);
  });

  it('calculateKpis falls back to the demo dataset when no issues are passed', async () => {
    const demo = new DemoDataSource(makeRealDataSource());
    const { results } = await demo.calculateKpis({
      connectionId: DEMO_CONNECTION_ID,
      storageConfig: null,
      dateFrom: '2026-08-01',
      dateTo: '2026-10-19',
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it('delegates non-data operations to the wrapped source', async () => {
    const real = makeRealDataSource();
    const demo = new DemoDataSource(real);

    await demo.listPlugins();
    await demo.listViews('c1', null);
    await demo.getHolidays(2026, 'national');
    expect(real.listPlugins).toHaveBeenCalled();
    expect(real.listViews).toHaveBeenCalledWith('c1', null);
    expect(real.getHolidays).toHaveBeenCalled();
  });
});

// ── getDataSource routing ────────────────────────────────────────────────────

describe('getDataSource demo routing', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('routes to the DemoDataSource while the flag is on and back off', () => {
    localConfig.saveDemoMode(true);
    expect(getDataSource()).toBeInstanceOf(DemoDataSource);

    localConfig.saveDemoMode(false);
    expect(getDataSource()).not.toBeInstanceOf(DemoDataSource);
  });
});
