import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');
const POLLING_PATH = path.join(process.cwd(), 'data', 'polling.json');

function readJsonFile(filePath: string) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

export async function GET() {
  try {
    // Gather all configuration without sensitive data
    const jiraConnections = await db.jiraConnection.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        email: true,
        projectKeys: true,
        isActive: true,
        createdAt: true,
        // NOT apiToken
      },
    });

    const pgConnections = await db.postgresConnection.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        database: true,
        username: true,
        sslMode: true,
        schemaName: true,
        tableName: true,
        isActive: true,
        createdAt: true,
        // NOT password
      },
    });

    const customPlugins = await db.kpiDefinition.findMany({
      where: { pluginType: 'custom', isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        formula: true,
        unit: true,
      },
    });

    const settings = readJsonFile(SETTINGS_PATH);
    const pollingConfig = readJsonFile(POLLING_PATH);

    const config = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      jiraConnections,
      pgConnections,
      customPlugins,
      settings,
      pollingConfig,
    };

    return NextResponse.json({ success: true, config });
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
    const config = body.config || body;

    if (!config || !config.version) {
      return NextResponse.json(
        { success: false, error: 'Invalid config format. Missing version.' },
        { status: 400 }
      );
    }

    const importResults: { type: string; count: number; errors: string[] }[] = [];

    // Import Jira connections (without apiToken - user needs to re-enter)
    if (config.jiraConnections && Array.isArray(config.jiraConnections)) {
      let count = 0;
      const errors: string[] = [];
      for (const conn of config.jiraConnections) {
        if (!conn.name || !conn.baseUrl || !conn.email || !conn.projectKeys) {
          errors.push(`Skipped Jira connection "${conn.name}": missing required fields`);
          continue;
        }
        try {
          await db.jiraConnection.create({
            data: {
              name: `${conn.name} (imported)`,
              baseUrl: conn.baseUrl,
              email: conn.email,
              apiToken: '', // User needs to re-enter
              projectKeys: Array.isArray(conn.projectKeys) ? conn.projectKeys.join(',') : conn.projectKeys,
              isActive: true,
            },
          });
          count++;
        } catch (err) {
          errors.push(`Failed to import Jira connection "${conn.name}": ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
      importResults.push({ type: 'jiraConnections', count, errors });
    }

    // Import PG connections (without password)
    if (config.pgConnections && Array.isArray(config.pgConnections)) {
      let count = 0;
      const errors: string[] = [];
      for (const conn of config.pgConnections) {
        if (!conn.name || !conn.host || !conn.database || !conn.username) {
          errors.push(`Skipped PG connection "${conn.name}": missing required fields`);
          continue;
        }
        try {
          await db.postgresConnection.create({
            data: {
              name: `${conn.name} (imported)`,
              host: conn.host,
              port: conn.port || 5432,
              database: conn.database,
              username: conn.username,
              password: '', // User needs to re-enter
              sslMode: conn.sslMode || 'prefer',
              schemaName: conn.schemaName || 'public',
              tableName: conn.tableName || 'jira_kpi_results',
              isActive: true,
            },
          });
          count++;
        } catch (err) {
          errors.push(`Failed to import PG connection "${conn.name}": ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
      importResults.push({ type: 'pgConnections', count, errors });
    }

    // Import custom plugins
    if (config.customPlugins && Array.isArray(config.customPlugins)) {
      let count = 0;
      const errors: string[] = [];
      for (const plugin of config.customPlugins) {
        if (!plugin.name || !plugin.formula) {
          errors.push(`Skipped plugin "${plugin.name}": missing required fields`);
          continue;
        }
        try {
          await db.kpiDefinition.create({
            data: {
              name: `${plugin.name} (imported)`,
              description: plugin.description || '',
              category: plugin.category || 'custom',
              formula: typeof plugin.formula === 'string' ? plugin.formula : JSON.stringify(plugin.formula),
              pluginType: 'custom',
              isActive: true,
            },
          });
          count++;
        } catch (err) {
          errors.push(`Failed to import plugin "${plugin.name}": ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
      importResults.push({ type: 'customPlugins', count, errors });
    }

    // Import settings
    if (config.settings) {
      const dataDir = path.join(process.cwd(), 'data');
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      writeFileSync(SETTINGS_PATH, JSON.stringify(config.settings, null, 2), 'utf-8');
      importResults.push({ type: 'settings', count: 1, errors: [] });
    }

    // Import polling config
    if (config.pollingConfig) {
      const dataDir = path.join(process.cwd(), 'data');
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      writeFileSync(POLLING_PATH, JSON.stringify(config.pollingConfig, null, 2), 'utf-8');
      importResults.push({ type: 'pollingConfig', count: 1, errors: [] });
    }

    return NextResponse.json({
      success: true,
      message: 'Configuration imported successfully',
      results: importResults,
      note: 'Credentials (API tokens, passwords) were not imported. Please re-enter them in the Connections tab.',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
