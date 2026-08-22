import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JiraClient,
  extractSelectFieldValue,
  transformIssue,
} from '@/lib/jira/client';
import type { JiraIssue, JiraChangelogItem } from '@/lib/jira/client';

// ───────────────────────── helpers ─────────────────────────

/** Build a fetch Response-shaped mock object. */
function res(
  body: unknown,
  init: { status?: number; statusText?: string } = {}
) {
  const status = init.status ?? 200;
  const ok = status >= 200 && status < 300;
  const textPayload =
    typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText: init.statusText ?? (ok ? 'OK' : 'Error'),
    json: vi.fn(async () => body),
    text: vi.fn(async () => textPayload),
  } as unknown as Response;
}

const baseConfig = {
  baseUrl: 'https://test.atlassian.net',
  email: 'a@b.com',
  apiToken: 'tok',
  projectKeys: ['TEST'],
};

/** Parse the JSON body of the Nth fetch call. */
function callBody(i: number, fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls[i];
  return JSON.parse(String((call[1] as RequestInit).body));
}

/** The Basic auth header the client must build for email:token. */
function expectedAuth(email: string, token: string) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

// ───────────────────────── shared setup ─────────────────────────

let client: JiraClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  client = new JiraClient({ ...baseConfig });
  // Silence the client's chatty console output during tests.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ───────────────────────── constructor / headers ─────────────────────────

