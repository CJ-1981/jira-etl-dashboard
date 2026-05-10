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
    
    if (isDefault) {
      updateData.isDefault = true;
      // Unset others
      await (db as any).dashboardView.updateMany({
        where: { connectionRef: currentView.connectionRef, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    } else if (isDefault === false) {
      updateData.isDefault = false;
    }

    const view = await (db as any).dashboardView.update({
      where: { id },
      data: updateData
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
    const { searchParams } = new URL(request.url);
    const storageConfigRaw = searchParams.get('storageConfig');
    
    let storageConfig;
    if (storageConfigRaw) {
      try {
        storageConfig = JSON.parse(storageConfigRaw);
      } catch (e) {}
    }

    const db = getDb(storageConfig);
    await (db as any).dashboardView.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Views API] Error deleting view:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete view' }, { status: 500 });
  }
}
