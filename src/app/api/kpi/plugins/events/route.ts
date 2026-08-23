import { NextResponse } from 'next/server';
import { getPluginWatcher } from '@/lib/kpi/plugin-watcher';
import { handleApiError } from '@/lib/api-error';

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

    // Check for actual events from the watcher
    const eventCounter = watcher.getEventCounter();
    const hasChanges = lastEventId 
      ? eventCounter > parseInt(lastEventId) 
      : eventCounter > 0;

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      eventCounter,
      hasChanges,
      message: hasChanges ? 'Plugin changes detected' : 'No changes',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
