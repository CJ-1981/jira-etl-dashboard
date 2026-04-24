import { NextResponse } from 'next/server';

// ─── In-memory polling state (MVP - resets on server restart) ──────────────────

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
}

let pollingState: PollingState = {
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
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function runPollingExtraction() {
  if (!pollingState.enabled || pollingState.status === 'running') return;

  pollingState.status = 'running';
  try {
    const res = await fetch('http://localhost:3000/api/jira/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId: pollingState.connectionId,
        jql: pollingState.jql || undefined,
        dateFrom: pollingState.dateFrom || undefined,
        dateTo: pollingState.dateTo || undefined,
      }),
    });

    const data = await res.json();
    if (data.success) {
      pollingState.runCount++;
      pollingState.lastError = null;
    } else {
      pollingState.lastError = data.error || 'Unknown extraction error';
    }
  } catch (error) {
    pollingState.lastError = error instanceof Error ? error.message : 'Network error';
  } finally {
    pollingState.lastRunAt = new Date().toISOString();
    pollingState.status = pollingState.enabled ? 'idle' : 'idle';
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (!pollingState.enabled) return;

  const intervalMs = pollingState.intervalMinutes * 60 * 1000;
  pollingState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  pollTimer = setInterval(async () => {
    await runPollingExtraction();
    if (pollingState.enabled) {
      const nextIntervalMs = pollingState.intervalMinutes * 60 * 1000;
      pollingState.nextRunAt = new Date(Date.now() + nextIntervalMs).toISOString();
    }
  }, intervalMs);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollingState.nextRunAt = null;
  pollingState.enabled = false;
  pollingState.status = 'idle';
}

export async function GET() {
  return NextResponse.json({
    success: true,
    polling: {
      enabled: pollingState.enabled,
      connectionId: pollingState.connectionId,
      intervalMinutes: pollingState.intervalMinutes,
      lastRunAt: pollingState.lastRunAt,
      nextRunAt: pollingState.nextRunAt,
      runCount: pollingState.runCount,
      status: pollingState.status,
      lastError: pollingState.lastError,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectionId, intervalMinutes, dateFrom, dateTo, jql, enabled } = body;

    if (enabled) {
      if (!connectionId) {
        return NextResponse.json(
          { success: false, error: 'connectionId is required when enabling polling' },
          { status: 400 }
        );
      }

      pollingState = {
        ...pollingState,
        enabled: true,
        connectionId: connectionId || pollingState.connectionId,
        intervalMinutes: intervalMinutes || 15,
        dateFrom: dateFrom || pollingState.dateFrom,
        dateTo: dateTo || pollingState.dateTo,
        jql: jql || pollingState.jql,
      };

      startPolling();
    } else {
      stopPolling();
    }

    return NextResponse.json({
      success: true,
      polling: {
        enabled: pollingState.enabled,
        connectionId: pollingState.connectionId,
        intervalMinutes: pollingState.intervalMinutes,
        lastRunAt: pollingState.lastRunAt,
        nextRunAt: pollingState.nextRunAt,
        runCount: pollingState.runCount,
        status: pollingState.status,
        lastError: pollingState.lastError,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
