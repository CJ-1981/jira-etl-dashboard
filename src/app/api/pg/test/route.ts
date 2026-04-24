import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { ValidationError } from '@/lib/api-error';
import { log } from '@/lib/logger';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const startTime = Date.now();
  let capturedHost = '';

  try {
    const body = await request.json();

    let host: string, port: string | number, database: string, username: string, password: string, sslMode: string, resolvedPort: number;
    // capturedHost is used in the catch block for Supabase-specific suggestions

    // testById: look up the real password server-side so we never rely on the masked client value
    if (body.id) {
      const conn = await db.postgresConnection.findUnique({ where: { id: body.id } });
      if (!conn) {
        return NextResponse.json({ success: false, error: 'Connection not found' }, { status: 404 });
      }
      ({ host, port, database, username, password, sslMode } = {
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
        sslMode: conn.sslMode,
      });
    } else {
      host = body.host;
      port = body.port;
      database = body.database;
      username = body.username;
      password = body.password;
      sslMode = body.sslMode;
    }

    capturedHost = host;
    resolvedPort = typeof port === 'number' ? port : (parseInt(port as string, 10) || 5432);

    if (!host || !database || !username || !password) {
      throw new ValidationError('host, database, username, and password are required');
    }

    // Detect Supabase connection issues
    if (host.includes('.supabase.co')) {
      // Check for missing db. prefix
      if (!host.startsWith('db.') && !host.startsWith('aws-0-')) {
        return NextResponse.json({
          success: false,
          message: 'Invalid Supabase hostname format',
          error: 'Supabase direct connection host must start with "db."',
          diagnostics: {
            correct: `db.${host}`,
            current: host,
            suggestions: [
              'Use the format: db.<project-ref>.supabase.co',
              'Example: db.nrwuteocoqmvibocjvtv.supabase.co',
              'Find this in Supabase → Settings → Database → Connection Info',
            ]
          }
        }, { status: 400 });
      }
    }

    log.info('Testing PostgreSQL connection', 'POST /api/pg/test', {
      host,
      port: resolvedPort,
      database,
      username
    });

    // Force SSL for Supabase
    const effectiveSslMode = (host.includes('.supabase.co') && sslMode === 'disable') ? 'prefer' : sslMode;
    const sslConfig = effectiveSslMode === 'disable' ? false : { rejectUnauthorized: effectiveSslMode === 'verify-full' };

    const pool = new Pool({
      host,
      port: resolvedPort,
      database,
      user: username,
      password,
      ssl: sslConfig,
      connectionTimeoutMillis: host.includes('.supabase.co') ? 15000 : 10000, // Longer timeout for Supabase
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
          port: resolvedPort,
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
        suggestions: getPostgreSuggestions(error instanceof Error ? error.message : '', capturedHost)
      }
    }, { status: 400 });  // Return 400 for connection failures
  }
}

/**
 * Provide helpful suggestions based on error type
 */
function getPostgreSuggestions(error: string, host?: string): string[] {
  const suggestions: string[] = [];

  if (error.includes('ECONNREFUSED') || error.includes('connect')) {
    suggestions.push('Check that PostgreSQL server is running');
    suggestions.push('Verify the host and port are correct');
    suggestions.push('Check firewall settings');

    // Supabase-specific suggestions
    if (host && host.includes('.supabase.co')) {
      suggestions.push('⚠️ Supabase: Your project might be paused (free tier)');
      suggestions.push('Go to Supabase → Settings → Database → Click "Resume Database"');
      suggestions.push('Check if IPv4 is enabled in Supabase → Settings → Database');
      suggestions.push('Verify your Supabase project is active');
    }
  } else if (error.includes('password') || error.includes('authentication')) {
    suggestions.push('Verify username and password are correct');
    suggestions.push('Check database user permissions');
    suggestions.push('Make sure the user can connect from this IP');

    if (host && host.includes('.supabase.co')) {
      suggestions.push('⚠️ Supabase: Use the Database Password (NOT API keys)');
      suggestions.push('Go to Supabase → Settings → Database → Database Password');
      suggestions.push('Reset database password if needed');
    }
  } else if (error.includes('database') && error.includes('does not exist')) {
    suggestions.push('The database does not exist');
    suggestions.push('Create the database or check the spelling');
    suggestions.push('Verify your database permissions');
  } else if (error.includes('SSL')) {
    suggestions.push('Try changing SSL mode to "require" or "prefer"');
    suggestions.push('Check if PostgreSQL requires SSL connections');
    suggestions.push('Verify SSL certificate settings');
    suggestions.push('⚠️ Supabase: Set SSL Mode to "require" (Supabase requires SSL)');
  } else if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
    suggestions.push('Connection timed out - server may be unreachable');
    suggestions.push('Check if the host is correct and accessible');
    suggestions.push('Verify network connectivity and firewall rules');
    suggestions.push('Try using "require" for SSL mode instead of "verify-full"');
  } else if (error.includes('no tenant identifier') || error.includes('external_id') || error.includes('sni_hostname')) {
    suggestions.push('This appears to be a Supabase pooler connection');
    suggestions.push('For Supabase, use the direct connection URL (not pooler)');
    suggestions.push('Supabase direct URL format: db.<project-ref>.supabase.co');
    suggestions.push('Pooler URLs (aws-0-*.pooler.supabase.com) require additional parameters');
  }

  return suggestions;
}
