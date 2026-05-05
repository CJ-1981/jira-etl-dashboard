import { NextResponse } from 'next/server';

// ─── Persistent Polling State (using global to survive hot reloads in dev) ────

interface PollingState {
  enabled: boolean;
  connectionId: string;
  intervalMinutes: number;
  dateFrom: string;
  dateTo: string;
  jql: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  status: 'idle' | 'running' | 'error';
  lastError: string | null;
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
  lastRunAt: null,
  nextRunAt: null,
  runCount: 0,
  status: 'idle',
  lastError: null,
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

async function runPollingExtraction() {
  if (!pollingState.enabled || pollingState.status === 'running') return;

  pollingState.status = 'running';
  try {
    const port = process.env.PORT || 3000;
    const res = await fetch(`http://localhost:${port}/api/jira/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionRef: pollingState.connectionId,
        jql: pollingState.jql || undefined,
        dateFrom: pollingState.dateFrom || undefined,
        dateTo: pollingState.dateTo || undefined,
        saveExtraction: true,
        storageConfig: pollingState.storageConfig
      }),
    });

    const data = await res.json();
    if (data.success) {
      pollingState.runCount++;
      pollingState.lastError = null;
    } else {
      pollingState.lastError = data.error || 'Unknown extraction error';
      console.error('[Polling] Background extraction error:', pollingState.lastError);
    }
  } catch (error) {
    pollingState.lastError = error instanceof Error ? error.message : 'Network error';
    console.error('[Polling] Background extraction failed:', pollingState.lastError);
  } finally {
    pollingState.lastRunAt = new Date().toISOString();
    pollingState.status = 'idle';
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
}

export async function GET() {
  // Return a sanitized version of the polling state
  const sanitizedState = {
    ...pollingState,
    storageConfig: pollingState.storageConfig ? {
      provider: pollingState.storageConfig.provider,
      isCustom: true,
      // Omit sensitive URL fields
    } : undefined
  };

  return NextResponse.json({
    success: true,
    polling: sanitizedState,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      connectionId, 
      intervalMinutes, 
      dateFrom, 
      dateTo, 
      jql, 
      enabled, 
      action,
      storageConfig 
    } = body;

    // Handle Ping Action (Manual override notification)
    if (action === 'ping') {
      if (pollingState.enabled) {
        pollingState.lastRunAt = new Date().toISOString();
        // Reset timer to start fresh from now
        startPolling();
      }
      // Return sanitized state
      const sanitized = {
        ...pollingState,
        storageConfig: pollingState.storageConfig ? { provider: pollingState.storageConfig.provider, isCustom: true } : undefined
      };
      return NextResponse.json({ success: true, polling: sanitized });
    }

    // Handle Polling State Update
    if (enabled === true) {
      if (!connectionId && !pollingState.connectionId) {
        return NextResponse.json({ success: false, error: 'connectionId is required' }, { status: 400 });
      }

      pollingState.enabled = true;
      pollingState.connectionId = connectionId || pollingState.connectionId;
      pollingState.intervalMinutes = intervalMinutes || pollingState.intervalMinutes;
      pollingState.dateFrom = dateFrom || pollingState.dateFrom;
      pollingState.dateTo = dateTo || pollingState.dateTo;
      pollingState.jql = jql || pollingState.jql;
      
      // Only update if provided (allows clearing with null, but preserving on undefined)
      if (storageConfig !== undefined) {
        pollingState.storageConfig = storageConfig;
      }

      startPolling();
    } else if (enabled === false) {
      stopPolling();
    }

    // Return sanitized state
    const sanitized = {
      ...pollingState,
      storageConfig: pollingState.storageConfig ? { provider: pollingState.storageConfig.provider, isCustom: true } : undefined
    };

    return NextResponse.json({
      success: true,
      polling: sanitized,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