describe('JiraClient constructor + auth headers', () => {
  it('normalizes baseUrl: adds https:// when missing and strips trailing slash', async () => {
    const c = new JiraClient({
      baseUrl: 'test.atlassian.net/',
      email: 'a@b.com',
      apiToken: 'tok',
      projectKeys: ['TEST'],
    });
    fetchMock.mockResolvedValue(res({ key: 'TEST-1', fields: {} }));
    await c.getIssue('TEST-1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/issue/TEST-1'
    );
  });

  it('preserves an http:// protocol and strips the trailing slash', async () => {
    const c = new JiraClient({
      baseUrl: 'http://localhost:8080/',
      email: 'a@b.com',
      apiToken: 'tok',
      projectKeys: ['TEST'],
    });
    fetchMock.mockResolvedValue(res({ key: 'TEST-1', fields: {} }));
    await c.getIssue('TEST-1');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/rest/api/3/issue/TEST-1'
    );
  });

  it('builds a Basic auth header from email:apiToken on every request', async () => {
    fetchMock.mockResolvedValue(res({ key: 'TEST-1', fields: {} }));
    await client.getIssue('TEST-1');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe(expectedAuth('a@b.com', 'tok'));
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('applies default field mapping when none is provided', async () => {
    fetchMock.mockResolvedValue(
      res({ issues: [], total: 0, maxResults: 100, startAt: 0 })
    );
    await client.extractIssues('project = "TEST"', { maxRequestsPerMinute: 0 });
    const body = callBody(0, fetchMock);
    expect(body.fields).toContain('customfield_10002'); // story points
    expect(body.fields).toContain('customfield_10132'); // issue owner team
  });

  it('honors a custom field mapping override', async () => {
    const c = new JiraClient(
      { ...baseConfig },
      { storyPointsField: 'customfield_99999', issueOwnerTeamField: 'customfield_88888' }
    );
    fetchMock.mockResolvedValue(
      res({ issues: [], total: 0, maxResults: 100, startAt: 0 })
    );
    await c.extractIssues('project = "TEST"', { maxRequestsPerMinute: 0 });
    const body = callBody(0, fetchMock);
    expect(body.fields).toContain('customfield_99999');
    expect(body.fields).toContain('customfield_88888');
  });
});

// ───────────────────────── testConnection ─────────────────────────

describe('testConnection', () => {
  it('returns success + serverInfo when serverInfo, myself, and search all succeed', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ serverTitle: 'Jira', version: '1001' })) // /serverInfo
      .mockResolvedValueOnce(res({ displayName: 'Alice' })) // /myself
      .mockResolvedValueOnce(res({ issues: [], total: 0 })); // /search

    const result = await client.testConnection();
    expect(result.success).toBe(true);
    expect(result.serverInfo).toEqual({ serverTitle: 'Jira', version: '1001' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/serverInfo'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://test.atlassian.net/rest/api/3/myself'
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://test.atlassian.net/rest/api/3/search'
    );
    // search is a POST with a key-only JQL
    const searchOpts = fetchMock.mock.calls[2][1] as RequestInit;
    expect(searchOpts.method).toBe('POST');
    expect(JSON.parse(String(searchOpts.body)).jql).toBe('key = "NONEXISTENT-123"');
  });

  it('fails fast when serverInfo is not ok', async () => {
    fetchMock.mockResolvedValueOnce(res({}, { status: 502, statusText: 'Bad Gateway' }));
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Server unavailable \(HTTP 502/);
  });

  it('returns an auth-failed message when /myself responds 401', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ version: '1' })) // serverInfo ok
      .mockResolvedValueOnce(res({}, { status: 401 }));
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Authentication failed \(401\).*invalid or expired/i);
  });

  it('returns an access-denied message when /myself responds 403', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ version: '1' }))
      .mockResolvedValueOnce(res({}, { status: 403 }));
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Access denied \(403\)/);
  });

  it('continues (with a warning) when /myself returns a non-auth error status', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ version: '1' })) // serverInfo ok
      .mockResolvedValueOnce(res({}, { status: 404 })) // myself restricted but not fatal
      .mockResolvedValueOnce(res({ issues: [], total: 0 })); // search ok
    const result = await client.testConnection();
    expect(result.success).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\/myself endpoint returned 404/),
    );
  });

  it('returns a search-permission error when /search responds 401/403', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ version: '1' }))
      .mockResolvedValueOnce(res({ displayName: 'Alice' }))
      .mockResolvedValueOnce(res({}, { status: 403 }));
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Search permission denied \(HTTP 403\)/);
  });

  it('continues when /search returns a non-auth error status', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ version: '1' }))
      .mockResolvedValueOnce(res({ displayName: 'Alice' }))
      .mockResolvedValueOnce(res({}, { status: 500 }));
    const result = await client.testConnection();
    expect(result.success).toBe(true);
    expect(result.serverInfo).toEqual({ version: '1' });
  });

  it('returns a catch-error when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});

// ───────────────────────── getProjects / getFields ─────────────────────────

describe('getProjects & getFields', () => {
  it('maps raw projects to {key,name,style}', async () => {
    fetchMock.mockResolvedValue(
      res([{ key: 'TEST', name: 'Test', style: 'next-gen' }])
    );
    const projects = await client.getProjects();
    expect(projects).toEqual([{ key: 'TEST', name: 'Test', style: 'next-gen' }]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/project'
    );
  });

  it('throws when getProjects gets a non-ok response', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 500, statusText: 'ISE' }));
    await expect(client.getProjects()).rejects.toThrow(/Failed to fetch projects: ISE/);
  });

  it('maps raw fields to {id,name,custom}', async () => {
    fetchMock.mockResolvedValue(
      res([
        { id: 'customfield_10002', name: 'Story Points', custom: true },
        { id: 'summary', name: 'Summary', custom: false },
      ])
    );
    const fields = await client.getFields();
    expect(fields).toEqual([
      { id: 'customfield_10002', name: 'Story Points', custom: true },
      { id: 'summary', name: 'Summary', custom: false },
    ]);
  });

  it('throws when getFields gets a non-ok response', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 404, statusText: 'NF' }));
    await expect(client.getFields()).rejects.toThrow(/Failed to fetch fields: NF/);
  });
});

// ───────────────────────── discoverCustomFields ─────────────────────────

