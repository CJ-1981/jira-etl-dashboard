/**
 * Characterization tests for the client-side widget JQL evaluation engine
 * extracted from KpiDashboard.tsx (formerly `calculateWidgetJql`'s inline
 * filtering logic + `JQL_PATTERNS`).
 *
 * These tests pin down EXISTING behavior — including known quirks that look
 * like bugs (documented inline as LATENT BUG, not fixed here; fixes belong in
 * a follow-up with their own tests).
 */
import { describe, it, expect } from 'vitest';
import {
  JQL_PATTERNS,
  normalizeIssueFieldValue,
  applyGlobalFilters,
  applyWidgetJqlQuery,
  filterIssuesForWidget,
  type WidgetEvalIssue,
} from '../jql-widget-eval';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const flat = (overrides: Partial<WidgetEvalIssue> = {}): WidgetEvalIssue => ({
  key: 'ABC-1',
  summary: 'Fix the login bug',
  description: 'Users cannot log in',
  status: 'Open',
  priority: 'High',
  assignee: 'Alice',
  labels: ['backend', 'urgent'],
  components: [{ name: 'Auth' }],
  ...overrides,
});

const nested = (fields: Record<string, unknown>, overrides: Partial<WidgetEvalIssue> = {}): WidgetEvalIssue => ({
  key: 'XYZ-9',
  fields: {
    summary: 'Nested summary text',
    description: 'Nested description',
    status: { name: 'In Progress' },
    priority: { name: 'Low' },
    assignee: { displayName: 'Bob' },
    labels: ['frontend'],
    ...fields,
  },
  ...overrides,
});

// ─── JQL_PATTERNS ────────────────────────────────────────────────────────────

describe('JQL_PATTERNS', () => {
  const ops = () => JQL_PATTERNS.map(p => p.op);

  it('exposes the six supported operators in precedence order', () => {
    expect(ops()).toEqual(['=', '!=', 'NOT CONTAINS', 'CONTAINS', 'NOT IN', 'IN']);
  });

  it('matches = and != with quoted values', () => {
    expect('status = "Done"'.match(JQL_PATTERNS[0].regex)).not.toBeNull();
    expect('status != "Done"'.match(JQL_PATTERNS[1].regex)).not.toBeNull();
  });

  it('does not match = against a != query (pattern 0 cannot cross the "!")', () => {
    expect('status != "Done"'.match(JQL_PATTERNS[0].regex)).toBeNull();
  });

  it('is case-insensitive for keyword operators', () => {
    expect('summary contains "x"'.match(JQL_PATTERNS[3].regex)).not.toBeNull();
    expect('status in (a,b)'.match(JQL_PATTERNS[5].regex)).not.toBeNull();
  });

  it('does not match unquoted values or empty quoted values', () => {
    expect(JQL_PATTERNS.some(p => 'status = Done'.match(p.regex))).toBe(false);
    expect(JQL_PATTERNS.some(p => 'status = ""'.match(p.regex))).toBe(false);
    expect(JQL_PATTERNS.some(p => 'status IN ()'.match(p.regex))).toBe(false);
  });

  // LATENT BUG: `~` (JQL CONTAINS shorthand) has no pattern, so such queries
  // silently degrade to full-text search instead of field matching.
  it('has no pattern for the ~ operator', () => {
    expect(JQL_PATTERNS.some(p => 'summary ~ "login"'.match(p.regex))).toBe(false);
  });
});

// ─── normalizeIssueFieldValue ────────────────────────────────────────────────

