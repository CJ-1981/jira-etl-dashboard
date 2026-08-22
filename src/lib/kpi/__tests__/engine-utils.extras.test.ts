import { describe, it, expect } from 'vitest';
import {
  transformIssueForKpi,
  isIssueDone,
  applyFilter,
  splitByTopLevelOperator,
  getFieldValue,
  getAgeCategory,
  getPriorityOrder,
} from '../engine-utils';
import type { JiraIssue } from '../../jira/client';
import type { TransformedIssue } from '../types';

// Minimal JiraIssue builder (only the fields transformIssueForKpi reads).
function mkIssue(overrides: { fields?: Record<string, unknown>; changelog?: any } = {}, key = 'PROJ-1'): JiraIssue {
  return {
    key,
    fields: {
      summary: 'A bug',
      issuetype: { name: 'Bug' },
      priority: { name: 'High' },
      status: { name: 'Open', statusCategory: { name: 'To Do' } },
      assignee: { displayName: 'Alice' },
      reporter: { displayName: 'Bob' },
      created: '2024-01-01T09:00:00.000Z',
      updated: '2024-01-05T09:00:00.000Z',
      labels: ['backend'],
      components: [{ name: 'API' }],
      ...overrides.fields,
    },
    changelog: overrides.changelog,
  } as unknown as JiraIssue;
}

function mkTransformed(o: Partial<TransformedIssue>): TransformedIssue {
  return {
    key: 'X', project: 'P', summary: '', issueType: '', priority: null,
    status: 'Open', statusCategory: 'To Do', assignee: '', reporter: '',
    created: new Date(), updated: new Date(), resolved: null, dueDate: null,
    storyPoints: null, labels: [], components: [], transitions: [], timeInStatus: {}, comments: [],
    ...o,
  } as TransformedIssue;
}

describe('transformIssueForKpi', () => {
  it('builds a TransformedIssue (no transitions, no comments)', () => {
    const t = transformIssueForKpi(mkIssue({}, 'T1'));
    expect(t.key).toBe('T1');
    expect(t.status).toBe('Open');
    expect(t.project).toBe('T1'.split('-')[0]); // 'T1' -> 'T1'
    expect(t.assignee).toBe('Alice');
    expect(t.transitions).toEqual([]);
    expect(t.comments).toEqual([]);
    expect(t.timeInStatus['Open']).toBeGreaterThan(0);
    expect(t.resolved).toBeNull();
  });

  it('extracts + sorts status transitions and computes time-in-status', () => {
    const issue = mkIssue({
      fields: { resolutiondate: '2024-01-10T09:00:00.000Z' },
      changelog: {
        histories: [
          // intentionally reversed to exercise the chronological sort
          { author: { displayName: 'Bob' }, created: '2024-01-07T09:00:00.000Z', items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }] },
          { author: { displayName: 'Bob' }, created: '2024-01-03T09:00:00.000Z', items: [{ field: 'status', fromString: 'Open', toString: 'In Progress' }] },
        ],
      },
    }, 'T2');
    const t = transformIssueForKpi(issue);
    expect(t.transitions.map(tr => tr.toStatus)).toEqual(['In Progress', 'Done']);
    expect(t.timeInStatus['Open']).toBeGreaterThan(0);
    expect(t.timeInStatus['In Progress']).toBeGreaterThan(0);
    expect(t.timeInStatus['Done']).toBeGreaterThanOrEqual(0);
    expect(t.resolved).toBeInstanceOf(Date);
  });

  it('parses + chronologically sorts comments', () => {
    const issue = mkIssue({
      fields: { comment: { comments: [
        { author: { displayName: 'C' }, created: '2024-01-05T09:00:00.000Z' },
        { author: { displayName: 'A' }, created: '2024-01-02T09:00:00.000Z' },
      ] } },
    }, 'T3');
    const t = transformIssueForKpi(issue);
    expect(t.comments.map(c => c.author)).toEqual(['A', 'C']);
  });

  it('returns the cached object on a second call with the same key+updated', () => {
    const issue = mkIssue({}, 'T4');
    const first = transformIssueForKpi(issue);
    const second = transformIssueForKpi(issue);
    expect(second).toBe(first);
  });

  it('falls back to top-level (issue as any) accessors when structured fields are absent', () => {
    // status is always present in real Jira payloads (used unguarded on the
    // no-transitions path); the other fields are left absent to exercise the
    // `|| (issue as any).X` fallback branches.
    const issue = { key: 'T5', fields: { status: { name: 'Open', statusCategory: { name: 'To Do' } } } } as any;
    issue.summary = 'Plain'; issue.issueType = 'Task';
    issue.assignee = 'Me'; issue.storyPoints = 3; issue.labels = ['l']; issue.components = ['c'];
    const t = transformIssueForKpi(issue);
    expect(t.summary).toBe('Plain');
    expect(t.issueType).toBe('Task');
    expect(t.status).toBe('Open');
    expect(t.assignee).toBe('Me');
    expect(t.storyPoints).toBe(3);
    expect(t.labels).toEqual(['l']);
    expect(t.components).toEqual(['c']);
  });
});

