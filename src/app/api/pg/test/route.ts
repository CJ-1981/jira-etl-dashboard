import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { handleApiError, ValidationError } from '@/lib/api-error';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { host, port, database, username, password, sslMode } = body;

    if (!host || !database || !username || !password) {
      throw new ValidationError('host, database, username, and password are required');
    }

    log.info('Testing PostgreSQL connection', 'POST /api/pg/test', {
      host,
      port: parseInt(port) || 5432,
      database,
      username
    });

    const sslConfig = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' };

    const pool = new Pool({
      host,
      port: parseInt(port) || 5432,
      database,
      user: username,
      password,
      ssl: sslConfig,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query('SELECT version(), current_database(), current_user');
      const version = result.rows[0]?.version || 'Unknown';
      const currentDatabase = result.rows[0]?.current_database || database;
      const currentUser = result.rows[0]?.current_user || username;
      const responseTime = Date.now() - startTime;

      log.info('PostgreSQL connection test successful', 'POST /api/pg/test', {
        responseTime: `${responseTime}ms`,
        database: currentDatabase,
        user: currentUser
      });

      return NextResponse.json({
        success: true,
        message: 'Connection successful!',
        serverInfo: {
          version,
          database: currentDatabase,
          user: currentUser
        },
        diagnostics: {
          responseTime: `${responseTime}ms`,
          host,
          port: parseInt(port) || 5432,
          database: currentDatabase,
          sslMode,
          timestamp: new Date().toISOString()
        }
      }, { status: 200 });
    } finally {
      await pool.end();
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    log.error('PostgreSQL connection test failed', 'POST /api/pg/test', error as Error, {
      responseTime: `${responseTime}ms`
    });

    return NextResponse.json({
      success: false,
      message: 'Connection failed',
      error: error instanceof Error ? error.message : 'Connection failed',
      diagnostics: {
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        suggestions: getPostgreSuggestions(error instanceof Error ? error.message : '')
      }
    }, { status: 400 });  // Return 400 for connection failures
  }
}

/**
 * Provide helpful suggestions based on error type
 */
function getPostgreSuggestions(error: string): string[] {
  const suggestions: string[] = [];

  if (error.includes('ECONNREFUSED') || error.includes('connect')) {
    suggestions.push('Check that PostgreSQL server is running');
    suggestions.push('Verify the host and port are correct');
    suggestions.push('Check firewall settings');
  } else if (error.includes('password') || error.includes('authentication')) {
    suggestions.push('Verify username and password are correct');
    suggestions.push('Check database user permissions');
    suggestions.push('Make sure the user can connect from this IP');
  } else if (error.includes('database') && error.includes('does not exist')) {
    suggestions.push('The database does not exist');
    suggestions.push('Create the database or check the spelling');
    suggestions.push('Verify your database permissions');
  } else if (error.includes('SSL')) {
    suggestions.push('Try changing SSL mode');
    suggestions.push('Check if PostgreSQL requires SSL connections');
    suggestions.push('Verify SSL certificate settings');
  }

  return suggestions;
}
