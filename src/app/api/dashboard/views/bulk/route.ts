import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { StorageConfigSchema } from '@/lib/validation/schemas';

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
      } catch {
      console.warn('[Views Bulk API] Failed to parse storageConfig');
      }
    }

    // Reject parsed-but-invalid storageConfig before it reaches getDb().
    if (storageConfig !== undefined && !StorageConfigSchema.safeParse(storageConfig).success) {
      return NextResponse.json({ success: false, error: 'Invalid storageConfig' }, { status: 400 });
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
 * Derive a deterministic id for an imported view that lacks one.
 * @MX:WARN: Idempotent bulk import depends on id stability.
 * @MX:REASON: Using Math.random() in the upsert key guaranteed a brand-new row
 * on every re-import of views without ids (duplicate views). Hashing the view's
 * identity (connectionRef + name + data) yields a stable key, so re-importing
 * the same payload upserts the existing row instead of creating duplicates.
 */
function stableViewId(viewData: { name?: unknown; connectionRef?: unknown; data?: unknown }): string {
  const dataString = typeof viewData.data === 'string'
    ? viewData.data
    : JSON.stringify(viewData.data ?? null);
  const digest = crypto
    .createHash('sha256')
    .update(`${viewData.connectionRef ?? ''}\u0000${viewData.name ?? ''}\u0000${dataString}`)
    .digest('hex');
  return `view-${digest}`;
}

/**
 * POST /api/dashboard/views/bulk
 * Imports a list of dashboard views.
 * Used for full configuration import.
 */
export async function POST(request: Request) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route writes dashboard views into the database and the app
  // is unauthenticated; reject cross-origin browser requests (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Malformed JSON payload' }, { status: 400 });
    }
    const { views, storageConfig } = body;

    if (!views || !Array.isArray(views)) {
      return NextResponse.json({ success: false, error: 'Views array is required' }, { status: 400 });
    }

    // Validate untrusted storageConfig before handing it to getDb().
    if (storageConfig !== undefined) {
      const parsedConfig = StorageConfigSchema.safeParse(storageConfig);
      if (!parsedConfig.success) {
        return NextResponse.json({ success: false, error: 'Invalid storageConfig' }, { status: 400 });
      }
    }

    const db = getDb(storageConfig);

    // Bulk upsert keyed by a stable id: explicit ids are preserved; views
    // without one receive a deterministic content-derived id (see stableViewId)
    // so re-importing the same payload updates existing rows instead of
    // duplicating them.
    const results: any[] = await (db as any).$transaction(async (tx: any) => {
      const upserted: any[] = [];
      for (const viewData of views) {
        const { id, name, connectionRef, data, isDefault, autoSaveEnabled } = viewData;
        const effectiveId = id || stableViewId(viewData);

        const view = await tx.dashboardView.upsert({
          where: { id: effectiveId },
          update: {
            name,
            connectionRef,
            data: typeof data === 'string' ? data : JSON.stringify(data),
            isDefault: !!isDefault,
            autoSaveEnabled: !!autoSaveEnabled,
          },
          create: {
            id: effectiveId,
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
