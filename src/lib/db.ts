import { PrismaClient as PrismaClientDefault } from '@prisma/client'
// Import the specialized clients
// @ts-ignore
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
// Use a global cache to avoid excessive client instantiation in serverless env
const prismaClientCache = new Map<string, any>();

/**
 * Validates that a database host is safe to connect to.
 * Only allows local files, localhost, and trusted cloud providers (Supabase).
 */
function validateDatabaseHost(urlStr: string): void {
  try {
    if (urlStr.startsWith('file:')) return; // Local SQLite is safe
    
    const url = new URL(urlStr);
    const host = url.hostname;
    
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isSupabase = host.endsWith('.supabase.co') || host.endsWith('.supabase.com') || host.endsWith('.supabase.net');
    
    if (!isLocal && !isSupabase) {
      // @MX:WARN - SSRF Protection: Blocking connection to untrusted host
      throw new Error(`Connection to host '${host}' is not allowed for security reasons. Only Supabase and local connections are permitted.`);
    }
  } catch (e: any) {
    if (e.message?.includes('not allowed')) throw e;
    throw new Error('Invalid database connection URL.');
  }
}

/**
 * Redact sensitive info from connection URL for logging
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.split('@')[0] + (url.includes('@') ? '@***' : '');
  }
}

export function getDb(config?: string | { provider?: string, connectionId?: string, url?: string, host?: string, port?: number, database?: string, username?: string, password?: string }): any {
  // If config is a string, it's either an internal call with a trusted URL or a fallback
  let effectiveUrl: string | undefined;
  const envUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;

  if (typeof config === 'string') {
    effectiveUrl = config;
  } else if (config) {
    if (config.connectionId === 'primary') {
      effectiveUrl = envUrl;
    } else if (config.provider === 'sqlite') {
      effectiveUrl = config.url || 'file:./db/custom.db';
    } else if (config.provider === 'postgresql') {
      // If we have parts, build the URL server-side (safer)
      if (config.host && config.username) {
        effectiveUrl = buildPgUrl({
          host: config.host,
          port: config.port || 5432,
          database: config.database || 'postgres',
          username: config.username,
          password: config.password
        });
      } else {
        effectiveUrl = config.url;
      }
    }
  }

  // Final fallback
  effectiveUrl = effectiveUrl || envUrl || 'file:./db/custom.db';

  // SSRF Protection: Validate the host before proceeding
  validateDatabaseHost(effectiveUrl);

  // Check cache (using URL as key)
  if (prismaClientCache.has(effectiveUrl)) {
    return prismaClientCache.get(effectiveUrl)!;
  }

  const isPostgres = effectiveUrl.startsWith('postgresql://') || effectiveUrl.startsWith('postgres://');
  const ClientClass = isPostgres ? PostgresClient : SQLiteClient;

  console.log(`[DB] Initializing ${isPostgres ? 'PostgreSQL' : 'SQLite'} client for URL: ${redactUrl(effectiveUrl)}...`);

  // Instantiate new client with dynamic datasource
  const client = new ClientClass({
    datasources: {
      db: {
        url: effectiveUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  prismaClientCache.set(effectiveUrl, client);
  return client;
}

/**
 * Build a standard PostgreSQL connection string from parts
 */
export function buildPgUrl(conn: {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  sslMode?: string;
}): string {
  const { host, port, database, username, password, sslMode = 'prefer' } = conn;
  
  // Percent-encode components for safety
  const encodedUser = encodeURIComponent(username);
  const encodedPass = password ? `:${encodeURIComponent(password)}` : '';
  const authPart = `${encodedUser}${encodedPass}`;
  
  return `postgresql://${authPart}@${host}:${port}/${database}?sslmode=${sslMode}`;
}

// Default export for backward compatibility
// We pass the envUrl to ensure it's resolved correctly at initialization
export const db = (typeof process !== 'undefined') 
  ? getDb(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL) 
  : ({} as any);