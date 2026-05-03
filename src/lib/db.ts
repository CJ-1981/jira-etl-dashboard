import { PrismaClient as PrismaClientDefault } from '@prisma/client'
// Import the specialized clients
// @ts-ignore
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
// @ts-ignore
import { PrismaClient as PostgresClient } from '../../prisma/generated/postgresql';

// Use a global cache to avoid excessive client instantiation in serverless env
const prismaClientCache = new Map<string, any>();
export function getDb(dynamicUrl?: string, dynamicDirectUrl?: string): any {
  // We ignore dynamicDirectUrl for now as Prisma constructor only supports one 'url' override
  // for dynamic datasource switching without using env vars.
  let effectiveUrl = dynamicUrl || process.env.DATABASE_URL;

  // Strict check: if it starts with file: or it's empty, it MUST be SQLite
  const isPostgres = !!effectiveUrl && (effectiveUrl.startsWith('postgresql://') || effectiveUrl.startsWith('postgres://'));

  // If no URL is provided, fallback to the default SQLite path if not already set to Postgres
  if (!effectiveUrl) {
    if (typeof window !== 'undefined') return null as any;
    effectiveUrl = 'file:./db/custom.db';
  }

  // Check cache (using URL as key)
  if (prismaClientCache.has(effectiveUrl)) {
    return prismaClientCache.get(effectiveUrl)!;
  }

  const ClientClass = isPostgres ? PostgresClient : SQLiteClient;

  console.log(`[DB] Initializing ${isPostgres ? 'PostgreSQL' : 'SQLite'} client...`);

  try {
    // Instantiate new client with dynamic datasource
    const client = new ClientClass({
      datasources: {
        db: {
          url: effectiveUrl,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    // Add error handling to clear cache on connection failure
    // This allows the user to fix credentials in the UI and try again
    const originalRequest = (client as any)._request;
    if (originalRequest) {
      (client as any)._request = async function(...args: any[]) {
        try {
          return await originalRequest.apply(this, args);
        } catch (error: any) {
          // If it's an authentication or connection error, clear this URL from cache
          // Common Prisma error codes for auth: P1017, P1000, P1001
          if (error.message?.includes('Authentication failed') || error.code?.startsWith('P1')) {
            console.warn(`[DB] Connection failed for ${effectiveUrl.split('@')[0]}. Clearing cache.`);
            prismaClientCache.delete(effectiveUrl);
          }
          throw error;
        }
      };
    }

    prismaClientCache.set(effectiveUrl, client);
    return client;
  } catch (error) {
    console.error(`[DB] Failed to initialize ${isPostgres ? 'PostgreSQL' : 'SQLite'} client:`, error);
    throw error;
  }
}/**
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
  const auth = password ? `${username}:${password}` : encodeURIComponent(password || '') ? `${username}:${encodeURIComponent(password || '')}` : username;
  
  // Re-evaluating the auth string construction for safety
  const authPart = password ? `${username}:${password}` : username;
  return `postgresql://${authPart}@${host}:${port}/${database}?sslmode=${sslMode}`;
}

// Default export for backward compatibility
export const db = (typeof process !== 'undefined' && (process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL)) ? getDb() : ({} as any);