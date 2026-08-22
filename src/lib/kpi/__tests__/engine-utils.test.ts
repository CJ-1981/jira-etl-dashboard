/**
 * Engine Utils Tests
 * Regression tests for issue transformation edge cases (story points handling).
 */

import { describe, it, expect } from 'vitest';
import { transformIssueForKpi } from '../engine-utils';
import type { JiraIssue } from '../../jira/client';

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
});
