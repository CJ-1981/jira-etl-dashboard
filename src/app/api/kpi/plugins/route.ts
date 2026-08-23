import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const engine = getKpiEngine();
    const plugins = engine.getAllPlugins();

    // Transform to a format suitable for the UI, identifying them as builtin
    const pluginList = plugins.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      domain: p.domain,
      unit: p.unit,
      pluginType: 'builtin',
      isActive: true
    }));

    return NextResponse.json({ success: true, plugins: pluginList });
  } catch (error) {
    return handleApiError(error);
  }
}
