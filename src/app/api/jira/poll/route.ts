import { NextResponse } from 'next/server';

// ─── Persistent Polling State (using global to survive hot reloads in dev) ────

interface PollingState {
  enabled: boolean;
  connectionId: string;
  intervalMinutes: number;
  dateFrom: string;
  dateTo: string;
  jql: string;
  // When set (via a quick-pull preset like "Since yesterday"), background runs
  // recompute the date window relative to the current day instead of reusing
  // the frozen dateFrom/dateTo captured when polling was enabled.
  daysBack?: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  status: 'idle' | 'running' | 'error';
  lastError: string | null;
  lastRunSummary?: {
    totalExtracted: number;
    added: number;
    updated: number;
    unchanged: number;
    deleted: number;
  } | null;
  // Monotonic marker bumped on every completed background run so clients can
  // detect "a new run just finished" and surface a toast exactly once.
  lastRunId: number;
  jiraCredentials?: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKeys?: string;
  };
  extractOptions?: {
    rateLimit?: any;
    generalSettings?: any;
    customPlugins?: any[];
    customFieldIds?: string[];
    storyPointsFieldId?: string;
    issueOwnerTeamFieldId?: string;
    updateOnly?: boolean;
  };
  storageConfig?: {
    provider: 'sqlite' | 'postgresql';
    url: string;
    directUrl?: string;
    isCustom?: boolean;
  };
}

const DEFAULT_STATE: PollingState = {
  enabled: false,
  connectionId: '',
  intervalMinutes: 15,
  dateFrom: '',
  dateTo: '',
  jql: '',
  daysBack: null,
  lastRunAt: null,
  nextRunAt: null,
  runCount: 0,
  status: 'idle',
  lastError: null,
  lastRunSummary: null,
  lastRunId: 0,
  storageConfig: undefined,
};

// Use global to persist state in development
const globalForPolling = global as unknown as { 
  pollingState: PollingState;
  pollTimer: ReturnType<typeof setInterval> | null;
};

if (!globalForPolling.pollingState) {
  globalForPolling.pollingState = { ...DEFAULT_STATE };
}

const pollingState = globalForPolling.pollingState;

// Strips sensitive fields (credentials, DB URLs) before echoing state to clients
function sanitizeState() {
  const { jiraCredentials: _creds, ...rest } = pollingState;
  return {
    ...rest,
    storageConfig: pollingState.storageConfig ? {
      provider: pollingState.storageConfig.provider,
      isCustom: true,
      // Omit sensitive URL fields
    } : undefined
  };
}

