import { PrismaClient as PrismaClientDefault } from '@prisma/client'
// Import the specialized clients
// @ts-ignore
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
// @ts-ignore
import { PrismaClient as PostgresClient } from '../../prisma/generated/postgresql';
// Use a global cache to avoid excessive client instantiation in serverless env
type DbClient = SQLiteClient | PostgresClient;
const prismaClientCache = new Map<string, DbClient>();

/**
 * Determine the provider type from a connection URL
 */
function determineProvider(url: string): 'postgres' | 'sqlite' | 'unknown' {
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) return 'postgres';
  if (url.startsWith('file:') || url.startsWith('sqlite:') || url.startsWith('sqlite3:')) return 'sqlite';
  return 'unknown';
}

/**
 * Validates that a database host is safe to connect to.
 * Only allows local files, localhost, and trusted cloud providers (Supabase).
 */
function validateDatabaseHost(urlStr: string): void {
  let host: string;
  try {
    if (urlStr.startsWith('file:')) return; // Local SQLite is safe
    const url = new URL(urlStr);
    host = url.hostname;
  } catch (e) {
    throw new Error('Invalid database connection URL.');
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const isSupabase = host.endsWith('.supabase.co') || host.endsWith('.supabase.com') || host.endsWith('.supabase.net');

  if (!isLocal && !isSupabase) {
    // @MX:WARN - SSRF Protection: Blocking connection to untrusted host
    // @MX:REASON - Prevent Server-Side Request Forgery (SSRF) by restricting database connections 
    // to known safe environments (local or trusted managed cloud providers).
    throw new Error(`Connection to host '${host}' is not allowed for security reasons. Only Supabase and local connections are permitted.`);
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

export function getDb(config?: string | { provider?: string, connectionId?: string, url?: string, host?: string, port?: number, database?: string, username?: string, password?: string }): DbClient {
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

  const provider = determineProvider(effectiveUrl);
  
  console.log(`[DB] Initializing ${provider} client for URL: ${redactUrl(effectiveUrl)}...`);

  let client: DbClient;
  
  try {
    if (provider === 'postgres') {
      client = new PostgresClient({
        datasources: { db: { url: effectiveUrl } },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    } else if (provider === 'sqlite') {
      client = new SQLiteClient({
        datasources: { db: { url: effectiveUrl } },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    } else {
      throw new Error(`Unsupported database scheme for URL: ${redactUrl(effectiveUrl)}`);
    }
  } catch (err) {
    console.error(`[DB] Failed to initialize ${provider} client:`, err);
    // @MX:WARN - Unsafe fallback removed
    // @MX:REASON - Automatic fallback to PrismaClientDefault is unsafe because the compiled 
    // @prisma/client may target a different provider than the effectiveUrl (e.g. PostgresClient 
    // trying to connect to SQLite or vice versa).
    throw err;
  }

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

// Lazy accessor for the default database instance
let cachedDefaultDb: DbClient | null = null;

export function getDefaultDb(): DbClient {
  if (cachedDefaultDb) return cachedDefaultDb;
  
  try {
    const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
    cachedDefaultDb = getDb(url);
    return cachedDefaultDb;
  } catch (err) {
    console.error('[DB] Failed to initialize default database:', err);
    throw err;
  }
}

// Export a proxy for backward compatibility if needed, or just let callers use getDefaultDb()
export const db = (typeof process !== 'undefined') ? {
  get client() { return getDefaultDb(); },
} : ({} as any);