describe('discoverCustomFields', () => {
  it('returns custom fields from the search response `names` map', async () => {
    fetchMock.mockResolvedValueOnce(
      res({
        names: {
          summary: 'Summary',
          customfield_10002: 'Story Points',
          customfield_10132: 'Issue Owner Team',
        },
        issues: [{ fields: {} }],
      })
    );
    const found = await client.discoverCustomFields('project = "TEST"');
    expect(found).toEqual([
      { fieldId: 'customfield_10002', name: 'Story Points', type: 'custom' },
      { fieldId: 'customfield_10132', name: 'Issue Owner Team', type: 'custom' },
    ]);
    // POST /search with expand=names
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe('POST');
    const body = JSON.parse(String(opts.body));
    expect(body.expand).toEqual(['names']);
    expect(body.fields).toEqual(['*all']);
  });

  it('falls back to GET /field when jql is empty', async () => {
    fetchMock.mockResolvedValueOnce(
      res([
        { id: 'customfield_10002', name: 'Story Points', custom: true, schema: { type: 'number' } },
        { id: 'summary', name: 'Summary', custom: false },
      ])
    );
    const found = await client.discoverCustomFields('   ');
    expect(found).toEqual([
      { fieldId: 'customfield_10002', name: 'Story Points', type: 'number' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/field'
    );
  });

  it('falls back to GET /field when search returns no custom entries in names', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ names: { summary: 'Summary' }, issues: [] }))
      .mockResolvedValueOnce(
        res([
          { id: 'customfield_9', name: 'X', custom: true, schema: { type: 'string' } },
        ])
      );
    const found = await client.discoverCustomFields('project = "TEST"');
    expect(found).toEqual([{ fieldId: 'customfield_9', name: 'X', type: 'string' }]);
  });

  it('falls back to GET /field when search response is not ok', async () => {
    fetchMock
      .mockResolvedValueOnce(res({}, { status: 400 }))
      .mockResolvedValueOnce(
        res([{ id: 'customfield_1', name: 'Y', custom: true }])
      );
    const found = await client.discoverCustomFields('project = "TEST"');
    expect(found).toEqual([
      { fieldId: 'customfield_1', name: 'Y', type: 'custom' },
    ]);
  });

  it('throws when the /field fallback is not ok', async () => {
    // search returns ok but with no custom entries → falls through to fallback
    fetchMock.mockResolvedValueOnce(res({ names: {}, issues: [] }));
    // the /field fallback fails
    fetchMock.mockResolvedValueOnce(res({}, { status: 500, statusText: 'ISE' }));
    await expect(
      client.discoverCustomFields('project = "TEST"')
    ).rejects.toThrow(/Failed to fetch field list: 500 ISE/);
  });
});

// ───────────────────────── getIssue ─────────────────────────

describe('getIssue', () => {
  const issue: JiraIssue = {
    key: 'TEST-123',
    self: 'https://test/rest/api/3/issue/123',
    fields: { summary: 's', issuetype: { name: 'Bug' }, status: { name: 'Open', statusCategory: { name: 'To Do' } }, created: 'c', updated: 'u' },
  };

  it('returns the issue for a valid key + ok response', async () => {
    fetchMock.mockResolvedValue(res(issue));
    const result = await client.getIssue('TEST-123');
    expect(result).toEqual(issue);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/issue/TEST-123'
    );
  });

  it('returns null and skips fetch for an invalid key format', async () => {
    const result = await client.getIssue('not-a-key');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Invalid issue key format/)
    );
  });

  it('returns null when the response is not ok', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 404, statusText: 'NF' }));
    const result = await client.getIssue('TEST-123');
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to fetch issue TEST-123/)
    );
  });

  it('returns null when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    const result = await client.getIssue('TEST-123');
    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/Error fetching issue TEST-123/),
      expect.any(Error),
    );
  });
});

// ───────────────────────── extractIssues: happy + pagination + errors ─────────────────────────

