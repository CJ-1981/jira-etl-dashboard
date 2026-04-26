import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { ValidationError } from '@/lib/api-error';
import { log } from '@/lib/logger';
import { db } from '@/lib/db';

/**
 * Validate hostname/IP to prevent SSRF attacks
 * Rejects private/reserved IP ranges (RFC1918, loopback, link-local)
 */
function validateHostAddress(host: string): { valid: boolean; error?: string } {
  // Allow Supabase domains (already validated below)
  if (host.includes('.supabase.co')) {
    return { valid: true };
  }

  // Extract hostname if URL format provided
  let hostname = host;
  try {
    // Remove protocol if present
    hostname = hostname.replace(/^https?:\/\//, '');
    // Remove port and path
    hostname = hostname.split('/')[0].split(':')[0];
  } catch {
    return { valid: false, error: 'Invalid hostname format' };
  }

  // Check if it's an IP address
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const octets = match.slice(1, 5).map(Number);

    // Validate each octet is 0-255
    if (octets.some(o => o > 255)) {
      return { valid: false, error: 'Invalid IPv4 address' };
    }

    const [first, second] = octets;

    // Reject private ranges (RFC1918)
    if (
      first === 10 || // 10.0.0.0/8
      (first === 172 && second >= 16 && second <= 31) || // 172.16.0.0/12
      (first === 192 && second === 168) // 192.168.0.0/16
    ) {
      return { valid: false, error: 'Private IP addresses are not allowed (RFC1918)' };
    }

    // Reject loopback
    if (first === 127) {
      return { valid: false, error: 'Loopback addresses are not allowed' };
    }

    // Reject link-local
    if (first === 169 && second === 254) {
      return { valid: false, error: 'Link-local addresses are not allowed' };
    }

    // Reject multicast
    if (first >= 224 && first <= 239) {
      return { valid: false, error: 'Multicast addresses are not allowed' };
    }

    // Reject reserved
    if (first >= 240) {
      return { valid: false, error: 'Reserved addresses are not allowed' };
    }
  }

  return { valid: true };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let capturedHost = '';

  try {
    const body = await request.json();

    let host: string, port: string | number, database: string, username: string, password: string, sslMode: string, resolvedPort: number;
    // capturedHost is used in the catch block for Supabase-specific suggestions

    // Connections are managed client-side in localStorage, not stored in database
    // All connection parameters must be provided in the request body
    host = body.host;
    port = body.port;
    database = body.database;
    username = body.username;
    password = body.password;
    sslMode = body.sslMode;

    capturedHost = host;
    resolvedPort = typeof port === 'number' ? port : (parseInt(port as string, 10) || 5432);

    if (!host || !database || !username || !password) {
      throw new ValidationError('host, database, username, and password are required');
    }

    // SSRF protection: validate host address
    const hostValidation = validateHostAddress(host);
    if (!hostValidation.valid) {
      return NextResponse.json({
        success: false,
        message: 'Invalid or prohibited host address',
        error: hostValidation.error
      }, { status: 400 });
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
