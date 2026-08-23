/**
 * Engine Utils Tests
 * Regression tests for issue transformation edge cases (story points handling).
 */

import { describe, it, expect } from 'vitest';
import { transformIssueForKpi } from '../engine-utils';
import type { JiraIssue } from '../../jira/client';
import type { FlatIssue } from '../types';

function makeIssue(overrides: Partial<JiraIssue> & { fields?: Partial<JiraIssue['fields']> } = {}): JiraIssue {
  const { fields, ...rest } = overrides;
  return {
    key: 'TEST-1',
    self: 'https://example.atlassian.net/rest/api/2/issue/1',
    fields: {
      summary: 'Test issue',
      issuetype: { name: 'Story' },
      status: { name: 'Open', statusCategory: { name: 'To Do' } },
      created: '2026-02-02T09:00:00.000+0000',
      updated: '2026-02-02T10:00:00.000+0000',
      ...fields,
    },
    ...rest,
  };
}

describe('transformIssueForKpi', () => {
  describe('storyPoints extraction', () => {
    it('should keep a story points value of 0 instead of turning it into null', () => {
      // Unique key so the transform cache does not shadow the result
      const issue = makeIssue({ key: 'TEST-SP0' });
      issue.fields.customfield_10002 = 0;
      const result = transformIssueForKpi(issue);
      expect(result.storyPoints).toBe(0);
    });

    it('should extract positive story points', () => {
      const issue = makeIssue({ key: 'TEST-SP5' });
      issue.fields.customfield_10002 = 5;
      const result = transformIssueForKpi(issue);
      expect(result.storyPoints).toBe(5);
    });

    it('should fall back to the top-level storyPoints property when the custom field is missing', () => {
      const issue = makeIssue({ key: 'TEST-SP-FALLBACK' });
      (issue as any).storyPoints = 3;
      const result = transformIssueForKpi(issue);
      expect(result.storyPoints).toBe(3);
    });

    it('should keep 0 from the top-level storyPoints fallback', () => {
      const issue = makeIssue({ key: 'TEST-SP-FALLBACK-0' });
      (issue as any).storyPoints = 0;
      const result = transformIssueForKpi(issue);
      expect(result.storyPoints).toBe(0);
    });

    it('should return null when no story points are present', () => {
      const issue = makeIssue({ key: 'TEST-SP-NONE' });
      const result = transformIssueForKpi(issue);
      expect(result.storyPoints).toBeNull();
    });
  });

  describe('dual input-shape support (JiraIssue vs FlatIssue)', () => {
    // transformIssueForKpi accepts two shapes: a real Jira issue
    // ({ fields: { ... } }) and a flat normalized issue (top-level
    // summary/status/resolved/... e.g. webhook/master-derived). Equivalent
    // data in either shape must produce an equivalent TransformedIssue.

    function jiraShaped(): JiraIssue {
      return {
        key: 'DUAL-1',
        self: 'https://example.atlassian.net/rest/api/2/issue/1',
        fields: {
          summary: 'Dual shape issue',
          issuetype: { name: 'Bug' },
          priority: { name: 'High' },
          status: { name: 'Done', statusCategory: { name: 'Done' } },
          assignee: { displayName: 'Alice', emailAddress: 'alice@example.com' },
          reporter: { displayName: 'Bob', emailAddress: 'bob@example.com' },
          created: '2026-03-01T09:00:00.000Z',
          updated: '2026-03-05T09:00:00.000Z',
          resolutiondate: '2026-03-04T09:00:00.000Z',
          duedate: '2026-03-10T00:00:00.000Z',
          customfield_10002: 5,
          labels: ['backend'],
          components: [{ name: 'API' }],
        },
      };
    }

    function flatShaped(): FlatIssue {
      return {
        key: 'DUAL-1',
        summary: 'Dual shape issue',
        issueType: 'Bug',
        priority: 'High',
        status: 'Done',
        statusCategory: 'Done',
        assignee: 'Alice',
        reporter: 'Bob',
        created: '2026-03-01T09:00:00.000Z',
        updated: '2026-03-05T09:00:00.000Z',
        resolved: '2026-03-04T09:00:00.000Z',
        dueDate: '2026-03-10T00:00:00.000Z',
        storyPoints: 5,
        labels: ['backend'],
        components: ['API'],
      };
    }

    it('transforms a Jira-shaped issue', () => {
      const t = transformIssueForKpi(jiraShaped());
      expect(t.key).toBe('DUAL-1');
      expect(t.summary).toBe('Dual shape issue');
      expect(t.issueType).toBe('Bug');
      expect(t.priority).toBe('High');
      expect(t.status).toBe('Done');
      expect(t.statusCategory).toBe('Done');
      expect(t.assignee).toBe('Alice');
      expect(t.reporter).toBe('Bob');
      expect(t.storyPoints).toBe(5);
      expect(t.labels).toEqual(['backend']);
      expect(t.components).toEqual(['API']);
      expect(t.resolved).toBeInstanceOf(Date);
      expect(t.dueDate).toBeInstanceOf(Date);
    });

    it('transforms a flat-shaped issue', () => {
      const t = transformIssueForKpi(flatShaped());
      expect(t.key).toBe('DUAL-1');
      expect(t.summary).toBe('Dual shape issue');
      expect(t.issueType).toBe('Bug');
      expect(t.priority).toBe('High');
      expect(t.status).toBe('Done');
      expect(t.statusCategory).toBe('Done');
      expect(t.assignee).toBe('Alice');
      expect(t.reporter).toBe('Bob');
      expect(t.storyPoints).toBe(5);
      expect(t.labels).toEqual(['backend']);
      expect(t.components).toEqual(['API']);
      expect(t.resolved).toBeInstanceOf(Date);
      expect(t.dueDate).toBeInstanceOf(Date);
    });

    it('produces identical scalar/date output for equivalent jira- and flat-shaped input', () => {
      const fromJira = transformIssueForKpi(jiraShaped());
      const fromFlat = transformIssueForKpi(flatShaped());

      expect(fromFlat.key).toBe(fromJira.key);
      expect(fromFlat.project).toBe(fromJira.project);
      expect(fromFlat.summary).toBe(fromJira.summary);
      expect(fromFlat.issueType).toBe(fromJira.issueType);
      expect(fromFlat.priority).toBe(fromJira.priority);
      expect(fromFlat.status).toBe(fromJira.status);
      expect(fromFlat.statusCategory).toBe(fromJira.statusCategory);
      expect(fromFlat.assignee).toBe(fromJira.assignee);
      expect(fromFlat.reporter).toBe(fromJira.reporter);
      expect(fromFlat.issueOwnerTeam).toBe(fromJira.issueOwnerTeam);
      expect(fromFlat.storyPoints).toBe(fromJira.storyPoints);
      expect(fromFlat.labels).toEqual(fromJira.labels);
      expect(fromFlat.components).toEqual(fromJira.components);
      expect(fromFlat.created.getTime()).toBe(fromJira.created.getTime());
      expect(fromFlat.updated.getTime()).toBe(fromJira.updated.getTime());
      expect(fromFlat.resolved?.getTime()).toBe(fromJira.resolved?.getTime());
      expect(fromFlat.dueDate?.getTime()).toBe(fromJira.dueDate?.getTime());
    });

    it('flat shape keeps a story points value of 0', () => {
      const flat = flatShaped();
      flat.key = 'DUAL-SP0';
      flat.storyPoints = 0;
      expect(transformIssueForKpi(flat).storyPoints).toBe(0);
    });

    it('flat shape defaults missing optional fields', () => {
      const t = transformIssueForKpi({ key: 'DUAL-MIN' });
      expect(t.summary).toBe('No Summary');
      expect(t.issueType).toBe('Task');
      expect(t.priority).toBeNull();
      expect(t.status).toBe('Unknown');
      expect(t.statusCategory).toBe('Unknown');
      expect(t.assignee).toBe('Unassigned');
      expect(t.reporter).toBe('Unknown');
      expect(t.issueOwnerTeam).toBeNull();
      expect(t.storyPoints).toBeNull();
      expect(t.labels).toEqual([]);
      expect(t.components).toEqual([]);
      expect(t.resolved).toBeNull();
      expect(t.dueDate).toBeNull();
    });
  });
});