describe('extractIssues — happy path / pagination / errors', () => {
  it('posts to /search/jql with the right URL, method, auth, jql, maxResults, fields and expand', async () => {
    fetchMock.mockResolvedValueOnce(
      res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1, maxResults: 100 })
    );
    const result = await client.extractIssues('project = "TEST"', {
      maxResults: 50,
      maxRequestsPerMinute: 0,
    });
    expect(result).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://test.atlassian.net/rest/api/3/search/jql'
    );
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      expectedAuth('a@b.com', 'tok')
    );
    const body = JSON.parse(String(opts.body));
    expect(body.jql).toBe('project = "TEST"');
    expect(body.maxResults).toBe(50);
    expect(body.fields).toEqual(
      expect.arrayContaining(['summary', 'issuetype', 'status', 'labels', 'components', 'comment'])
    );
    expect(body.expand).toBe('changelog'); // default expand
    expect(body.nextPageToken).toBeUndefined();
  });

  it('paginates across pages using nextPageToken and reports progress', async () => {
    fetchMock
      .mockResolvedValueOnce(
        res({
          issues: [{ key: 'TEST-1', fields: {} }, { key: 'TEST-2', fields: {} }],
          total: 4,
          maxResults: 2,
          nextPageToken: 'page2',
        })
      )
      .mockResolvedValueOnce(
        res({
          issues: [{ key: 'TEST-3', fields: {} }, { key: 'TEST-4', fields: {} }],
          total: 4,
          maxResults: 2,
        })
      );
    const onProgress = vi.fn();
    const result = await client.extractIssues('project = "TEST"', {
      maxResults: 2,
      maxRequestsPerMinute: 0,
      onProgress,
    });
    expect(result).toHaveLength(4);
    // page 2 carried nextPageToken from page 1
    const page2Body = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body)
    );
    expect(page2Body.nextPageToken).toBe('page2');
    expect(onProgress).toHaveBeenCalledWith(2, 4);
    expect(onProgress).toHaveBeenCalledWith(4, 4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when total is 0', async () => {
    fetchMock.mockResolvedValueOnce(
      res({ issues: [], total: 0, maxResults: 100, startAt: 0 })
    );
    const result = await client.extractIssues('project = "NOPE"', {
      maxRequestsPerMinute: 0,
    });
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/No issues found for JQL/)
    );
  });

  it('appends customFieldIds (deduped) and strips unknown expand values', async () => {
    fetchMock.mockResolvedValueOnce(
      res({ issues: [], total: 0, maxResults: 100 })
    );
    await client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
      customFieldIds: ['customfield_10002', 'customfield_77777'],
      expand: ['changelog', 'totally-bogus'],
    });
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body)
    );
    // customfield_10002 already present → deduped; 77777 appended
    const unique = [...new Set(body.fields)];
    expect(body.fields).toEqual(unique);
    expect(body.fields).toContain('customfield_77777');
    // bogus expand stripped, only the valid one survives
    expect(body.expand).toBe('changelog');
  });

  it('throws a "JQL query failed" error for a non-auth, non-retryable status (400)', async () => {
    fetchMock.mockResolvedValueOnce(
      res('bad jql syntax', { status: 400, statusText: 'Bad Request' })
    );
    await expect(
      client.extractIssues('project INVALID', { maxRequestsPerMinute: 0 })
    ).rejects.toThrow(/JQL query failed: 400 Bad Request - bad jql syntax/);
  });
});

// ───────────────────────── extractIssues: retry / backoff ─────────────────────────

describe('extractIssues — retry / backoff (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('retries on 429 and succeeds on the next attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ issues: [], total: 0 }, { status: 429 }))
      .mockResolvedValueOnce(
        res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1 })
      );
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
    });
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    const result = await p;
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a 5xx server error and succeeds on the next attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(res({}, { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(
        res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1 })
      );
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
    });
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    const result = await p;
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error and succeeds on the next attempt', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(
        res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1 })
      );
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
    });
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    const result = await p;
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails immediately on 401 (no retry) and throws the auth error', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 401 }));
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
    });
    // Attach an early handler so the rejection is never "unhandled".
    p.catch(() => {});
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await expect(p).rejects.toThrow(/Authentication failed \(HTTP 401\).*invalid or expired/i);
    await expect(p).rejects.toThrow(/Failed to fetch page 1/);
    await expect(p).rejects.toMatchObject({ status: 401 });
    // Auth errors must not be retried — exactly one fetch call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a 429 (rate-limit) error carrying status after exhausting 429 retries', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 429 }));
    const p = client.extractIssues('project = "TEST"', { maxRequestsPerMinute: 0 });
    p.catch(() => {});
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await expect(p).rejects.toThrow(/rate limit/i);
    await expect(p).rejects.toMatchObject({ status: 429 });
  });

  it('throws a 5xx (server) error carrying status after exhausting 5xx retries', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 503 }));
    const p = client.extractIssues('project = "TEST"', { maxRequestsPerMinute: 0 });
    p.catch(() => {});
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await expect(p).rejects.toThrow(/server error/i);
    await expect(p).rejects.toMatchObject({ status: 503 });
  });

  it('throws a timeout error after exhausting retries on persistent AbortErrors', async () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValue(abortErr);
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 0,
    });
    p.catch(() => {});
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await expect(p).rejects.toThrow(/Request timeout after 60000ms/);
    await expect(p).rejects.toThrow(/Failed to fetch page 1/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throttles the first request using the rate-limit interval (effectiveDelay sleep)', async () => {
    // Pin the fake clock so Date.now() - lastRequestTime (0) < interval.
    vi.setSystemTime(0);
    fetchMock.mockResolvedValueOnce(
      res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1 })
    );
    const p = client.extractIssues('project = "TEST"', {
      maxRequestsPerMinute: 60, // 60000 / 60 = 1000ms interval
    });
    // Suspended on the throttle sleep before the first request fires.
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────── buildDefaultJql ─────────────────────────

