import { NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

const DEFAULT_SETTINGS = {
  rateLimit: {
    delayMs: 0,
    maxRequestsPerMinute: 60,
    batchSize: 50,
    backoffStrategy: 'none', // none, linear, exponential
  },
  general: {
    defaultHolidayState: 'national',
    workStartHour: 9,
    workEndHour: 17,
    defaultSlaTargetHours: 40,
  },
  persistence: {
    autoSave: true,
    autoRestore: true,
    retentionDays: 30, // 7 | 30 | 90 | 'never'
  },
};

function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function loadSettings(): typeof DEFAULT_SETTINGS {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Record<string, unknown>) {
  ensureDataDir();
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const current = loadSettings();
    const updated = {
      ...current,
      ...body,
      rateLimit: { ...current.rateLimit, ...(body.rateLimit || {}) },
      general: { ...current.general, ...(body.general || {}) },
      persistence: { ...current.persistence, ...(body.persistence || {}) },
    };
    saveSettings(updated);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