describe('normalizeIssueFieldValue', () => {
  it('passes null through unchanged (only objects/arrays are normalized)', () => {
    expect(normalizeIssueFieldValue(null)).toBeNull();
    expect(normalizeIssueFieldValue(undefined)).toBeUndefined();
  });

  it('passes primitives through untouched', () => {
    expect(normalizeIssueFieldValue('High')).toBe('High');
    expect(normalizeIssueFieldValue(3)).toBe(3);
    expect(normalizeIssueFieldValue(true)).toBe(true);
  });

  it('joins arrays using displayName | name | value | String fallback', () => {
    expect(
      normalizeIssueFieldValue([{ displayName: 'A' }, { name: 'B' }, { value: 'C' }, 'D'])
    ).toBe('A,B,C,D');
  });

  it('extracts displayName | name | value | key from objects', () => {
    expect(normalizeIssueFieldValue({ displayName: 'D' })).toBe('D');
    expect(normalizeIssueFieldValue({ name: 'N' })).toBe('N');
    expect(normalizeIssueFieldValue({ value: 'V' })).toBe('V');
    expect(normalizeIssueFieldValue({ key: 'K' })).toBe('K');
  });

  // LATENT BUG: `{}` and objects without any known key fall through to
  // String(rawValue) which yields '[object Object]'; comparisons then match
  // against that literal string.
  it('falls back to String(rawValue) for objects without known keys', () => {
    expect(normalizeIssueFieldValue({})).toBe('[object Object]');
    expect(normalizeIssueFieldValue({ custom: 1 })).toBe('[object Object]');
  });

  // The extraction chain uses `||`, so falsy candidates ('', null, undefined)
  // all fall through to the next candidate.
  it('skips falsy candidates in the extraction chain', () => {
    expect(normalizeIssueFieldValue({ name: '', value: 'V' })).toBe('V');
    expect(normalizeIssueFieldValue({ name: null, value: 'V' })).toBe('V');
  });
});

// ─── applyGlobalFilters ──────────────────────────────────────────────────────

describe('applyGlobalFilters', () => {
  const issues = [
    flat({ key: 'A-1', status: 'Open', assignee: 'Alice', labels: ['backend', 'urgent'] }),
    flat({ key: 'A-2', status: 'Done', assignee: 'Bob', labels: ['frontend'] }),
    nested({}, { key: 'N-1' }), // fields.status.name = 'In Progress', fields.assignee.displayName = 'Bob'
  ];

  it('returns all issues for null, undefined, or empty filters', () => {
    expect(applyGlobalFilters(issues, null)).toHaveLength(3);
    expect(applyGlobalFilters(issues, undefined)).toHaveLength(3);
    expect(applyGlobalFilters(issues, {})).toHaveLength(3);
  });

  it('skips filter keys with empty value arrays', () => {
    expect(applyGlobalFilters(issues, { status: [] })).toHaveLength(3);
  });

  it('matches flat string fields case-insensitively but WITHOUT trimming filter values', () => {
    expect(applyGlobalFilters(issues, { status: ['open'] }).map(i => i.key)).toEqual(['A-1']);
    // LATENT BUG: filter values are lowercased but not trimmed, so padded
    // values never match a trimmed issue value.
    expect(applyGlobalFilters(issues, { status: ['  done '] })).toHaveLength(0);
    expect(applyGlobalFilters(issues, { status: ['done'] }).map(i => i.key)).toEqual(['A-2']);
  });

  it('normalizes object-valued fields (name / displayName)', () => {
    expect(applyGlobalFilters(issues, { status: ['in progress'] }).map(i => i.key)).toEqual(['N-1']);
    expect(applyGlobalFilters(issues, { assignee: ['bob'] }).map(i => i.key)).toEqual(['A-2', 'N-1']);
  });

  it('matches any member of array-valued fields after comma-joining', () => {
    expect(applyGlobalFilters(issues, { labels: ['urgent'] }).map(i => i.key)).toEqual(['A-1']);
    expect(applyGlobalFilters(issues, { labels: ['frontend'] }).map(i => i.key)).toEqual(['A-2', 'N-1']);
  });

  it('ANDs multiple filter keys', () => {
    const result = applyGlobalFilters(issues, { status: ['open'], assignee: ['alice'] });
    expect(result.map(i => i.key)).toEqual(['A-1']);
    expect(applyGlobalFilters(issues, { status: ['open'], assignee: ['bob'] })).toHaveLength(0);
  });

  it('ORs multiple values within one key', () => {
    const result = applyGlobalFilters(issues, { status: ['open', 'done'] });
    expect(result.map(i => i.key)).toEqual(['A-1', 'A-2']);
  });

  it('excludes issues where the field is missing', () => {
    expect(applyGlobalFilters(issues, { nosuchfield: ['x'] })).toHaveLength(0);
  });

  // LATENT BUG: the comma-split partial match means a filter value that
  // happens to contain a comma can match a joined array field in surprising
  // ways, and single values are compared against the comma-joined whole.
  it('splits the comma-joined value for membership checks', () => {
    const joined = applyGlobalFilters(
      [flat({ key: 'J-1', labels: ['a', 'b'] })],
      { labels: ['a,b'] }
    );
    expect(joined.map(i => i.key)).toEqual(['J-1']); // matches the joined string directly
  });

  it('does not mutate the input array', () => {
    const copy = [...issues];
    applyGlobalFilters(issues, { status: ['open'] });
    expect(issues).toEqual(copy);
  });
});