describe('buildDefaultJql', () => {
  it('returns a bare ORDER BY when there are no projects and no filters', () => {
    const c = new JiraClient({ ...baseConfig, projectKeys: [] });
    expect(c.buildDefaultJql()).toBe('ORDER BY created DESC');
  });

  it('builds a project clause (OR) and filters out empty / "*" keys', () => {
    const c = new JiraClient({
      ...baseConfig,
      projectKeys: ['TEST', '', '  ', '*', 'PROD'],
    });
    const jql = c.buildDefaultJql();
    expect(jql).toContain('project = "TEST"');
    expect(jql).toContain('project = "PROD"');
    expect(jql).not.toContain('""');
    expect(jql).not.toContain('"*"');
    expect(jql).toMatch(/ORDER BY created DESC$/);
  });

  it('adds created/updated >= clauses for dateFrom', () => {
    const jql = client.buildDefaultJql({ dateFrom: '2026-01-01' });
    expect(jql).toContain('(created >= "2026-01-01" OR updated >= "2026-01-01")');
  });

  it('advances dateTo by one day (UTC) and uses strict-less-than for an inclusive upper bound', () => {
    const jql = client.buildDefaultJql({ dateTo: '2026-01-31' });
    // 2026-01-31 + 1 day → 2026-02-01
    expect(jql).toContain('(created < "2026-02-01" OR updated < "2026-02-01")');
    expect(jql).not.toContain('2026-01-31');
  });

  it('adds issuetype, status, and additional clauses joined by AND', () => {
    const jql = client.buildDefaultJql({
      issueTypes: ['Bug', 'Task'],
      statuses: ['Open', 'In Progress'],
      additional: 'priority = High',
    });
    expect(jql).toContain('(issuetype = "Bug" OR issuetype = "Task")');
    expect(jql).toContain('(status = "Open" OR status = "In Progress")');
    expect(jql).toContain('priority = High');
    expect(jql).toMatch(/ORDER BY created DESC$/);
    // all clauses joined with AND
    expect(jql.split(' AND ').length).toBeGreaterThan(1);
  });
});

// ───────────────────────── extractAllIssues ─────────────────────────

describe('extractAllIssues', () => {
  it('builds a date-range JQL and delegates to extractIssues', async () => {
    fetchMock.mockResolvedValueOnce(
      res({ issues: [{ key: 'TEST-1', fields: {} }], total: 1 })
    );
    const result = await client.extractAllIssues({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(result).toHaveLength(1);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body)
    );
    // the JQL produced by buildDefaultJql must carry the project + date range
    expect(body.jql).toContain('project = "TEST"');
    expect(body.jql).toContain('2026-01-01');
    expect(body.jql).toContain('2026-02-01');
    expect(body.jql).toMatch(/ORDER BY created DESC$/);
  });
});

// ───────────────────────── extractSelectFieldValue ─────────────────────────

describe('extractSelectFieldValue', () => {
  it('returns null for null / undefined / empty', () => {
    expect(extractSelectFieldValue(null)).toBeNull();
    expect(extractSelectFieldValue(undefined)).toBeNull();
  });

  it('returns a string field as-is', () => {
    expect(extractSelectFieldValue('Team A')).toBe('Team A');
  });

  it('joins an array of strings with ", "', () => {
    expect(extractSelectFieldValue(['A', 'B'])).toBe('A, B');
  });

  it('joins an array of select objects by .value', () => {
    expect(
      extractSelectFieldValue([
        { value: 'Team A', id: '1', self: 's' },
        { value: 'Team B', id: '2', self: 's' },
      ])
    ).toBe('Team A, Team B');
  });

  it('extracts .value / .displayName / .name / .key from an object (in that priority)', () => {
    expect(extractSelectFieldValue({ value: 'V' })).toBe('V');
    expect(extractSelectFieldValue({ displayName: 'D' })).toBe('D');
    expect(extractSelectFieldValue({ name: 'N' })).toBe('N');
    expect(extractSelectFieldValue({ key: 'K' })).toBe('K');
    expect(extractSelectFieldValue({ other: 'x' })).toBeNull();
  });

  it('stringifies a primitive (e.g. number)', () => {
    expect(extractSelectFieldValue(5)).toBe('5');
  });
});

