import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { createMockDb, makeRequest, readJson } from '@/test/mock-db';

// Mutable holder so each test starts from a fresh mock DB (clean smart defaults
// + clean call history). The holder is created empty inside vi.hoisted (import
// bindings are not yet initialized there) and populated with a fresh
// createMockDb() in beforeEach. The vi.mock factory reads from this holder, so
// the route handler always observes the current mock instance.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: undefined as any } }));
vi.mock('@/lib/db', () => ({ getDefaultDb: () => dbRef.current }));

import { GET, POST } from '@/app/api/webhooks/jira/route';

const mockDb = () => dbRef.current;

let originalSecret: string | undefined;

beforeAll(() => {
  originalSecret = process.env.JIRA_WEBHOOK_SECRET;
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.JIRA_WEBHOOK_SECRET;
  else process.env.JIRA_WEBHOOK_SECRET = originalSecret;
});

beforeEach(() => {
  dbRef.current = createMockDb() as any;
  delete process.env.JIRA_WEBHOOK_SECRET;
});

/** Build a POST Request to the jira webhook with an optional secret header. */
function webhookRequest(opts: { secret?: string; body?: unknown; connectionId?: string } = {}): Request {
  const { secret, body = {}, connectionId = 'c1' } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret !== undefined) headers['x-jira-webhook-secret'] = secret;
  return new Request(`http://localhost/api/webhooks/jira?connectionId=${connectionId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as Request;
}

function sampleIssue(): any {
  return {
    webhookEvent: 'jira:issue_updated',
    issue: {
      key: 'TEST-1',
      fields: {
        summary: 'Fix the bug',
        issuetype: { name: 'Bug' },
        priority: { name: 'High' },
        status: { name: 'In Progress' },
        assignee: { displayName: 'Alice' },
        reporter: { displayName: 'Bob' },
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z',
        resolutiondate: null,
        duedate: '2026-02-01',
        customfield_10016: '5', // story points as numeric string
        labels: ['backend'],
        components: [{ name: 'API' }],
      },
    },
  };
}

describe('GET /api/webhooks/jira', () => {
  it('returns the active status payload', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.status).toBe('Webhook endpoint active');
  });
});

describe('POST /api/webhooks/jira', () => {
  it('processes a webhook when a valid secret is configured', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(webhookRequest({ secret: 'topsecret', body: sampleIssue() }) as any);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.message).toContain('TEST-1');
    expect(mockDb().masterTicket.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb().masterTicket.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          connectionRef_jiraKey: { connectionRef: 'c1', jiraKey: 'TEST-1' },
        },
      }),
    );
  });

  it('rejects a request with the wrong secret (401)', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(
      webhookRequest({
        secret: 'wrong',
        body: { webhookEvent: 'jira:issue_updated', issue: { key: 'TEST-2', fields: {} } },
      }) as any,
    );
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Invalid secret/);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('rejects a request missing the secret when one is configured (401)', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(
      webhookRequest({
        body: { webhookEvent: 'jira:issue_updated', issue: { key: 'TEST-2', fields: {} } },
      }) as any,
    );
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Missing secret/);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('accepts a loopback request when no secret is configured', async () => {
    // No JIRA_WEBHOOK_SECRET (beforeEach deletes it) and makeRequest builds an
    // http://localhost request with no Origin/Referer header -> loopback guard passes.
    const res = await POST(
      webhookRequest({
        body: {
          webhookEvent: 'jira:issue_created',
          issue: { key: 'TEST-3', fields: { summary: 'New ticket' } },
        },
      }) as any,
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(mockDb().masterTicket.upsert).toHaveBeenCalledTimes(1);
  });

  it('accepts the secret via the ?secret= query param fallback', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    // No x-jira-webhook-secret header; secret comes from the query string.
    const res = await POST(
      makeRequest('/api/webhooks/jira?connectionId=c1&secret=topsecret', {
        method: 'POST',
        body: sampleIssue(),
      }) as any,
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(mockDb().masterTicket.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-loopback (cross-origin) request when no secret is configured (401)', async () => {
    // No JIRA_WEBHOOK_SECRET (beforeEach deletes it). A browser-style Origin
    // header pointing at a non-localhost host must be rejected.
    const req = new Request('http://localhost/api/webhooks/jira?connectionId=c1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'TEST-5', fields: {} },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/loopback requests only/);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('accepts a localhost origin when no secret is configured', async () => {
    const req = new Request('http://localhost/api/webhooks/jira?connectionId=c1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'TEST-6', fields: {} },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await readJson(res)).success).toBe(true);
    expect(mockDb().masterTicket.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects when the Referer is non-loopback even if the Origin is loopback (stricter than the shared guard)', async () => {
    // The webhook-specific composition checks BOTH headers; the shared guard
    // alone would trust whichever header is present first.
    const req = new Request('http://localhost/api/webhooks/jira?connectionId=c1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        Referer: 'https://evil.example/page',
      },
      body: JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'TEST-7', fields: {} },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/loopback requests only/);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) origin schemes (exotic schemes are not trusted)', async () => {
    const req = new Request('http://localhost/api/webhooks/jira?connectionId=c1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'ftp://localhost' },
      body: JSON.stringify({
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'TEST-8', fields: {} },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((await readJson(res)).success).toBe(false);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when connectionId is missing', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    const req = new Request('http://localhost/api/webhooks/jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jira-webhook-secret': 'topsecret' },
      body: JSON.stringify({ webhookEvent: 'jira:issue_updated', issue: { key: 'TEST-4', fields: {} } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/connectionId/);
  });

  it('returns 400 when the payload has no issue data', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(
      webhookRequest({ secret: 'topsecret', body: { webhookEvent: 'jira:issue_updated' } }),
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.error).toMatch(/No issue data/);
    expect(mockDb().masterTicket.upsert).not.toHaveBeenCalled();
  });
});
