import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionRef = searchParams.get('connectionRef');
    const storageConfigRaw = searchParams.get('storageConfig');
    
    if (!connectionRef) {
      return NextResponse.json({ success: false, error: 'connectionRef is required' }, { status: 400 });
    }

    let storageConfig;
    if (storageConfigRaw) {
      try {
        storageConfig = JSON.parse(storageConfigRaw);
      } catch (e) {
        console.warn('[Views API] Failed to parse storageConfig, using default');
      }
    }

    const db = getDb(storageConfig);
    const views = await (db as any).dashboardView.findMany({
      where: { connectionRef },
      orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, views });
  } catch (error) {
    console.error('[Views API] Error fetching views:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch views' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectionRef, name, data, isDefault, autoSaveEnabled, storageConfig } = body;

    if (!connectionRef || !name || !data) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb(storageConfig);
    
    // If setting as default, unset others for this connection
    if (isDefault) {
      await (db as any).dashboardView.updateMany({
        where: { connectionRef, isDefault: true },
        data: { isDefault: false }
      });
    }

    const view = await (db as any).dashboardView.create({
      data: {
        connectionRef,
        name,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        isDefault: !!isDefault,
        autoSaveEnabled: !!autoSaveEnabled,
      }
    });

    return NextResponse.json({ success: true, view });
  } catch (error) {
    console.error('[Views API] Error creating view:', error);
    return NextResponse.json({ success: false, error: 'Failed to create view' }, { status: 500 });
  }
}
