import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/kpi/plugins/custom
 * List all custom plugins
 */
export async function GET() {
  try {
    const engine = getKpiEngine();
    const allPlugins = engine.getAllPlugins();

    // Filter only custom plugins
    const customPlugins = allPlugins.filter(p => p.category === 'custom');

    return NextResponse.json({
      success: true,
      plugins: customPlugins.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        domain: p.domain,
        category: p.category,
        version: p.version,
        unit: p.unit,
        isActive: p.isActive ?? true
      }))
    });
  } catch (error) {
    console.error('[API] Failed to fetch custom plugins:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch custom plugins' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kpi/plugins/custom
 * Upload and register a new custom plugin
 *
 * Expected body: {
 *   id: string;
 *   name: string;
 *   domain: string;
 *   unit: string;
 *   calculate: string; // Function body as string
 *   description?: string;
 *   version?: string;
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, domain, unit, calculate, description, version } = body;

    // Validate required fields
    if (!id || !name || !domain || !unit || !calculate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: id, name, domain, unit, calculate' },
        { status: 400 }
      );
    }

    // Sanitize domain and id to prevent path traversal
    let safeDomain: string;
    let safeId: string;
    try {
      safeDomain = sanitizeSegment(domain);
      safeId = sanitizeSegment(id);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }

    // Create custom plugin file
    const customDir = path.join(process.cwd(), 'src', 'lib', 'kpi', 'plugins', 'custom', safeDomain);
    fs.mkdirSync(customDir, { recursive: true });

    const pluginFilePath = path.join(customDir, `${safeId}.ts`);
    const pluginCode = generatePluginFile(safeId, name, safeDomain, unit, calculate, description, version);

    fs.writeFileSync(pluginFilePath, pluginCode, 'utf-8');

    // Reload plugins
    const engine = getKpiEngine();
    // Note: In a real implementation, we'd need to reload the engine or register the new plugin
    // For now, this requires a server restart to take effect

    return NextResponse.json({
      success: true,
      message: 'Custom plugin created. Server restart required to activate.',
      plugin: {
        id,
        name,
        domain,
        unit,
        description,
        version: version || '1.0.0'
      }
    });
  } catch (error) {
    console.error('[API] Failed to create custom plugin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create custom plugin' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/kpi/plugins/custom
 * Enable/disable a custom plugin
 *
 * Expected body: {
 *   pluginId: string;
 *   isActive: boolean;
 * }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { pluginId, isActive } = body;

    if (!pluginId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: pluginId, isActive' },
        { status: 400 }
      );
    }

    const engine = getKpiEngine();
    const plugin = engine.getPlugin(pluginId);

    if (!plugin) {
      return NextResponse.json(
        { success: false, error: 'Plugin not found' },
        { status: 404 }
      );
    }

    if (plugin.category !== 'custom') {
      return NextResponse.json(
        { success: false, error: 'Only custom plugins can be modified' },
        { status: 400 }
      );
    }

    // Update plugin active state
    plugin.isActive = isActive;

    return NextResponse.json({
      success: true,
      message: `Plugin ${isActive ? 'enabled' : 'disabled'}`,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        isActive: plugin.isActive
      }
    });
  } catch (error) {
    console.error('[API] Failed to update plugin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update plugin' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/kpi/plugins/custom?pluginId=xxx
 * Remove a custom plugin
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pluginId = searchParams.get('pluginId');

    if (!pluginId) {
      return NextResponse.json(
        { success: false, error: 'Missing pluginId parameter' },
        { status: 400 }
      );
    }

    // Sanitize pluginId to prevent path traversal
    let safeId: string;
    try {
      safeId = sanitizeSegment(pluginId);
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }

    const engine = getKpiEngine();
    const plugin = engine.getPlugin(safeId);

    if (!plugin) {
      return NextResponse.json(
        { success: false, error: 'Plugin not found' },
        { status: 404 }
      );
    }

    if (plugin.category !== 'custom') {
      return NextResponse.json(
        { success: false, error: 'Only custom plugins can be deleted' },
        { status: 400 }
      );
    }

    // Sanitize domain from plugin info for extra safety
    const safeDomain = sanitizeSegment(plugin.domain);

    // Delete plugin file
    const customDir = path.join(process.cwd(), 'src', 'lib', 'kpi', 'plugins', 'custom', safeDomain);
    const pluginFilePath = path.join(customDir, `${safeId}.ts`);

    if (fs.existsSync(pluginFilePath)) {
      await fs.promises.unlink(pluginFilePath);
    }

    // Unregister from engine
    engine.unregister(safeId);

    return NextResponse.json({
      success: true,
      message: 'Plugin deleted successfully'
    });
  } catch (error) {
    console.error('[API] Failed to delete plugin:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete plugin' },
      { status: 500 }
    );
  }
}

/**
 * Generate a plugin file template from user input
 */
function generatePluginFile(
  id: string,
  name: string,
  domain: string,
  unit: string,
  calculate: string,
  description?: string,
  version?: string
): string {
  return `/**
 * ${name}
 * ${description || 'Custom KPI plugin'}
 *
 * Generated automatically. Feel free to modify this file directly.
 */

import type { KpiPlugin } from '../../types';

const ${id}Plugin: KpiPlugin = {
  id: '${id}',
  name: '${name}',
  category: 'custom',
  domain: '${domain}',
  version: '${version || '1.0.0'}',
  unit: '${unit}',
  ${description ? `description: '${description}',` : ''}
  calculate: ${calculate}
};

export default ${id}Plugin;
`;
}

/**
 * Sanitize a path segment to prevent traversal attacks
 */
function sanitizeSegment(segment: string): string {
  if (!segment || typeof segment !== 'string') {
    throw new Error('Invalid segment: must be a non-empty string');
  }
  // Allow only alphanumeric, underscore, and hyphen
  if (!/^[a-z0-9_-]+$/i.test(segment)) {
    throw new Error(`Invalid segment: "${segment}" contains unsafe characters`);
  }
  return segment;
}

