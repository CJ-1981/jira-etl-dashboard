import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  handleApiError,
  withRateLimit,
  ValidationError,
  NotFoundError
} from '@/lib/api-error';
import {
  PostgresConnectionCreateSchema,
  PostgresConnectionUpdateSchema,
  PaginationSchema,
  IdQuerySchema,
  validateBody,
  validateQuery
} from '@/lib/validation/schemas';

export const GET = withRateLimit(60, 60000)(async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { page, limit, sortBy = 'createdAt', sortOrder } = validateQuery(PaginationSchema, url.searchParams);

    // Get total count for pagination
    const total = await db.postgresConnection.count({
      where: { isActive: true }
    });

    // Get paginated connections
    const connections = await db.postgresConnection.findMany({
      where: { isActive: true },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Mask passwords before sending to client
    const safe = connections.map((c) => ({
      ...c,
      password: c.password ? '••••••••' : '',
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
    const data = await validateBody(PostgresConnectionCreateSchema, request);

    // Check if connection with same name already exists
    const existing = await db.postgresConnection.findFirst({
      where: {
        name: data.name,
        isActive: true
      }
    });

    if (existing) {
      throw new ValidationError(`A connection with name "${data.name}" already exists`);
    }

    // Sanitize URL by removing trailing slashes
    const sanitizedHost = data.host.replace(/\/+$/, '');

    const connection = await db.postgresConnection.create({
      data: {
        ...data,
        host: sanitizedHost,
      },
    });

    // Return connection without password
    const { password: _, ...safeConnection } = connection;

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
    const url = new URL(request.url);
    const { id } = validateQuery(IdQuerySchema, url.searchParams);
    const data = await validateBody(PostgresConnectionUpdateSchema, request);

    // Check if connection exists
    const connection = await db.postgresConnection.findUnique({
      where: { id }
    });

    if (!connection) {
      throw new NotFoundError('PostgreSQL connection');
    }

    // Check if another connection with the same name already exists
    if (data.name) {
      const existing = await db.postgresConnection.findFirst({
        where: {
          name: data.name,
          isActive: true,
          id: { not: id } // Exclude current connection
        }
      });

      if (existing) {
        throw new ValidationError(`A connection with name "${data.name}" already exists`);
      }
    }

    // Only update fields that are provided
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.host !== undefined) updateData.host = data.host.replace(/\/+$/, '');
    if (data.port !== undefined) updateData.port = data.port;
    if (data.database !== undefined) updateData.database = data.database;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.password !== undefined) updateData.password = data.password;
    if (data.sslMode !== undefined) updateData.sslMode = data.sslMode;
    if (data.schemaName !== undefined) updateData.schemaName = data.schemaName;
    if (data.tableName !== undefined) updateData.tableName = data.tableName;

    const updated = await db.postgresConnection.update({
      where: { id },
      data: updateData,
    });

    // Return connection without password
    const { password: _, ...safeConnection } = updated;

    return NextResponse.json({
      success: true,
      connection: safeConnection
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const { id } = validateQuery(IdQuerySchema, url.searchParams);

    // Check if connection exists
    const connection = await db.postgresConnection.findUnique({
      where: { id }
    });

    if (!connection) {
      throw new NotFoundError('PostgreSQL connection');
    }

    // Soft delete by setting isActive to false
    await db.postgresConnection.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: 'Connection deleted successfully'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