// ─── applyWidgetJqlQuery: field matchers ─────────────────────────────────────

describe('applyWidgetJqlQuery — field matchers', () => {
  const issues = [
    flat({ key: 'T-1', summary: 'Login broken', status: 'Open', priority: 'High' }),
    flat({ key: 'T-2', summary: 'Login works again', status: 'Done', priority: 'Low' }),
    nested({}, { key: 'T-3' }), // fields.status.name = 'In Progress', fields.priority.name = 'Low'
  ];

  describe('= operator', () => {
    it('matches case-insensitively on flat fields', () => {
      expect(applyWidgetJqlQuery(issues, 'status = "open"').map(i => i.key)).toEqual(['T-1']);
      expect(applyWidgetJqlQuery(issues, 'status = "OPEN"').map(i => i.key)).toEqual(['T-1']);
    });

    it('normalizes object fields before comparing', () => {
      expect(applyWidgetJqlQuery(issues, 'status = "in progress"').map(i => i.key)).toEqual(['T-3']);
    });

    // LATENT BUG: field names are looked up case-sensitively against issue
    // properties, so `STATUS = "Open"` parses fine but never resolves a value
    // and silently yields an empty result instead of an error.
    it('looks field names up case-sensitively on the issue', () => {
      expect(applyWidgetJqlQuery(issues, 'STATUS = "Open"')).toHaveLength(0);
      expect(applyWidgetJqlQuery(issues, 'status = "open"').map(i => i.key)).toEqual(['T-1']);
    });
  });

  describe('!= operator', () => {
    it('keeps issues whose normalized value differs', () => {
      expect(applyWidgetJqlQuery(issues, 'status != "open"').map(i => i.key)).toEqual(['T-2', 'T-3']);
    });

    it('keeps issues where the field is entirely missing', () => {
      expect(applyWidgetJqlQuery(issues, 'nosuchfield != "x"').map(i => i.key)).toEqual(['T-1', 'T-2', 'T-3']);
    });
  });

  describe('CONTAINS / NOT CONTAINS operators', () => {
    it('CONTAINS performs case-insensitive substring matching', () => {
      expect(applyWidgetJqlQuery(issues, 'summary CONTAINS "login"').map(i => i.key)).toEqual(['T-1', 'T-2']);
      expect(applyWidgetJqlQuery(issues, 'summary contains "BROKEN"').map(i => i.key)).toEqual(['T-1']);
    });

    it('NOT CONTAINS is the complement', () => {
      expect(applyWidgetJqlQuery(issues, 'summary NOT CONTAINS "login"').map(i => i.key)).toEqual(['T-3']);
    });

    it('matches inside comma-joined array fields', () => {
      const withLabels = [flat({ key: 'L-1', labels: ['backend', 'urgent'] })];
      expect(applyWidgetJqlQuery(withLabels, 'labels CONTAINS "urge"').map(i => i.key)).toEqual(['L-1']);
    });
  });

  describe('IN / NOT IN operators', () => {
    it('IN matches any listed value case-insensitively', () => {
      expect(applyWidgetJqlQuery(issues, 'status IN (Open, Done)').map(i => i.key)).toEqual(['T-1', 'T-2']);
      expect(applyWidgetJqlQuery(issues, 'status in (open,done)').map(i => i.key)).toEqual(['T-1', 'T-2']);
    });

    it('IN strips surrounding double and single quotes from list items', () => {
      expect(applyWidgetJqlQuery(issues, 'status IN ("Open", "Done")').map(i => i.key)).toEqual(['T-1', 'T-2']);
      expect(applyWidgetJqlQuery(issues, "status IN ('Open')").map(i => i.key)).toEqual(['T-1']);
    });

    it('NOT IN is the complement', () => {
      expect(applyWidgetJqlQuery(issues, 'status NOT IN (open, done)').map(i => i.key)).toEqual(['T-3']);
    });

    it('works on normalized object fields', () => {
      expect(applyWidgetJqlQuery(issues, 'priority IN (high)').map(i => i.key)).toEqual(['T-1']);
      expect(applyWidgetJqlQuery(issues, 'priority IN (low)').map(i => i.key)).toEqual(['T-2', 'T-3']);
    });
  });

  describe('field resolution fallback', () => {
    it('prefers flat properties over fields.* when both exist', () => {
      const both = flat({ key: 'B-1', status: 'FlatStatus', fields: { status: 'NestedStatus' } });
      expect(applyWidgetJqlQuery([both], 'status = "FlatStatus"').map(i => i.key)).toEqual(['B-1']);
      expect(applyWidgetJqlQuery([both], 'status = "NestedStatus"')).toHaveLength(0);
    });

    // Characterization of `issue[field] ?? issue.fields?.[field]`: an explicit
    // null on the flat shape falls through to fields.* (?? treats null like undefined).
    it('falls through to fields.* when the flat property is null', () => {
      const nullFlat = flat({ key: 'B-2', status: null as unknown as string, fields: { status: 'FromFields' } });
      expect(applyWidgetJqlQuery([nullFlat], 'status = "FromFields"').map(i => i.key)).toEqual(['B-2']);
    });
  });

  describe('pattern precedence edge cases', () => {
    it('does not misparse field names merely containing "not" as a substring', () => {
      // \s+ is required between field and keyword, so 'knotfound CONTAINS'
      // parses as CONTAINS on field 'knotfound', not NOT CONTAINS on 'k'.
      const q = 'knotfound CONTAINS "x"';
      expect(q.match(JQL_PATTERNS[2].regex)).toBeNull(); // NOT CONTAINS
      const containsMatch = q.match(JQL_PATTERNS[3].regex);
      expect(containsMatch?.[1]).toBe('knotfound');
    });

    it('parses the NOT-variant when the field word is literally separate', () => {
      const q = 'x NOT CONTAINS "y"';
      const match = q.match(JQL_PATTERNS[2].regex);
      expect(match?.[1]).toBe('x');
      expect(match?.[2]).toBe('y');
      // And NOT IN wins over IN thanks to ordering.
      const notIn = 'a NOT IN (x)'.match(JQL_PATTERNS[4].regex);
      expect(notIn?.[1]).toBe('a');
    });

    // Only the FIRST matching pattern is used; later clauses are ignored.
    it('only evaluates the first matching pattern (compound queries unsupported)', () => {
      const q = 'status = "Open" AND priority = "High"';
      const result = applyWidgetJqlQuery(issues, q);
      // Matches `status = "Open"` only; the AND clause is silently dropped.
      expect(result.map(i => i.key)).toEqual(['T-1']);
    });
  });
});

