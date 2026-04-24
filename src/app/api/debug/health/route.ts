/**
 * Health Check & Debug API
 * Useful for monitoring application health and debugging issues
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const startTime = Date.now();
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';

  try {
    // Basic health checks
    const health = {
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
        await db.$queryRaw`SELECT 1`;
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

    return NextResponse.json({
      success: false,
      health: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 503 });
  }
}