import { PrismaClient } from '@prisma/client'

// Use a global cache to avoid excessive client instantiation in serverless env
const prismaClientCache = new Map<string, PrismaClient>();

export function getDb(dynamicUrl?: string): PrismaClient {
  const effectiveUrl = dynamicUrl || process.env.DATABASE_URL;
  
  if (!effectiveUrl) {
    // If we're in a browser context (this shouldn't happen for getDb but being safe)
    if (typeof window !== 'undefined') return null as any;
    throw new Error('Database URL is not configured. Please provide it in the UI or set DATABASE_URL environment variable.');
  }

  // Check cache (using URL as key)
  if (prismaClientCache.has(effectiveUrl)) {
    return prismaClientCache.get(effectiveUrl)!;
  }

  // Instantiate new client with dynamic datasource
  const client = new PrismaClient({
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
  const auth = password ? `${username}:${password}` : encodeURIComponent(password || '') ? `${username}:${encodeURIComponent(password || '')}` : username;
  
  // Re-evaluating the auth string construction for safety
  const authPart = password ? `${username}:${password}` : username;
  return `postgresql://${authPart}@${host}:${port}/${database}?sslmode=${sslMode}`;
}

// Default export for backward compatibility
export const db = (typeof process !== 'undefined' && process.env.DATABASE_URL) ? getDb() : ({} as PrismaClient);