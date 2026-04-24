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
