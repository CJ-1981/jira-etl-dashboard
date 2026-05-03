import { PrismaClient as PrismaClientDefault } from '@prisma/client'
// Import the specialized clients
// @ts-ignore
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
// Use a global cache to avoid excessive client instantiation in serverless env
const prismaClientCache = new Map<string, any>();

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

export function getDb(dynamicUrl?: string): any {
  // SSRF Protection: We resolve the actual connection URL server-side.
  // The 'dynamicUrl' parameter is now treated as a hint/lookup key if needed,
  // but we primarily rely on environment variables for security.
  const envUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;

  // If the requested dynamicUrl is different from envUrl, we validate it or fallback.
  // For this local tool, we allow the dynamicUrl if it starts with 'file:' (local SQLite)
  // or matches the env variable.
  const effectiveUrl = (dynamicUrl?.startsWith('file:') || dynamicUrl === envUrl) 
    ? dynamicUrl 
    : envUrl || 'file:./db/custom.db';

  if (!effectiveUrl) {
    if (typeof window !== 'undefined') return null as any;
    throw new Error('Database URL is not configured.');
  }

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
export const db = (typeof process !== 'undefined') ? getDb(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL) : ({} as any);