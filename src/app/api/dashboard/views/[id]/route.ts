import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, data, isDefault, autoSaveEnabled, storageConfig } = body;

    const db = getDb(storageConfig);
    
    // Fetch current view to get connectionRef if we need to update isDefault
    const currentView = await (db as any).dashboardView.findUnique({ where: { id } });
    if (!currentView) {
      return NextResponse.json({ success: false, error: 'View not found' }, { status: 404 });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (data !== undefined) updateData.data = typeof data === 'string' ? data : JSON.stringify(data);
    if (autoSaveEnabled !== undefined) updateData.autoSaveEnabled = !!autoSaveEnabled;
    
    if (isDefault !== undefined) updateData.isDefault = !!isDefault;

    const view = await (db as any).$transaction(async (tx: any) => {
      // @MX:WARN - Concurrency Risk: Atomic default view update required
      // @MX:REASON - Unsetting other defaults and setting the new one must happen in a single 
      // transaction to prevent race conditions where multiple views might be marked as default.
      if (isDefault) {
        await tx.dashboardView.updateMany({
          where: { connectionRef: currentView.connectionRef, isDefault: true, id: { not: id } },
          data: { isDefault: false }
        });
      }

      return await tx.dashboardView.update({
        where: { id },
        data: updateData
      });
    });

    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('[Views API] Error updating view:', error);
    return NextResponse.json({ success: false, error: 'Failed to update view' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { storageConfig } = body;
    
    if (!storageConfig) {
      return NextResponse.json({ success: false, error: 'storageConfig is required in request body' }, { status: 400 });
    }

    const db = getDb(storageConfig);
    await (db as any).dashboardView.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Views API] Error deleting view:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete view' }, { status: 500 });
  }
}
