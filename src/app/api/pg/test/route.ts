import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { ValidationError } from '@/lib/api-error';
import { log } from '@/lib/logger';

/**
 * Extract the hostname from a user-supplied host value that may include
 * protocol, port, path, or bracketed IPv6 form. Returns the lower-cased
 * hostname with any trailing dot stripped, or '' if nothing remains.
 */
function extractHostname(host: string): string {
  let hostname = host.trim();
  // Remove protocol if present
  hostname = hostname.replace(/^https?:\/\//i, '');
  // Remove path
  hostname = hostname.split('/')[0];
  // Handle bracketed IPv6 literals, e.g. `[::1]:5432`
  const bracketMatch = hostname.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch) {
    hostname = bracketMatch[1];
  } else {
    // Remove port
    hostname = hostname.split(':')[0];
  }
  // Strip a trailing dot (FQDN form, e.g. `example.com.`)
  return hostname.replace(/\.$/, '').toLowerCase();
}

/**
 * Validate hostname/IP to prevent SSRF attacks
 * Rejects private/reserved IP ranges (RFC1918, loopback, link-local),
 * IPv6 literals, and alternate-radix IP encodings (decimal/hex/octal).
 */
function validateHostAddress(host: string): { valid: boolean; error?: string } {
  if (typeof host !== 'string' || host.trim().length === 0) {
    return { valid: false, error: 'Invalid hostname format' };
  }

  // @MX:WARN: Extract the actual hostname BEFORE any allow-list check.
  // @MX:REASON: The previous `host.includes('.supabase.co')` check matched attacker
  // suffixes such as `db.x.supabase.co.attacker.com`, which would send the
  // user-supplied database credentials to a server controlled by the attacker.
  // Only a hostname that actually ENDS WITH `.supabase.co` may take the allow path.
  const hostname = extractHostname(host);

  if (!hostname) {
    return { valid: false, error: 'Invalid hostname format' };
  }

  // Allow Supabase domains only when the parsed hostname truly ends with `.supabase.co`
  if (hostname === 'supabase.co' || hostname.endsWith('.supabase.co')) {
    return { valid: true };
  }

  // @MX:WARN: Reject IPv6 literals outright.
  // @MX:REASON: IPv6 forms (`::1`, `[::1]`, IPv4-mapped `::ffff:127.0.0.1`,
  // link-local `fe80::/10`, ULA `fc00::/7`) bypass dotted-quad checks and can
  // reach loopback/internal services. Raw IPv6 literals are never expected as
  // Supabase or managed-database hosts here.
  if (hostname.includes(':')) {
    return { valid: false, error: 'IPv6 addresses are not allowed' };
  }

  // @MX:WARN: Reject alternate-radix IP encodings (decimal, hexadecimal, octal).
  // @MX:REASON: `2130706433`, `0x7f.0.0.1` and `0177.0.0.1` all resolve to
  // 127.0.0.1 on many resolvers, bypassing the dotted-quad range checks below.
  // Block any host made up purely of numeric/hex/octal labels (with or without dots).
  const labels = hostname.split('.');
  const radixLabel = /^(0x[0-9a-f]+|0b[01]+|[0-9]+)$/i; // hex, binary, or decimal integer
  if (labels.every((label) => label.length > 0 && radixLabel.test(label))) {
    return { valid: false, error: 'Numeric IP address encodings are not allowed' };
  }

  // Reject hostnames that are not valid DNS names (blocks userinfo tricks, etc.)
  const dnsLabel = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
  if (!labels.every((label) => label.length > 0 && label.length <= 63 && dnsLabel.test(label))) {
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

    // @MX:REASON: Use the parsed hostname (not the raw user input) for all
    // Supabase-specific behavior below, consistent with the SSRF allow-list above.
    const parsedHostname = extractHostname(host);
    const isSupabaseHost = parsedHostname === 'supabase.co' || parsedHostname.endsWith('.supabase.co');

    // Detect Supabase connection issues
    if (isSupabaseHost) {
      // Check for missing db. prefix
      if (!parsedHostname.startsWith('db.') && !parsedHostname.startsWith('aws-0-')) {
        return NextResponse.json({
          success: false,
          message: 'Invalid Supabase hostname format',
          error: 'Supabase direct connection host must start with "db."',
          diagnostics: {
            correct: `db.${parsedHostname}`,
            current: parsedHostname,
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
    const effectiveSslMode = (isSupabaseHost && sslMode === 'disable') ? 'prefer' : sslMode;
    const sslConfig = effectiveSslMode === 'disable' ? false : { rejectUnauthorized: effectiveSslMode === 'verify-full' };

    const pool = new Pool({
      host,
      port: resolvedPort,
      database,
      user: username,
      password,
      ssl: sslConfig,
      connectionTimeoutMillis: isSupabaseHost ? 15000 : 10000, // Longer timeout for Supabase
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
      if (error.includes(':')) {
        suggestions.push('⚠️ IPv6 Detected: Your network may not support IPv6 connections to Supabase');
        suggestions.push('Try using the Supabase Connection Pooler (Transaction mode)');
        suggestions.push('Or enable the "IPv4 Add-on" in Supabase → Settings → Database');
      }
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
