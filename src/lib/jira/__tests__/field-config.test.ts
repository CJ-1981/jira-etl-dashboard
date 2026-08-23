import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_FIELD_CONFIG,
  getFieldConfig,
  getIssueOwnerTeamField,
  getStoryPointsField,
} from '@/lib/jira/field-config';

const OVERRIDE_KEYS = [
  'JIRA_ISSUE_OWNER_TEAM_FIELD',
  'JIRA_STORY_POINTS_FIELD',
] as const;

describe('field-config', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of OVERRIDE_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of OVERRIDE_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  describe('defaults (no env overrides)', () => {
    it('returns the built-in defaults', () => {
      expect(getFieldConfig()).toEqual(DEFAULT_FIELD_CONFIG);
    });

    it('exposes the default field ids via accessors', () => {
      expect(getIssueOwnerTeamField()).toBe('customfield_10132');
      expect(getStoryPointsField()).toBe('customfield_10002');
    });
  });

  describe('env overrides', () => {
    it('overrides issueOwnerTeamField via JIRA_ISSUE_OWNER_TEAM_FIELD', () => {
      process.env.JIRA_ISSUE_OWNER_TEAM_FIELD = 'customfield_99001';
      const config = getFieldConfig();
      expect(config.issueOwnerTeamField).toBe('customfield_99001');
      // untouched fields keep their defaults
      expect(config.storyPointsField).toBe(DEFAULT_FIELD_CONFIG.storyPointsField);
      expect(config.sprintField).toBe(DEFAULT_FIELD_CONFIG.sprintField);
      expect(config.epicLinkField).toBe(DEFAULT_FIELD_CONFIG.epicLinkField);
      expect(getIssueOwnerTeamField()).toBe('customfield_99001');
    });

    it('overrides storyPointsField via JIRA_STORY_POINTS_FIELD', () => {
      process.env.JIRA_STORY_POINTS_FIELD = 'customfield_99002';
      const config = getFieldConfig();
      expect(config.storyPointsField).toBe('customfield_99002');
      expect(config.issueOwnerTeamField).toBe(
        DEFAULT_FIELD_CONFIG.issueOwnerTeamField
      );
      expect(getStoryPointsField()).toBe('customfield_99002');
    });

    it('applies both overrides together', () => {
      process.env.JIRA_ISSUE_OWNER_TEAM_FIELD = 'customfield_99001';
      process.env.JIRA_STORY_POINTS_FIELD = 'customfield_99002';
      expect(getFieldConfig()).toEqual({
        ...DEFAULT_FIELD_CONFIG,
        issueOwnerTeamField: 'customfield_99001',
        storyPointsField: 'customfield_99002',
      });
    });

    it('ignores empty-string env values and falls back to defaults', () => {
      process.env.JIRA_ISSUE_OWNER_TEAM_FIELD = '';
      process.env.JIRA_STORY_POINTS_FIELD = '';
      expect(getFieldConfig()).toEqual(DEFAULT_FIELD_CONFIG);
    });
  });
});
