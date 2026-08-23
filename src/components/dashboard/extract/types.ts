// Shared types for the ExtractPanel subcomponents.
//
// The extract API returns raw Jira issues (with a nested `fields` object) while
// the store's flattened `ExtractedIssue` shape is used after persistence. The
// preview must handle both, so these helpers read defensively.

/** Minimal Jira `fields` subset the preview actually touches. */
export interface PreviewIssueFields {
  summary?: string;
  created?: string;
  updated?: string;
  status?: { name?: string; statusCategory?: { name?: string } };
  assignee?: { displayName?: string };
}

/**
 * Union shape accepted by the extraction preview. Every field except `key` is
 * optional because the preview may receive raw Jira issues (nested `fields`)
 * or flattened `ExtractedIssue` records.
 */
export interface PreviewIssue {
  key: string;
  summary?: string;
  status?: string;
  statusCategory?: string;
  assignee?: string;
  created?: string;
  updated?: string;
  fields?: PreviewIssueFields;
}

/** A field returned by the /api/jira/fields/suggest endpoint. */
export interface DiscoveredField {
  fieldId: string;
  name: string;
  type: string;
}
