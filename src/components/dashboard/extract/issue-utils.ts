import { PreviewIssue } from './types';
import { DEFAULT_FIELD_CONFIG } from '@/lib/jira/field-config';

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

/** Individual participant names from the multi-user field; [] if none. */
export function getParticipantNames(issue: PreviewIssue): string[] {
  const raw = issue.fields?.[DEFAULT_FIELD_CONFIG.participantsField];
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      const user = entry as { displayName?: string; name?: string };
      return user.displayName || user.name || '';
    }
    return '';
  }).filter(Boolean);
}

/** Comma-joined display names of the participants multi-user field; "" if none. */
export function getParticipants(issue: PreviewIssue): string {
  return getParticipantNames(issue).join(', ');
}

/** Resolve the project prefix of an issue key ("GE-483" → "GE"); "" if none. */
export function getProject(issue: PreviewIssue): string {
  const dash = (issue.key || '').indexOf('-');
  return dash > 0 ? issue.key.slice(0, dash) : '';
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