// ───────────────────────── transformIssue ─────────────────────────

describe('transformIssue', () => {
  const fullIssue: JiraIssue = {
    key: 'TEST-1',
    self: 'https://x/rest/api/3/issue/1',
    fields: {
      summary: 'Fix bug',
      issuetype: { name: 'Bug' },
      priority: { name: 'High' },
      status: { name: 'In Progress', statusCategory: { name: 'Indeterminate' } },
      assignee: { displayName: 'Alice', emailAddress: 'a@x.com' },
      reporter: { displayName: 'Bob', emailAddress: 'b@x.com' },
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-02T00:00:00.000Z',
      resolutiondate: '2026-01-03T00:00:00.000Z',
      duedate: '2026-01-10',
      customfield_10002: 8,
      customfield_10132: { value: 'Team A', id: '1', self: 's' },
      labels: ['p1', 'p2'],
      components: [{ name: 'API' }, { name: 'UI' }],
    },
    changelog: {
      histories: [
        {
          id: 'h1',
          author: { displayName: 'Alice' },
          created: '2026-01-02T00:00:00.000Z',
          items: [
            {
              field: 'status',
              fieldtype: 'jira',
              from: '1',
              fromString: 'To Do',
              to: '2',
              toString: 'In Progress',
            },
            { field: 'assignee', fieldtype: 'jira', from: 'old', to: 'new' } as JiraChangelogItem,
          ],
        },
      ],
    },
  };

  it('flattens a full issue, extracts the select-field team, transitions and time-in-status', () => {
    const out = transformIssue(fullIssue);
    expect(out.key).toBe('TEST-1');
    expect(out.summary).toBe('Fix bug');
    expect(out.issueType).toBe('Bug');
    expect(out.priority).toBe('High');
    expect(out.status).toBe('In Progress');
    expect(out.statusCategory).toBe('Indeterminate');
    expect(out.assignee).toBe('Alice');
    expect(out.reporter).toBe('Bob');
    expect(out.issueOwnerTeam).toBe('Team A');
    expect(out.created).toBe('2026-01-01T00:00:00.000Z');
    expect(out.updated).toBe('2026-01-02T00:00:00.000Z');
    expect(out.resolved).toBe('2026-01-03T00:00:00.000Z');
    expect(out.dueDate).toBe('2026-01-10');
    expect(out.storyPoints).toBe(8);
    expect(out.labels).toEqual(['p1', 'p2']);
    expect(out.components).toEqual(['API', 'UI']);
    expect(out.transitions).toEqual([
      {
        fromStatus: 'To Do',
        toStatus: 'In Progress',
        author: 'Alice',
        occurredAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    // non-status changelog items are ignored → exactly one transition
    expect(out.timeInStatus['In Progress']).toBeGreaterThan(0);
  });

  it('applies safe defaults when optional fields are missing', () => {
    const minimal: JiraIssue = {
      key: 'TEST-2',
      self: 'https://x/2',
      fields: {
        summary: 'No deps',
        issuetype: { name: 'Task' },
        status: { name: 'Open', statusCategory: { name: 'To Do' } },
        created: '2026-02-01T00:00:00.000Z',
        updated: '2026-02-01T00:00:00.000Z',
      },
    };
    const out = transformIssue(minimal);
    expect(out.priority).toBeNull();
    expect(out.assignee).toBe('Unassigned');
    expect(out.reporter).toBe('Unknown');
    expect(out.resolved).toBeNull();
    expect(out.dueDate).toBeNull();
    expect(out.issueOwnerTeam).toBeNull();
    expect(out.storyPoints).toBeUndefined();
    expect(out.labels).toEqual([]);
    expect(out.components).toEqual([]);
    expect(out.transitions).toEqual([]);
    expect(out.timeInStatus).toEqual({});
  });
});