// ─── applyWidgetJqlQuery: fallback full-text search ──────────────────────────

describe('applyWidgetJqlQuery — full-text fallback', () => {
  const issues = [
    flat({ key: 'FT-1', summary: 'Login broken', description: 'Users cannot log in' }),
    flat({ key: 'FT-2', summary: 'Dashboard slow', description: 'Perf issue' }),
    nested({}, { key: 'FT-3' }), // fields.summary = 'Nested summary text'
  ];

  it('searches summary, key, and description case-insensitively', () => {
    expect(applyWidgetJqlQuery(issues, 'login').map(i => i.key)).toEqual(['FT-1']);
    expect(applyWidgetJqlQuery(issues, 'FT-2').map(i => i.key)).toEqual(['FT-2']);
    expect(applyWidgetJqlQuery(issues, 'PERF').map(i => i.key)).toEqual(['FT-2']);
  });

  it('searches nested fields.* summary and description', () => {
    expect(applyWidgetJqlQuery(issues, 'nested summary').map(i => i.key)).toEqual(['FT-3']);
  });

  it('does not search arbitrary fields (only summary/key/description)', () => {
    expect(applyWidgetJqlQuery(issues, 'Open')).toHaveLength(0); // status value, not in searched text
  });

  // LATENT BUG: ~ queries degrade to full-text search with the WHOLE query
  // string (operators, quotes and all) as the needle, which almost never
  // matches anything.
  it('~ queries fall back to text search using the raw query as needle', () => {
    expect(applyWidgetJqlQuery(issues, 'summary ~ "login"')).toHaveLength(0);
    // The raw string only matches if that exact text appears verbatim.
    const withLiteral = flat({ key: 'FT-4', summary: 'weird summary ~ "login" text' });
    expect(applyWidgetJqlQuery([withLiteral], 'summary ~ "login"').map(i => i.key)).toEqual(['FT-4']);
  });

  it('falls back for unquoted field queries', () => {
    expect(applyWidgetJqlQuery(issues, 'status = Open')).toHaveLength(0);
  });

  it('an empty/whitespace query matches everything ("".includes is always true)', () => {
    expect(applyWidgetJqlQuery(issues, '')).toHaveLength(3);
    expect(applyWidgetJqlQuery(issues, '   ')).toHaveLength(3);
  });
});