describe('isIssueDone', () => {
  it('is done when resolved', () => expect(isIssueDone(mkTransformed({ resolved: new Date() }))).toBe(true));
  it('is done when statusCategory is done', () => expect(isIssueDone(mkTransformed({ statusCategory: 'Done' }))).toBe(true));
  it('is done for terminal status names (case-insensitive)', () => {
    for (const s of ['Done', 'closed', 'RESOLVED', 'Completed', 'Close', 'Ready to Close']) {
      expect(isIssueDone(mkTransformed({ status: s }))).toBe(true);
    }
  });
  it('is not done otherwise', () => expect(isIssueDone(mkTransformed({ status: 'In Progress' }))).toBe(false));
});

describe('applyFilter (DSL)', () => {
  const issues = (): TransformedIssue[] => ([
    mkTransformed({ key: 'A', summary: 'fix login', priority: 'High', status: 'Open', assignee: 'Alice', labels: ['backend'], storyPoints: 5 }),
    mkTransformed({ key: 'B', summary: 'add report', priority: 'Low', status: 'Done', statusCategory: 'Done', assignee: 'Bob', labels: ['frontend'], resolved: new Date(), timeInStatus: { Done: 10 } }),
  ]);

  it('passes everything through for empty / true / *', () => {
    for (const c of ['', 'true', '*']) expect(applyFilter(issues(), c)).toHaveLength(2);
  });
  it('CONTAINS quoted (double)', () => expect(applyFilter(issues(), 'summary CONTAINS "login"')).toHaveLength(1));
  it('CONTAINS quoted (single)', () => expect(applyFilter(issues(), "assignee CONTAINS 'Alice'")).toHaveLength(1));
  it('NOT CONTAINS (unquoted value)', () => expect(applyFilter(issues(), 'status NOT CONTAINS Done')).toHaveLength(1));
  it('== scalar', () => expect(applyFilter(issues(), 'status == Done')).toHaveLength(1));
  it('== true (truthy field)', () => expect(applyFilter(issues(), 'resolved == true')).toHaveLength(1));
  it('== false (falsy field)', () => expect(applyFilter(issues(), 'resolved == false')).toHaveLength(1));
  it('!= scalar', () => expect(applyFilter(issues(), 'status != Done')).toHaveLength(1));
  it('IN (scalar field)', () => expect(applyFilter(issues(), 'status IN (Open, Done)')).toHaveLength(2));
  it('NOT IN (scalar field)', () => expect(applyFilter(issues(), 'status NOT IN (Done)')).toHaveLength(1));
  it('IN (array field, any-element match)', () => expect(applyFilter(issues(), 'labels IN (backend, other)')).toHaveLength(1));
  it('IN with quoted values', () => expect(applyFilter(issues(), 'priority IN ("High", "Low")')).toHaveLength(2));
  it('AND composition', () => expect(applyFilter(issues(), 'status == Done AND assignee == Bob')).toHaveLength(1));
  it('OR composition (dedupes)', () => expect(applyFilter(issues(), 'status == Open OR status == Done')).toHaveLength(2));
  it('unrecognized condition returns all', () => expect(applyFilter(issues(), 'nonsense expression')).toHaveLength(2));
});

