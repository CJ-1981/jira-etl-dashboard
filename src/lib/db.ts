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

// Default export for backward compatibility with existing code
// Use a lazy getter or try/catch for environments where DATABASE_URL is missing
export const db = (typeof process !== 'undefined' && process.env.DATABASE_URL) ? getDb() : null as any;