// ─── filterIssuesForWidget (pipeline + modes) ────────────────────────────────

describe('filterIssuesForWidget', () => {
  const issues = [
    flat({ key: 'W-1', summary: 'alpha one', status: 'Open', assignee: 'Alice' }),
    flat({ key: 'W-2', summary: 'beta two', status: 'Done', assignee: 'Bob' }),
    flat({ key: 'W-3', summary: 'gamma three', status: 'Open', assignee: 'Bob' }),
  ];
  const global = { status: ['open'] };

  it('returns all issues when the filter is disabled', () => {
    expect(filterIssuesForWidget(issues, { enabled: false, query: 'alpha', mode: 'refine' }, global)).toHaveLength(3);
    expect(filterIssuesForWidget(issues, { enabled: false, query: '', mode: 'override' }, global)).toHaveLength(3);
  });

  it('enabled + empty query: refine still applies global filters, override keeps everything', () => {
    expect(filterIssuesForWidget(issues, { enabled: true, query: '', mode: 'refine' }, global).map(i => i.key)).toEqual(['W-1', 'W-3']);
    expect(filterIssuesForWidget(issues, { enabled: true, query: '', mode: 'override' }, global)).toHaveLength(3);
  });

  it('refine mode applies global filters first, then the widget query (AND semantics)', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'alpha', mode: 'refine' }, global);
    expect(result.map(i => i.key)).toEqual(['W-1']);
  });

  it('refine mode with a global filter that excludes everything yields empty even if query would match', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'beta', mode: 'refine' }, global);
    expect(result).toHaveLength(0);
  });

  it('override mode skips global filters entirely', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'beta', mode: 'override' }, global);
    expect(result.map(i => i.key)).toEqual(['W-2']);
  });

  it('override mode with field JQL starts from the full dataset', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'status = "done"', mode: 'override' }, global);
    expect(result.map(i => i.key)).toEqual(['W-2']);
  });

  it('refine mode combines field JQL with global filters', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'assignee = "bob"', mode: 'refine' }, global);
    expect(result.map(i => i.key)).toEqual(['W-3']);
  });

  it('treats null/undefined globalFilters as no global filtering in refine mode', () => {
    expect(filterIssuesForWidget(issues, { enabled: true, query: 'beta', mode: 'refine' }, null).map(i => i.key)).toEqual(['W-2']);
    expect(filterIssuesForWidget(issues, { enabled: true, query: 'beta', mode: 'refine' }, undefined).map(i => i.key)).toEqual(['W-2']);
  });

  // Characterization: mode is compared with !== 'override', so any unexpected
  // mode value behaves like refine.
  it('unknown mode values behave like refine (mode !== "override" check)', () => {
    const weirdMode = 'something-else' as unknown as 'refine';
    const result = filterIssuesForWidget(issues, { enabled: true, query: 'alpha', mode: weirdMode }, global);
    expect(result.map(i => i.key)).toEqual(['W-1']);
  });

  it('whitespace-only query with refine mode still applies global filters', () => {
    const result = filterIssuesForWidget(issues, { enabled: true, query: '   ', mode: 'refine' }, global);
    expect(result.map(i => i.key)).toEqual(['W-1', 'W-3']);
  });

  it('does not mutate the input issue array', () => {
    const copy = [...issues];
    filterIssuesForWidget(issues, { enabled: true, query: 'status = "open"', mode: 'refine' }, global);
    expect(issues).toEqual(copy);
  });
});
