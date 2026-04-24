import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';

export async function GET() {
  try {
    const engine = getKpiEngine();
    const plugins = engine.getAllPlugins();

    const grouped = {
      processing_time: plugins.filter((p) => p.category === 'processing_time'),
      turnaround: plugins.filter((p) => p.category === 'turnaround'),
      throughput: plugins.filter((p) => p.category === 'throughput'),
      sla: plugins.filter((p) => p.category === 'sla'),
      quality: plugins.filter((p) => p.category === 'quality'),
      custom: plugins.filter((p) => p.category === 'custom'),
    };

    return NextResponse.json({ success: true, plugins: grouped });
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
    const { name, description, category, formula } = body;

    if (!name || !formula) {
      return NextResponse.json(
        { success: false, error: 'name and formula are required' },
        { status: 400 }
      );
    }

    const engine = getKpiEngine();
    const id = `custom_${Date.now()}`;

    engine.registerCustomPlugin({
      id,
      name,
      description: description || `Custom KPI: ${name}`,
      category: category || 'custom',
      unit: body.unit || 'value',
      formula,
    });

    // Save to database
    await db.kpiDefinition.create({
      data: {
        name,
        description: description || `Custom KPI: ${name}`,
        category: category || 'custom',
        formula: JSON.stringify({ formula, unit: body.unit || 'value' }),
        pluginType: 'custom',
      },
    });

    return NextResponse.json({ success: true, pluginId: id });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
