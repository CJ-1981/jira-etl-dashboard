import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  testMetabaseConnection,
  listMetabaseDatabases,
  listMetabaseTables,
  type MetabaseConnectionConfig,
} from '@/lib/metabase/client';

export async function GET() {
  try {
    const connections = await db.metabaseConnection.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const safe = connections.map((c) => ({
      ...c,
      password: c.password ? '••••••••' : '',
      apiKey: c.apiKey ? '••••••••' : null,
    }));

    return NextResponse.json({ success: true, connections: safe });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // ── Save new connection ──
    if (action === 'save') {
      const { name, baseUrl, username, password, apiKey } = body;
      if (!name || !baseUrl || !username || !password) {
        return NextResponse.json(
          { success: false, error: 'name, baseUrl, username, and password are required' },
          { status: 400 }
        );
      }

      const connection = await db.metabaseConnection.create({
        data: {
          name,
          baseUrl: baseUrl.replace(/\/+$/, ''),
          username,
          password,
          apiKey: apiKey || null,
        },
      });

      return NextResponse.json({ success: true, connection });
    }

    // ── Test connection ──
    if (action === 'test') {
      const { baseUrl, username, password, apiKey } = body;
      if (!baseUrl || !username || !password) {
        return NextResponse.json(
          { success: false, error: 'baseUrl, username, and password are required' },
          { status: 400 }
        );
      }

      const config: MetabaseConnectionConfig = {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        username,
        password,
        apiKey: apiKey || null,
      };

      const result = await testMetabaseConnection(config);
      return NextResponse.json(result);
    }

    // ── Test existing connection by ID ──
    if (action === 'testById') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }

      const conn = await db.metabaseConnection.findUnique({ where: { id } });
      if (!conn) {
        return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
      }

      const config: MetabaseConnectionConfig = {
        baseUrl: conn.baseUrl,
        username: conn.username,
        password: conn.password,
        apiKey: conn.apiKey,
      };

      const result = await testMetabaseConnection(config);
      return NextResponse.json(result);
    }

    // ── List databases ──
    if (action === 'databases') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      }

      const conn = await db.metabaseConnection.findUnique({ where: { id } });
      if (!conn) {
        return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
      }

      const config: MetabaseConnectionConfig = {
        baseUrl: conn.baseUrl,
        username: conn.username,
        password: conn.password,
        apiKey: conn.apiKey,
      };

      const result = await listMetabaseDatabases(config);
      return NextResponse.json(result);
    }

    // ── List tables in a database ──
    if (action === 'tables') {
      const { id, databaseId } = body;
      if (!id || !databaseId) {
        return NextResponse.json(
          { success: false, error: 'id and databaseId are required' },
          { status: 400 }
        );
      }

      const conn = await db.metabaseConnection.findUnique({ where: { id } });
      if (!conn) {
        return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
      }

      const config: MetabaseConnectionConfig = {
        baseUrl: conn.baseUrl,
        username: conn.username,
        password: conn.password,
        apiKey: conn.apiKey,
      };

      const result = await listMetabaseTables(config, databaseId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Unknown action. Use: save, test, testById, databases, tables' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    await db.metabaseConnection.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
