/**
 * Artificial demo dataset — raw-Jira-shaped issues served by DemoDataSource.
 *
 * @MX:NOTE: Everything is generated from a fixed seed (mulberry32), so every
 * call in a session produces the identical dataset: extract previews, the
 * master dataset, and KPI fallback calculations all agree without any DB
 * round-trip. Dates anchor to "now" so the data always spans roughly the last
 * 90 days regardless of when demo mode is entered.
 *
 * @MX:REASON: The changelog is load-bearing — the processing-time / SLA /
 * time-in-status KPI plugins read status transition histories, so tickets
 * carry realistic status paths (To Do → In Progress → Done …) with
 * chronologically ordered entries, not just flat field values.
 */

/** Synthetic connectionRef used while demo mode is active. */
export const DEMO_CONNECTION_ID = 'demo';

/** Fixed seed → deterministic dataset within and across sessions. */
const SEED = 20261019;
const TICKET_COUNT = 120;
const WINDOW_DAYS = 90;

const ASSIGNEES = [
  'Alice Anderson', 'Bob Berger', 'Carla Costa', 'David Demir',
  'Elena Ebert', 'Felix Fischer', 'Gina Gross', 'Hakan Hos',
];

const TEAMS = ['Core', 'Apps', 'Platform'];

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

const ISSUE_TYPES = ['Task', 'Bug', 'Story', 'Improvement'];

const LABELS = ['demo', 'backend', 'frontend', 'infra', 'ux', 'performance'];

const COMPONENTS = ['API', 'Web', 'Relay', 'Storage', 'Docs'];

const SUMMARIES = [
  'Fix flaky extraction retry on 429 rate limits',
  'Add participants column to the extract preview table',
  'Investigate slow master dataset reload on large projects',
  'Support multi-select filters for assignee and participants',
  'Harden loopback-origin guard against header spoofing',
  'Migrate snapshot pruning to a deferred background job',
  'Document the relay setup for static deployments',
  'Reduce changelog payload size during extraction',
  'Add German holiday awareness to SLA trend widgets',
  'Refactor JQL widget evaluation into a shared module',
  'Track reassignment counts for bottleneck analysis',
  'Improve error toasts for expired API tokens',
  'Optimize SQLite chunked upserts for 10k tickets',
  'Add CSV export for custom formula plugins',
  'Cover the extract route with integration tests',
  'Align chart tooltips with the dark theme palette',
  'Cache discovered custom fields per connection',
  'Guard against path traversal in issue key lookup',
];

/** Status paths by outcome; the last entry is the ticket's current status. */
const OPEN_PATHS = [
  ['To Do'],
  ['To Do', 'In Progress'],
  ['To Do', 'In Progress', 'Blocked', 'In Progress'],
];
const DONE_PATHS = [
  ['To Do', 'In Progress', 'Done'],
  ['To Do', 'In Progress', 'In Review', 'Done'],
  ['To Do', 'Done'],
  ['To Do', 'In Progress', 'Blocked', 'In Progress', 'In Review', 'Done'],
];

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickSome<T>(rng: () => number, arr: readonly T[], max: number): T[] {
  const count = Math.floor(rng() * (max + 1));
  const out = new Set<T>();
  while (out.size < count) out.add(pick(rng, arr));
  return Array.from(out);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DemoUser {
  self: string;
  accountId: string;
  displayName: string;
  timeZone: string;
}

function demoUser(displayName: string): DemoUser {
  return {
    self: `https://demo.atlassian.net/rest/api/3/user?accountId=${encodeURIComponent(displayName)}`,
    accountId: displayName,
    displayName,
    timeZone: 'Europe/Berlin',
  };
}

/**
 * Generate the demo issue set. Two calls return deeply equal data (same seed);
 * the clock anchor only shifts the absolute dates, keeping the shape stable.
 */
export function generateDemoIssues(now: Date = new Date()): JiraIssueLike[] {
  const rng = mulberry32(SEED);
  const issues: JiraIssueLike[] = [];

  for (let i = 1; i <= TICKET_COUNT; i++) {
    const key = `DEMO-${i}`;
    const createdOffset = Math.floor(rng() * WINDOW_DAYS);
    const created = new Date(now.getTime() - createdOffset * DAY_MS - Math.floor(rng() * DAY_MS));

    const done = rng() < 0.45;
    const path = done ? pick(rng, DONE_PATHS) : pick(rng, OPEN_PATHS);

    // Transitions fill a window between `created` and at most `now` (kept a
    // minute short so updated/resolved never land in the future). Times are
    // fractions of that window — strictly increasing by construction.
    const windowStart = created.getTime();
    const spanDays = 1 + Math.floor(rng() * 15);
    const windowEnd = Math.max(
      windowStart,
      Math.min(now.getTime() - 60 * 1000, windowStart + spanDays * DAY_MS)
    );

    const histories = path.map((to, idx) => ({
      id: `${key}-h${idx}`,
      author: demoUser(pick(rng, ASSIGNEES)),
      created: new Date(
        windowStart + (windowEnd - windowStart) * ((idx + rng()) / path.length)
      ).toISOString(),
      items: [{
        field: 'status',
        fieldtype: 'jira',
        from: idx === 0 ? '' : String(idx),
        fromString: idx === 0 ? null : path[idx - 1],
        to: String(idx + 1),
        toString: to,
      }],
    }));

    const updated = new Date(histories[histories.length - 1].created);
    const resolved = done ? updated : null;
    const hasParticipants = rng() < 0.6;
    const currentStatus = path[path.length - 1];
    const statusCategory = done ? 'Done' : currentStatus === 'To Do' ? 'To Do' : 'In Progress';

    issues.push({
      key,
      self: `https://demo.atlassian.net/rest/api/3/issue/${key}`,
      fields: {
        summary: `${pick(rng, SUMMARIES)} (${key})`,
        issuetype: { name: pick(rng, ISSUE_TYPES) },
        priority: { name: pick(rng, PRIORITIES) },
        status: { name: currentStatus, statusCategory: { name: statusCategory } },
        assignee: rng() < 0.15 ? null : { displayName: pick(rng, ASSIGNEES) },
        reporter: { displayName: pick(rng, ASSIGNEES) },
        created: created.toISOString(),
        updated: updated.toISOString(),
        resolutiondate: resolved ? resolved.toISOString() : undefined,
        duedate: undefined,
        customfield_10002: rng() < 0.7 ? Math.floor(rng() * 13) + 1 : null,
        customfield_10132: { value: pick(rng, TEAMS) },
        customfield_10032: hasParticipants
          ? pickSome(rng, ASSIGNEES, 3).map(demoUser)
          : [],
        labels: pickSome(rng, LABELS, 2),
        components: pickSome(rng, COMPONENTS, 2).map(name => ({ name })),
        comment: {
          comments: rng() < 0.7 ? [{
            author: demoUser(pick(rng, ASSIGNEES)),
            created: new Date(created.getTime() + rng() * 5 * DAY_MS).toISOString(),
            body: 'Demo comment so follow-up / first-response KPIs have data.',
          }] : [],
        },
      },
      changelog: { histories },
    });
  }

  return issues;
}

/** Raw-Jira issue subset the app consumes (loose on purpose — same as the seam). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JiraIssueLike = any;
