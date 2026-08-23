import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { StorageConfigSchema } from '@/lib/validation/schemas';

/** Narrow slice of a DashboardView row — only the fields this handler reads. */
interface DashboardViewRow {
  connectionRef: string;
}

// Set a view as the default for its connection
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route mutates dashboard view defaults and the app is
  // unauthenticated; reject cross-origin browser requests (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { storageConfig } = body;

    if (!storageConfig) {
      return NextResponse.json({ success: false, error: 'storageConfig is required in request body' }, { status: 400 });
    }

    // Validate untrusted storageConfig before handing it to getDb().
    const parsedConfig = StorageConfigSchema.safeParse(storageConfig);
    if (!parsedConfig.success) {
      return NextResponse.json({ success: false, error: 'Invalid storageConfig' }, { status: 400 });
    }

    const db = getDb(storageConfig);

    // Fetch current view to get connectionRef
    const currentView = await db.dashboardView.findUnique({ where: { id } }) as DashboardViewRow | null;
    if (!currentView) {
      return NextResponse.json({ success: false, error: 'View not found' }, { status: 404 });
    }

    // Update atomically: unset all other defaults and set this one as default
    const view = await db.$transaction(async (tx) => {
      // Unset all other default views for this connection
      await tx.dashboardView.updateMany({
        where: { connectionRef: currentView.connectionRef, isDefault: true },
        data: { isDefault: false }
      });

      // Set this view as default
      return await tx.dashboardView.update({
        where: { id },
        data: { isDefault: true }
      });
    });

    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('[Views API] Error setting default view:', error);
    return NextResponse.json({ success: false, error: 'Failed to set default view' }, { status: 500 });
  }
}

// Remove default status from a view
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route mutates dashboard view defaults and the app is
  // unauthenticated; reject cross-origin browser requests (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { storageConfig } = body;

    if (!storageConfig) {
      return NextResponse.json({ success: false, error: 'storageConfig is required in request body' }, { status: 400 });
    }

    // Validate untrusted storageConfig before handing it to getDb().
    const parsedConfig = StorageConfigSchema.safeParse(storageConfig);
    if (!parsedConfig.success) {
      return NextResponse.json({ success: false, error: 'Invalid storageConfig' }, { status: 400 });
    }

    const db = getDb(storageConfig);

    // Update view to remove default status
    const view = await db.dashboardView.update({
      where: { id },
      data: { isDefault: false }
    });

    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('[Views API] Error clearing default view:', error);
    return NextResponse.json({ success: false, error: 'Failed to clear default view' }, { status: 500 });
  }
}
