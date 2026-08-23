/**
 * DELETE /api/jira/connections/[connectionId]
 *
 * Removes all extraction data (ETL runs, ticket snapshots, transitions, KPI
 * results, dashboard views, master tickets) for a connection from the
 * database. The caller (ConnectionsPanel) is responsible for deleting the
 * browser-side connection configuration from localStorage once this endpoint
 * reports success.
 *
 * ConnectionsPanel sends a bare DELETE with no body, so this defaults to the
 * app's primary database. An optional { storageConfig } JSON body is honored
 * when present, so callers targeting an alternate (e.g. PostgreSQL) backend
 * are also supported.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { deleteConnectionData } from '@/lib/db-cascade';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { connectionId } = await params;

    // The component sends no body; fall back to the default DB in that case.
    let storageConfig: unknown;
    try {
      const body = await request.json();
      storageConfig = body?.storageConfig;
    } catch {
      // Empty/non-JSON body — use the default database.
    }

    const db = getDb(storageConfig as Parameters<typeof getDb>[0]);

    // Run the whole cascade in a single transaction so a failure mid-way
    // cannot leave the connection's data half-deleted.
    const result = await deleteConnectionData(
      db,
      connectionId
    );

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.runCount} extractions and ${result.masterTicketCount} master tickets (${result.deletedCount} records).`,
    });
  } catch (error) {
    console.error('[Connections DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete connection data' },
      { status: 500 }
    );
  }
}
