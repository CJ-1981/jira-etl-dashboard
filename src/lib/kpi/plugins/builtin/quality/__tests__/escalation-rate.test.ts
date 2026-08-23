/**
 * Tests for the escalation_rate plugin:
 * - Synthetic scenarios verify raise vs lower detection from changelog history.
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import escalationRatePlugin from '@/lib/kpi/plugins/builtin/quality/escalation-rate';
import { transformIssueForKpi } from '@/lib/kpi/engine-utils';
import type { JiraIssue } from '@/lib/jira/client';
import type { KpiContext, TransformedIssue } from '@/lib/kpi/types';

const FIXTURE_PATH = path.resolve(__dirname, '../../../../../../../scratch/issues-fixture.json');
const hasFixture = fs.existsSync(FIXTURE_PATH);

function makeContext(issues: TransformedIssue[]): KpiContext {
  return {
    issues,
    holidays: {
      dates: new Set<string>(),
      regions: ['national'],
      workStartHour: 9,
      workEndHour: 17,
      isHoliday: () => false,
      isWorkingDay: () => true,
    },
    period: { start: new Date(Date.now() - 365 * 864e5), end: new Date() },
  } as unknown as KpiContext;
}

function makeRawIssue(opts: {
  key: string;
  priority?: string;
  priorityHistories?: Array<{ created: string; from: string | null; to: string | null }>;
}): JiraIssue {
  return {
    key: opts.key,
    fields: {
      summary: `Test ${opts.key}`,
      issuetype: { name: 'Task' },
      status: { name: 'In progress (OEM)', statusCategory: { name: 'In Progress' } },
      priority: { name: opts.priority ?? 'P2-Medium' },
      assignee: { displayName: 'Someone' },
      reporter: { displayName: 'Someone Else' },
      created: '2026-08-01T09:00:00',
      updated: '2026-08-01T09:00:00',
      resolutiondate: null,
      labels: [],
      comment: { comments: [] },
    },
    changelog: opts.priorityHistories
      ? {
          histories: opts.priorityHistories.map((h, i) => ({
            id: String(i),
            author: { displayName: 'Someone' },
            created: h.created,
            items: [{ field: 'priority', fromString: h.from, toString: h.to, from: h.from, to: h.to }],
          })),
        }
      : undefined,
  } as unknown as JiraIssue;
}

describe('escalation_rate', () => {
  it('counts raises and lowers separately', () => {
    const issues = [
      // Escalated twice, de-escalated once — still one escalated ticket
      transformIssueForKpi(makeRawIssue({ key: 'E-1', priorityHistories: [
        { created: '2026-08-02T09:00:00', from: 'P3-Low', to: 'P2-Medium' },
        { created: '2026-08-03T09:00:00', from: 'P2-Medium', to: 'P1-High' },
        { created: '2026-08-04T09:00:00', from: 'P1-High', to: 'P2-Medium' },
      ] })),
      // Only de-escalated
      transformIssueForKpi(makeRawIssue({ key: 'E-2', priorityHistories: [
        { created: '2026-08-02T09:00:00', from: 'P1-High', to: 'P2-Medium' },
      ] })),
      // No changelog at all
      transformIssueForKpi(makeRawIssue({ key: 'E-3' })),
    ];
    const [result] = escalationRatePlugin.calculate(makeContext(issues));

    expect(result.value).toBe(33.33); // 1 of 3
    expect(result.ticketKeys).toEqual(['E-1']);
    expect(result.details?.find((d) => d.label === 'Escalated Tickets')?.value).toBe(1);
    expect(result.details?.find((d) => d.label === 'De-escalated Tickets')?.value).toBe(2);
  });

  it('returns 0 for empty input', () => {
    const [result] = escalationRatePlugin.calculate(makeContext([]));
    expect(result.value).toBe(0);
  });
});

describe.skipIf(!hasFixture)('escalation_rate — real data smoke test', () => {
  it('runs over the fixture with consistent details', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const [result] = escalationRatePlugin.calculate(makeContext(issues));

    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    const escalated = result.details?.find((d) => d.label === 'Escalated Tickets')?.value ?? 0;
    const total = result.details?.find((d) => d.label === 'Total Tickets')?.value ?? 0;
    expect(escalated).toBe(result.ticketKeys?.length ?? 0);
    expect(total).toBe(issues.length);
    console.log(`  Escalation Rate: ${result.value}% (escalated ${escalated}/${total}, de-escalated ${result.details?.find((d) => d.label === 'De-escalated Tickets')?.value})`);
  });
});
