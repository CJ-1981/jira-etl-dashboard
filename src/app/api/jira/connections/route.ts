import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  handleApiError,
  withRateLimit,
  ValidationError,
  NotFoundError
} from '@/lib/api-error';
import {
  JiraConnectionCreateSchema,
  PaginationSchema,
  IdQuerySchema,
  validateBody,
  validateQuery
} from '@/lib/validation/schemas';

export const GET = withRateLimit(60, 60000)(async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { page, limit, sortBy = 'order', sortOrder = 'asc' } = validateQuery(PaginationSchema, url.searchParams);

    // Get total count for pagination
    const total = await db.jiraConnection.count({
      where: { isActive: true }
    });

    // Get paginated connections
    const connections = await db.jiraConnection.findMany({
      where: { isActive: true },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Mask API tokens before sending to client
    const safe = connections.map((c) => ({
      ...c,
      apiToken: c.apiToken ? `${c.apiToken.slice(0, 4)}****` : '',
    }));

    return NextResponse.json({
      success: true,
      connections: safe,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export async function POST(request: Request) {
  try {
    const data = await validateBody(JiraConnectionCreateSchema, request);

    // Check if connection with same name already exists
    const existing = await db.jiraConnection.findFirst({
      where: {
        name: data.name,
        isActive: true
      }
    });

    if (existing) {
      throw new ValidationError(`A connection with name "${data.name}" already exists`);
    }

    // Get the highest order value and increment
    const maxOrder = await db.jiraConnection.findFirst({
      where: { isActive: true },
      orderBy: { order: 'desc' },
      select: { order: true }
    });

    // Sanitize URL by ensuring protocol and removing trailing slashes
    let sanitizedBaseUrl = data.baseUrl.replace(/\/+$/, '');

    // Add https:// if no protocol is specified
    if (!sanitizedBaseUrl.startsWith('http://') && !sanitizedBaseUrl.startsWith('https://')) {
      sanitizedBaseUrl = `https://${sanitizedBaseUrl}`;
    }

    const connection = await db.jiraConnection.create({
      data: {
        ...data,
        baseUrl: sanitizedBaseUrl,
        projectKeys: Array.isArray(data.projectKeys) ? data.projectKeys.join(',') : data.projectKeys,
        order: (maxOrder?.order || 0) + 1,
      },
    });

    // Return connection without sensitive data
    const { apiToken: _, ...safeConnection } = connection;

    return NextResponse.json({
      success: true,
      connection: safeConnection
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { id, apiToken, order, ...updateFields } = data;
    if (!id) throw new ValidationError("ID is required for update");

    let sanitizedBaseUrl = updateFields.baseUrl ? updateFields.baseUrl.replace(/\/+$/, '') : undefined;

    // Add https:// if no protocol is specified
    if (sanitizedBaseUrl && !sanitizedBaseUrl.startsWith('http://') && !sanitizedBaseUrl.startsWith('https://')) {
      sanitizedBaseUrl = `https://${sanitizedBaseUrl}`;
    }

    const updateData: any = {
      ...updateFields,
      baseUrl: sanitizedBaseUrl,
      projectKeys: Array.isArray(updateFields.projectKeys) ? updateFields.projectKeys.join(',') : updateFields.projectKeys,
    };

    // Only update apiToken if it's not the masked placeholder (ends with ****)
    if (apiToken && !apiToken.includes('****')) {
      updateData.apiToken = apiToken;
    }

    // Only update order if explicitly provided
    if (order !== undefined) {
      updateData.order = order;
    }

    const connection = await db.jiraConnection.update({
      where: { id },
      data: updateData,
    });

    const { apiToken: _, ...safeConnection } = connection;
    return NextResponse.json({ success: true, connection: safeConnection });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const { id } = validateQuery(IdQuerySchema, url.searchParams);

    // Check if connection exists
    const connection = await db.jiraConnection.findUnique({
      where: { id }
    });

    if (!connection) {
      throw new NotFoundError('Jira connection');
    }

    // Find all ETL runs associated with this connection
    const etlRuns = await (db as any).etlRun.findMany({
      where: { connectionId: id },
      select: { id: true }
    });

    const etlRunIds = etlRuns.map((run: any) => run.id);

    // Cascade delete all associated data
    if (etlRunIds.length > 0) {
      // Delete KPI results associated with these runs
      await (db as any).kpiResult.deleteMany({
        where: {
          etlRunId: {
            in: etlRunIds
          }
        }
      });

      // Delete ticket transitions (via snapshots)
      const snapshotIds = await (db as any).ticketSnapshot.findMany({
        where: {
          etlRunId: {
            in: etlRunIds
          }
        },
        select: { id: true }
      });

      if (snapshotIds.length > 0) {
        await (db as any).ticketTransition.deleteMany({
          where: {
            ticketSnapshotId: {
              in: snapshotIds.map((s: any) => s.id)
            }
          }
        });
      }

      // Delete ticket snapshots
      await (db as any).ticketSnapshot.deleteMany({
        where: {
          etlRunId: {
            in: etlRunIds
          }
        }
      });

      // Delete ETL runs
      await (db as any).etlRun.deleteMany({
        where: {
          connectionId: id
        }
      });
    }

    // Soft delete by setting isActive to false
    await db.jiraConnection.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Connection deleted successfully',
      deleted: {
        etlRuns: etlRunIds.length
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { connections } = body;

    if (!Array.isArray(connections)) {
      throw new ValidationError('connections must be an array');
    }

    // Update orders for all connections
    await Promise.all(
      connections.map((conn: { id: string; order: number }) =>
        db.jiraConnection.update({
          where: { id: conn.id },
          data: { order: conn.order }
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: 'Connections reordered successfully'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
