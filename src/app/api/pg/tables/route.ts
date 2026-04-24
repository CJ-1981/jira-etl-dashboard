import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listPostgresTables } from '@/lib/postgres/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { host, port, database, username, password, sslMode, schemaName } = body;

    if (!host || !database || !username || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing connection parameters' },
        { status: 400 }
      );
    }

    const result = await listPostgresTables(
      { host, port: port || 5432, database, username, password, sslMode: sslMode || 'prefer' },
      schemaName || 'public'
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
