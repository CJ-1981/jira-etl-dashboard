import { PreviewIssue } from './types';

// Statuses treated as "resolved" when the issue has no explicit statusCategory.
const RESOLVED_STATUSES = [
  'done', 'closed', 'close', 'resolved', 'completed', 'ready to close',
];

/** Resolve the display status from either the raw or flattened shape. */
export function getStatus(issue: PreviewIssue): string {
  return issue.fields?.status?.name || issue.status || '';
}

/** Resolve the display summary from either the raw or flattened shape. */
export function getSummary(issue: PreviewIssue): string {
  return issue.fields?.summary || issue.summary || '';
}

/** Resolve the assignee display name, falling back to "Unassigned". */
export function getAssignee(issue: PreviewIssue): string {
  return issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned';
}

/** Resolve the created timestamp string, if present. */
export function getCreated(issue: PreviewIssue): string | undefined {
  return issue.fields?.created || issue.created;
}

/** Resolve the updated timestamp string, if present. */
export function getUpdated(issue: PreviewIssue): string | undefined {
  return issue.fields?.updated || issue.updated;
}

/** Whether an issue counts as resolved (done category or a done-like status). */
export function isResolved(issue: PreviewIssue): boolean {
  const status = getStatus(issue).toLowerCase();
  const category = (issue.statusCategory || '').toLowerCase();
  return category === 'done' || RESOLVED_STATUSES.includes(status);
}

/** Millisecond epoch for a timestamp string; 0 when missing/invalid. */
export function toEpoch(value: string | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}
