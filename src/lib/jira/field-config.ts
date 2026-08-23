/**
 * JIRA Field Configuration
 * Central configuration for custom field IDs
 */

export interface JiraFieldConfig {
  storyPointsField: string;
  issueOwnerTeamField: string;
  sprintField: string;
  epicLinkField: string;
}

/**
 * Default field mappings (can be overridden per JIRA instance)
 */
export const DEFAULT_FIELD_CONFIG: JiraFieldConfig = {
  storyPointsField: 'customfield_10002',
  issueOwnerTeamField: 'customfield_10132', // Issue Owner Team (LTIC) - select field
  sprintField: 'customfield_10020',
  epicLinkField: 'customfield_10014',
};

/**
 * Get field configuration from environment or defaults
 * Override by setting JIRA_ISSUE_OWNER_TEAM_FIELD / JIRA_STORY_POINTS_FIELD
 * env vars (server-side, via .env — see .env.example).
 */
export function getFieldConfig(): JiraFieldConfig {
  return {
    ...DEFAULT_FIELD_CONFIG,
    // Allow override via environment variable
    ...(process.env.JIRA_ISSUE_OWNER_TEAM_FIELD && {
      issueOwnerTeamField: process.env.JIRA_ISSUE_OWNER_TEAM_FIELD
    }),
    ...(process.env.JIRA_STORY_POINTS_FIELD && {
      storyPointsField: process.env.JIRA_STORY_POINTS_FIELD
    }),
  };
}

/**
 * Get the Issue Owner Team field ID
 */
export function getIssueOwnerTeamField(): string {
  return getFieldConfig().issueOwnerTeamField;
}

/**
 * Get the Story Points field ID
 */
export function getStoryPointsField(): string {
  return getFieldConfig().storyPointsField;
}