describe('splitByTopLevelOperator', () => {
  it('splits AND while ignoring the operator inside quotes', () => {
    expect(splitByTopLevelOperator('a == "x AND y" AND b == c', 'AND')).toEqual(['a == "x AND y"', 'b == c']);
  });
  it('splits OR while ignoring the operator inside single quotes', () => {
    expect(splitByTopLevelOperator("status == 'Open' OR status == 'Done'", 'OR')).toEqual(["status == 'Open'", "status == 'Done'"]);
  });
  it('returns a single part when the operator is absent', () => {
    expect(splitByTopLevelOperator('status == Done', 'AND')).toEqual(['status == Done']);
  });
});

describe('getFieldValue', () => {
  const issue = { timeInStatus: { Done: 5 }, storyPoints: 8, status: 'Open', labels: ['a'] } as any;
  it('reads timeInStatus.<status>', () => expect(getFieldValue(issue, 'timeInStatus.Done')).toBe(5));
  it('reads a mapped field', () => expect(getFieldValue(issue, 'storyPoints')).toBe(8));
  it('returns 0 for an unknown timeInStatus status', () => expect(getFieldValue(issue, 'timeInStatus.Missing')).toBe(0));
  it('returns null for an unknown field', () => expect(getFieldValue(issue, 'nope')).toBeNull());
});

describe('getAgeCategory', () => {
  const ref = new Date('2024-01-15T00:00:00Z');
  it('classifies this_week / last_week / existing', () => {
    expect(getAgeCategory('2024-01-13T00:00:00Z', ref)).toBe('this_week');
    expect(getAgeCategory('2024-01-06T00:00:00Z', ref)).toBe('last_week');
    expect(getAgeCategory('2023-12-01T00:00:00Z', ref)).toBe('existing');
  });
  it('clamps a negative (future) delta to this_week', () => {
    expect(getAgeCategory('2024-02-01T00:00:00Z', new Date('2024-01-01T00:00:00Z'))).toBe('this_week');
  });
});

describe('getPriorityOrder', () => {
  it('empty -> 999', () => expect(getPriorityOrder('')).toBe(999));
  it('exact mapped names', () => {
    expect(getPriorityOrder('Highest')).toBe(0);
    expect(getPriorityOrder('High')).toBe(1);
    expect(getPriorityOrder('Medium')).toBe(2);
    expect(getPriorityOrder('Low')).toBe(3);
    expect(getPriorityOrder('Lowest')).toBe(4);
  });
  it('case-insensitive normalized lookup', () => expect(getPriorityOrder('medium')).toBe(2));
  it('P<n> regex fallback', () => {
    expect(getPriorityOrder('P5')).toBe(5);
    expect(getPriorityOrder('p3')).toBe(3);
  });
  it('textual fallbacks (high-not-highest / low+lowest / medium)', () => {
    expect(getPriorityOrder('very high')).toBe(1);
    expect(getPriorityOrder('super lowest')).toBe(4);
    expect(getPriorityOrder('kinda medium')).toBe(2);
  });
  it('unrecognized -> 999', () => expect(getPriorityOrder('foobar')).toBe(999));
  it('unassigned / unknown sentinels', () => {
    expect(getPriorityOrder('unassigned')).toBe(999);
    expect(getPriorityOrder('Unknown')).toBe(998);
  });
});
