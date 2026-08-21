/**
 * Health Check & Debug API
 * Useful for monitoring application health and debugging issues
 */
import { NextResponse } from 'next/server';
import { getDefaultDb } from '@/lib/db';
import { logger } from '@/lib/logger';

// @MX:ANCHOR: Health check response contract - defines the interface for monitoring system integration
interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    rss: number;
  };
  environment: string;
  responseTime: number;
  database?: {
    status: 'connected' | 'disconnected';
    error?: string;
  };
  logs?: Array<{
    timestamp: string;
    level: string;
    message: string;
    context?: string;
  }>;
  errorCount?: number;
  error?: string;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';

  try {
    // Basic health checks
    const health: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        rss: process.memoryUsage().rss / 1024 / 1024
      },
      environment: process.env.NODE_ENV,
      responseTime: 0
    };

    // Database connectivity check
    if (detailed) {
      try {
        // @MX:NOTE: Use getDefaultDb() to reach the real Prisma client for $queryRaw.
        // @MX:REASON: The `db` proxy only exposes `.client`; `$queryRaw` on it is undefined.
        await (getDefaultDb() as any).$queryRaw`SELECT 1`;
        health.database = { status: 'connected' };
      } catch (error) {
        health.database = {
          status: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Recent logs
      health.logs = logger.getLogs('error', 10);

      // Recent error count
      const errorLogs = logger.getLogs('error', 100);
      health.errorCount = errorLogs.length;
    }

    health.responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      health
    });

  } catch (error) {
    logger.error('Health check failed', 'health-check', error as Error);
    const responseTime = Date.now() - startTime;

    const unhealthyResponse: HealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        rss: process.memoryUsage().rss / 1024 / 1024,
      },
      environment: process.env.NODE_ENV || 'unknown',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(unhealthyResponse, { status: 503 });
  }
}