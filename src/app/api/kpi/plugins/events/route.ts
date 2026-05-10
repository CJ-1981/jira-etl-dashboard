import { NextResponse } from 'next/server';
import { getPluginWatcher } from '@/lib/kpi/plugin-watcher';

/**
 * GET /api/kpi/plugins/events
 * Poll for plugin change events
 *
 * Query parameters:
 * - lastEventId: Optional timestamp of last known event
 *
 * Returns recent plugin change events since the last check
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lastEventId = searchParams.get('lastEventId');

    // Start the watcher if not already running
    const watcher = getPluginWatcher();
    if (!watcher.isActive()) {
      watcher.start();
    }

    // For a simple implementation, return current timestamp
    // In a production system, you'd maintain an event log and return actual events
    const now = Date.now();
    const hasChanges = lastEventId ? parseInt(lastEventId) < now - 2000 : false;

    return NextResponse.json({
      success: true,
      timestamp: now,
      hasChanges,
      message: hasChanges ? 'Plugin changes detected' : 'No changes',
    });
  } catch (error) {
    console.error('[API] Failed to check plugin events:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check plugin events' },
      { status: 500 }
    );
  }
}
