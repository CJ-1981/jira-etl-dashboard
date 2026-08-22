import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/dashboard/views/bulk
 * Fetches ALL dashboard views across all connections.
 * Used for full configuration export.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storageConfigRaw = searchParams.get('storageConfig');
    
    let storageConfig;
    if (storageConfigRaw) {
      try {
        storageConfig = JSON.parse(storageConfigRaw);
      } catch (e) {
        console.warn('[Views Bulk API] Failed to parse storageConfig');
      }
    }

    const db = getDb(storageConfig);
    const views = await (db as any).dashboardView.findMany({
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, views });
  } catch (error) {
    console.error('[Views Bulk API] Error fetching all views:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch views' }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/views/bulk
 * Imports a list of dashboard views.
 * Used for full configuration import.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { views, storageConfig } = body;

    if (!views || !Array.isArray(views)) {
      return NextResponse.json({ success: false, error: 'Views array is required' }, { status: 400 });
    }

    const db = getDb(storageConfig);
    
    // Perform bulk upsert
    // Note: Since we are using cuid for IDs, we'll try to preserve them or create new ones if they don't exist.
    // If a view with the same connectionRef and name exists, we might want to skip or overwrite.
    // For simplicity, we'll just create them. If IDs collide, Prisma will error unless we use upsert.
    
    const results: any[] = await (db as any).$transaction(async (tx: any) => {
      const upserted: any[] = [];
      for (const viewData of views) {
        const { id, name, connectionRef, data, isDefault, autoSaveEnabled } = viewData;

        // Upsert by ID if provided, otherwise by Name/ConnectionRef (though the model doesn't have a unique constraint on name/connectionRef)
        const view = await tx.dashboardView.upsert({
          where: { id: id || 'new-view-' + Math.random() },
          update: {
            name,
            connectionRef,
            data: typeof data === 'string' ? data : JSON.stringify(data),
            isDefault: !!isDefault,
            autoSaveEnabled: !!autoSaveEnabled,
          },
          create: {
            name,
            connectionRef,
            data: typeof data === 'string' ? data : JSON.stringify(data),
            isDefault: !!isDefault,
            autoSaveEnabled: !!autoSaveEnabled,
          }
        });

        // @MX:WARN - Concurrency Risk: Atomic default view enforcement required
        // @MX:REASON - Importing multiple views flagged isDefault would otherwise leave several
        // defaults per connectionRef. Clear other defaults in the same transaction to maintain
        // the single-default invariant (mirrors the PATCH handler in views/[id]/route.ts).
        if (isDefault) {
          await tx.dashboardView.updateMany({
            where: { connectionRef, isDefault: true, id: { not: view.id } },
            data: { isDefault: false }
          });
        }

        upserted.push(view);
      }
      return upserted;
    });

    return NextResponse.json({ success: true, count: results.length });
  } catch (error) {
    console.error('[Views Bulk API] Error importing views:', error);
    return NextResponse.json({ success: false, error: 'Failed to import views' }, { status: 500 });
  }
}
