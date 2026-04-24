/**
 * API Middleware Utilities
 * Provides reusable middleware functions for Next.js API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import {
  ApiError,
  ValidationError,
  AuthenticationError,
  RateLimitError
} from './api-error';

/**
 * Request metadata interface
 */
interface RequestMetadata {
  ip: string;
  userAgent: string;
  method: string;
  url: string;
  timestamp: string;
}

/**
 * Extract request metadata
 */
export function extractRequestMetadata(request: NextRequest): RequestMetadata {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0] ||
         request.headers.get('x-real-ip') ||
         'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    method: request.method,
    url: request.url,
    timestamp: new Date().toISOString()
  };
}

/**
 * Logging middleware
 */
export function withLogging(
  handler: (request: NextRequest) => Promise<NextResponse>,
  context?: string
) {
  return async function loggedRequest(request: NextRequest): Promise<NextResponse> {
    const metadata = extractRequestMetadata(request);
    const startTime = Date.now();

    logger.info(`${metadata.method} ${metadata.url}`, context, {
      ip: metadata.ip,
      userAgent: metadata.userAgent
    });

    try {
      const response = await handler(request);
      const duration = Date.now() - startTime;

      logger.info(`${metadata.method} ${metadata.url} completed`, context, {
        status: response.status,
        duration: `${duration}ms`
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${metadata.method} ${metadata.url} failed`, context, error as Error, {
        duration: `${duration}ms`
      });
      throw error;
    }
  };
}

/**
 * Error handling middleware
 */
export function withErrorHandling(
  handler: (request: NextRequest) => Promise<NextResponse>,
  context?: string
) {
  return async function handledRequest(request: NextRequest): Promise<NextResponse> {
    try {
      return await handler(request);
    } catch (error) {
      // Log the error
      logger.error('API Error', context, error as Error);

      // Handle different error types
      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            details: error.details,
            timestamp: new Date().toISOString()
          },
          { status: error.statusCode }
        );
      }

      // Handle unknown errors
      const isDevelopment = process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          success: false,
          error: isDevelopment ? (error as Error).message : 'Internal server error',
          ...(isDevelopment && { stack: (error as Error).stack }),
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  };
}

/**
 * CORS middleware
 */
export function withCors(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: {
    origins?: string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
  } = {}
) {
  const {
    origins = ['http://localhost:3000'],
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers = ['Content-Type', 'Authorization'],
    credentials = true
  } = options;

  return async function corsRequest(request: NextRequest): Promise<NextResponse> {
    const origin = request.headers.get('origin') || '';

    // Check if origin is allowed
    const isAllowed = origins.includes('*') || origins.includes(origin);

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          ...(isAllowed && { 'Access-Control-Allow-Origin': origin }),
          'Access-Control-Allow-Methods': methods.join(', '),
          'Access-Control-Allow-Headers': headers.join(', '),
          'Access-Control-Max-Age': '86400',
          ...(credentials && { 'Access-Control-Allow-Credentials': 'true' })
        }
      });
    }

    // Execute handler
    const response = await handler(request);

    // Add CORS headers to response
    if (isAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
    if (credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    return response;
  };
}

/**
 * Combine multiple middleware
 */
export function combineMiddleware(
  ...middlewares: ((handler: (req: NextRequest) => Promise<NextResponse>) => (req: NextRequest) => Promise<NextResponse>)[]
) {
  return function (
    handler: (request: NextRequest) => Promise<NextResponse>
  ): (request: NextRequest) => Promise<NextResponse> {
    return middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler
    );
  };
}

/**
 * Standard middleware stack
 */
export function withStandardMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>,
  context?: string,
  options?: {
    enableCors?: boolean;
    corsOrigins?: string[];
    enableRateLimit?: boolean;
    rateLimit?: number;
    rateLimitWindow?: number;
  }
) {
  const {
    enableCors = false,
    corsOrigins = ['http://localhost:3000'],
    enableRateLimit = true,
    rateLimit = 60,
    rateLimitWindow = 60000
  } = options || {};

  let wrappedHandler = handler;

  // Add logging
  wrappedHandler = withLogging(wrappedHandler, context);

  // Add error handling
  wrappedHandler = withErrorHandling(wrappedHandler, context);

  // Add CORS if enabled
  if (enableCors) {
    wrappedHandler = withCors(wrappedHandler, { origins: corsOrigins });
  }

  return wrappedHandler;
}

/**
 * Helper to create typed API route handlers
 */
export function createApiHandler(
  handlers: {
    GET?: (request: NextRequest) => Promise<NextResponse>;
    POST?: (request: NextRequest) => Promise<NextResponse>;
    PUT?: (request: NextRequest) => Promise<NextResponse>;
    PATCH?: (request: NextRequest) => Promise<NextResponse>;
    DELETE?: (request: NextRequest) => Promise<NextResponse>;
  },
  context?: string,
  options?: {
    enableCors?: boolean;
    corsOrigins?: string[];
  }
) {
  const wrappedHandlers: Record<string, (request: NextRequest) => Promise<NextResponse>> = {};

  for (const [method, handler] of Object.entries(handlers)) {
    if (handler) {
      wrappedHandlers[method] = withStandardMiddleware(handler, context, options);
    }
  }

  return wrappedHandlers;
}