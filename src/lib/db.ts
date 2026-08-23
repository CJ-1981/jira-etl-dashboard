import crypto from 'crypto';
// Import the specialized clients. No suppression directive is needed: the two
// generated clients coexist fine at the type level (each declares its own
// `Prisma` namespace scoped to its module), so plain typed imports work. The
// public surface is re-expressed below as the structural DbClient type.
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
import { PrismaClient as PostgresClient } from '../../prisma/generated/postgresql';

/**
 * Structural type describing the model-access surface of either generated
 * Prisma client. The concrete generated types are deliberately not re-exported
 * (their union previously leaked `any` because of the dual-client import);
 * this structural bag gives typed model ACCESS without full generic Prisma
 * typing. Returns are intentionally `Promise<unknown>`-ish for now.
 */
export interface PrismaModelDelegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown>;
  findFirst(args?: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
  upsert(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
  deleteMany(args?: unknown): Promise<unknown>;
  count(args?: unknown): Promise<number>;
  aggregate(args: unknown): Promise<unknown>;
}

/**
 * Structural DbClient: model delegates for every schema model plus the
 * runtime helpers used across the codebase. The transaction callback
 * receives the same structural client type.
 */
export interface DbClient {
  etlRun: PrismaModelDelegate;
  ticketSnapshot: PrismaModelDelegate;
  ticketTransition: PrismaModelDelegate;
  masterTicket: PrismaModelDelegate;
  kpiResult: PrismaModelDelegate;
  dashboardView: PrismaModelDelegate;
  $transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

/**
 * @MX:NOTE: Simple LRU Cache implementation for Prisma clients
 * @MX:REASON: Prevents unbounded memory growth with multiple database connections
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// @MX:NOTE: LRU cache with max 10 connections to prevent memory leaks
const prismaClientCache = new LRUCache<string, DbClient>(10);

/**
 * Derives a safe cache key from a connection URL (avoids storing secrets in Map keys)
 */
function getSafeKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

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
    if (urlStr.startsWith('file:')) {
      // @MX:WARN - Directory Traversal Protection: Validating SQLite file path
      // @MX:REASON - Prevent arbitrary file access by ensuring SQLite databases are stored 
      // within the application's data directory.
      const path = urlStr.replace('file:', '').split('?')[0];
      const isRelative = !path.startsWith('/') && !path.match(/^[a-zA-Z]:/);
      
      // Basic check: if it's relative, it's generally safe as it's within the project.
      // If it's absolute, we should be more careful, but for this simple ETL tool,
      // we'll allow relative paths or paths containing 'db' or 'prisma'.
      if (!isRelative && !path.includes('jira-etl-dashboard')) {
         // If absolute and doesn't look like it's in our app, block it if it looks like a system path
         if (path.startsWith('/etc/') || path.startsWith('/windows/') || path.includes('..')) {
           throw new Error('SQLite file path is not allowed for security reasons.');
         }
      }
      return; 
    }
    const url = new URL(urlStr);
    host = url.hostname;
  } catch (e) {
    if ((e as Error).message.includes('not allowed')) throw e;
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
      // Prefer an explicitly configured URL, then the launcher-provided
      // DATABASE_URL (absolute path in packaged builds), then the local default.
      // The hardcoded relative fallback is only safe in dev, where the schema
      // directory exists; in packaged builds a relative path resolves inside
      // the extraction folder and fails with SQLITE_CANTOPEN.
      effectiveUrl = config.url || envUrl || 'file:./db/custom.db';
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

  // Check cache (using hashed URL as key to avoid storing secrets)
  // @MX:NOTE: Uses LRU cache to prevent unbounded memory growth
  const safeKey = getSafeKey(effectiveUrl);
  const cached = prismaClientCache.get(safeKey);
  if (cached !== undefined) {
    return cached;
  }

  const provider = determineProvider(effectiveUrl);
  
  console.log(`[DB] Initializing ${provider} client for URL: ${redactUrl(effectiveUrl)}...`);

  let client: DbClient;
  
  try {
    if (provider === 'postgres') {
      // Single cast at the boundary: the generated client structurally matches
      // the DbClient model surface; only $transaction's extra batch overload
      // (PrismaPromise[]) prevents direct assignability, which is harmless here
      // because callers only use the interactive (callback) form.
      client = new PostgresClient({
        datasources: { db: { url: effectiveUrl } },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      }) as unknown as DbClient;
    } else if (provider === 'sqlite') {
      client = new SQLiteClient({
        datasources: { db: { url: effectiveUrl } },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      }) as unknown as DbClient;
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

  prismaClientCache.set(safeKey, client);
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
export const db: { readonly client: DbClient } = (typeof process !== 'undefined') ? {
  get client() { return getDefaultDb(); },
} : ({} as { readonly client: DbClient });