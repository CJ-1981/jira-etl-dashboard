import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Set a view as the default for its connection
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { storageConfig } = body;

    if (!storageConfig) {
      return NextResponse.json({ success: false, error: 'storageConfig is required in request body' }, { status: 400 });
    }

    const db = getDb(storageConfig);

    // Fetch current view to get connectionRef
    const currentView = await (db as any).dashboardView.findUnique({ where: { id } });
    if (!currentView) {
      return NextResponse.json({ success: false, error: 'View not found' }, { status: 404 });
    }

    // Update atomically: unset all other defaults and set this one as default
    const view = await (db as any).$transaction(async (tx: any) => {
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
  try {
    const { id } = await params;
    const body = await request.json();
    const { storageConfig } = body;

    if (!storageConfig) {
      return NextResponse.json({ success: false, error: 'storageConfig is required in request body' }, { status: 400 });
    }

    const db = getDb(storageConfig);

    // Update view to remove default status
    const view = await (db as any).dashboardView.update({
      where: { id },
      data: { isDefault: false }
    });

    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('[Views API] Error clearing default view:', error);
    return NextResponse.json({ success: false, error: 'Failed to clear default view' }, { status: 500 });
  }
}