async function runPollingExtraction() {
  if (!pollingState.enabled || pollingState.status === 'running') return;

  // Connections live in browser localStorage; the server only knows what the
  // client sent when polling was enabled. Fail fast with a clear message if
  // credentials are missing (e.g. polling enabled before this was fixed).
  const creds = pollingState.jiraCredentials;
  if (!creds || !creds.baseUrl || !creds.email || !creds.apiToken) {
    pollingState.lastRunAt = new Date().toISOString();
    pollingState.lastError = 'No Jira credentials stored for polling. Toggle polling off and on again to register the connection.';
    pollingState.lastRunSummary = null;
    // Signal watchers that a run attempt finished (with an error).
    pollingState.lastRunId = (pollingState.lastRunId || 0) + 1;
    console.error('[Polling] Background extraction skipped:', pollingState.lastError);
    return;
  }

  pollingState.status = 'running';
  try {
    const port = process.env.PORT || 3000;
    // With a quick-pull preset (daysBack) the window is recomputed against the
    // current day on every run — omit the stored dates so the extract route
    // derives them from "now" instead of reusing frozen values.
    const useRelativeWindow = typeof pollingState.daysBack === 'number' && pollingState.daysBack > 0;
    const res = await fetch(`http://localhost:${port}/api/jira/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionRef: pollingState.connectionId,
        jiraCredentials: creds,
        rateLimit: pollingState.extractOptions?.rateLimit,
        generalSettings: pollingState.extractOptions?.generalSettings,
        customPlugins: pollingState.extractOptions?.customPlugins,
        customFieldIds: pollingState.extractOptions?.customFieldIds,
        storyPointsFieldId: pollingState.extractOptions?.storyPointsFieldId,
        issueOwnerTeamFieldId: pollingState.extractOptions?.issueOwnerTeamFieldId,
        updateOnly: pollingState.extractOptions?.updateOnly ?? false,
        jql: pollingState.jql || undefined,
        ...(useRelativeWindow
          ? { daysBack: pollingState.daysBack }
          : {
              dateFrom: pollingState.dateFrom || undefined,
              dateTo: pollingState.dateTo || undefined,
            }),
        saveExtraction: true,
        storageConfig: pollingState.storageConfig
      }),
    });

    // @MX:WARN - External API Response Validation
    // @MX:REASON - Validating Content-Type ensures we only parse expected JSON formats. 
    // Non-JSON responses could indicate server errors or misconfigured routes.
    const contentType = res.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      // @MX:NOTE - Sanitize error metadata to avoid leaking upstream response bodies.
      const errorMsg = `Invalid response format (not JSON). Status: ${res.status} ${res.statusText}, Content-Type: ${contentType || 'none'}`;
      throw new Error(errorMsg);
    }

    if (data.success) {
      pollingState.runCount++;
      pollingState.lastError = null;
      const s = data.summary;
      pollingState.lastRunSummary = s ? {
        totalExtracted: s.totalExtracted ?? 0,
        added: s.added ?? 0,
        updated: s.updated ?? 0,
        unchanged: s.unchanged ?? 0,
        deleted: s.deleted ?? 0,
      } : null;
    } else {
      pollingState.lastError = data.error || 'Unknown extraction error';
      pollingState.lastRunSummary = null;
      console.error('[Polling] Background extraction error:', pollingState.lastError);
    }
  } catch (error) {
    pollingState.lastError = error instanceof Error ? error.message : 'Network error';
    pollingState.lastRunSummary = null;
    console.error('[Polling] Background extraction failed:', pollingState.lastError);
  } finally {
    pollingState.lastRunAt = new Date().toISOString();
    pollingState.status = 'idle';
    // Signal to watching clients that a run just finished (success or failure).
    pollingState.lastRunId = (pollingState.lastRunId || 0) + 1;
  }
}

function startPolling() {
  if (globalForPolling.pollTimer) clearInterval(globalForPolling.pollTimer);
  if (!pollingState.enabled) return;

  const intervalMs = pollingState.intervalMinutes * 60 * 1000;
  pollingState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  globalForPolling.pollTimer = setInterval(async () => {
    await runPollingExtraction();
    if (pollingState.enabled) {
      const nextIntervalMs = pollingState.intervalMinutes * 60 * 1000;
      pollingState.nextRunAt = new Date(Date.now() + nextIntervalMs).toISOString();
    }
  }, intervalMs);
}

function stopPolling() {
  if (globalForPolling.pollTimer) {
    clearInterval(globalForPolling.pollTimer);
    globalForPolling.pollTimer = null;
  }
  pollingState.nextRunAt = null;
  pollingState.enabled = false;
  pollingState.status = 'idle';
  // Drop secrets as soon as they're no longer needed
  pollingState.jiraCredentials = undefined;
  pollingState.extractOptions = undefined;
  pollingState.storageConfig = undefined;
}

export async function GET() {
  // Return a sanitized version of the polling state
  return NextResponse.json({
    success: true,
    polling: sanitizeState(),
  });
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Malformed JSON payload' }, { status: 400 });
    }

    // @MX:WARN - Input Shape Validation
    // @MX:REASON - Validating that body is a non-null object ensures destructuring doesn't fail.
    // This prevents potential 500 errors from malformed but syntactically valid JSON (like 'null' or '[]').
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Malformed JSON payload: expected object' }, { status: 400 });
    }

    const { 
      connectionId, 
      intervalMinutes, 
      dateFrom, 
      dateTo, 
      jql, 
      enabled, 
      action,
      storageConfig,
      jiraCredentials,
      rateLimit,
      generalSettings,
      customPlugins,
      customFieldIds,
      storyPointsFieldId,
      issueOwnerTeamFieldId,
      updateOnly,
      daysBack
    } = body;

    // Handle Ping Action (Manual override notification)
    if (action === 'ping') {
      if (pollingState.enabled) {
        pollingState.lastRunAt = new Date().toISOString();
        // Reset timer to start fresh from now
        startPolling();
      }
      // Return sanitized state
      return NextResponse.json({ success: true, polling: sanitizeState() });
    }

    // Handle Polling State Update
    if (enabled === true) {
      if (!connectionId && !pollingState.connectionId) {
        return NextResponse.json({ success: false, error: 'connectionId is required' }, { status: 400 });
      }

      // Validate intervalMinutes if provided
      if (intervalMinutes !== undefined) {
        const interval = Number(intervalMinutes);
        if (isNaN(interval) || interval <= 0) {
          return NextResponse.json({ success: false, error: 'intervalMinutes must be a positive number' }, { status: 400 });
        }
        pollingState.intervalMinutes = interval;
      }

      pollingState.enabled = true;
      pollingState.connectionId = connectionId || pollingState.connectionId;
      // intervalMinutes handled above with validation
      // Mirror the client's current extract-panel state exactly (the client sends
      // '' for empty fields). Keeping old values here caused background runs to
      // use a stale, wider date range than the manual extraction.
      pollingState.dateFrom = typeof dateFrom === 'string' ? dateFrom : '';
      pollingState.dateTo = typeof dateTo === 'string' ? dateTo : '';
      pollingState.jql = typeof jql === 'string' ? jql : '';
      // Quick-pull preset window: a positive number enables a rolling window that
      // is recomputed against the current day on every run; null clears it so the
      // stored absolute dates are used instead.
      if (daysBack !== undefined) {
        const db = Number(daysBack);
        pollingState.daysBack = !daysBack || isNaN(db) || db <= 0 ? null : db;
      }

      // Credentials and extraction options are registration data — only sent when
      // enabling or re-registering. Preserve existing values otherwise, so partial
      // updates (e.g. an interval-only change) don't wipe them and silently break
      // background runs.
      if (jiraCredentials) {
        pollingState.jiraCredentials = jiraCredentials;
      }
      if (jiraCredentials || !pollingState.extractOptions) {
        pollingState.extractOptions = {
          rateLimit: rateLimit ?? pollingState.extractOptions?.rateLimit,
          generalSettings: generalSettings ?? pollingState.extractOptions?.generalSettings,
          customPlugins: customPlugins ?? pollingState.extractOptions?.customPlugins,
          customFieldIds: customFieldIds ?? pollingState.extractOptions?.customFieldIds,
          storyPointsFieldId: storyPointsFieldId ?? pollingState.extractOptions?.storyPointsFieldId,
          issueOwnerTeamFieldId: issueOwnerTeamFieldId ?? pollingState.extractOptions?.issueOwnerTeamFieldId,
          updateOnly: updateOnly ?? pollingState.extractOptions?.updateOnly,
        };
      }
      
      // Only update if provided (allows clearing with null, but preserving on undefined)
      if (storageConfig !== undefined) {
        pollingState.storageConfig = storageConfig;
      }

      startPolling();
    } else if (enabled === false) {
      stopPolling();
    }

    return NextResponse.json({
      success: true,
      polling: sanitizeState(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
