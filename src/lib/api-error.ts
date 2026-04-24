/**
 * Custom API Error Classes
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, message);
    this.name = 'RateLimitError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(500, message, details);
    this.name = 'InternalServerError';
  }
}

/**
 * Error type guard
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Format error for API response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
  stack?: string;
}

export function formatErrorResponse(error: unknown, includeStack = false): ErrorResponse {
  if (isApiError(error)) {
    return {
      success: false,
      error: error.message,
      details: error.details,
      ...(includeStack && { stack: error.stack }),
    };
  }

  if (isError(error)) {
    return {
      success: false,
      error: error.message,
      ...(includeStack && { stack: error.stack }),
    };
  }

  return {
    success: false,
    error: 'An unexpected error occurred',
    details: error,
  };
}

/**
 * Handle API errors and return NextResponse
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function handleApiError(error: unknown, includeStack = false): NextResponse {
  console.error('[API Error]:', error);

  // Handle Zod validation errors - check multiple ways
  let zodErrors: any[] = [];

  if (error instanceof ZodError && error.errors) {
    zodErrors = error.errors;
  } else if (isError(error) && error.name === 'ZodError') {
    try {
      const parsed = JSON.parse(error.message);
      if (Array.isArray(parsed)) {
        zodErrors = parsed;
      }
    } catch {
      // Try to access error.issues if it exists (alternative ZodError format)
      if ('issues' in error && Array.isArray((error as any).issues)) {
        zodErrors = (error as any).issues;
      }
    }
  }

  // If we found Zod errors, format them
  if (zodErrors.length > 0) {
    const details = zodErrors.map((err) => ({
      path: Array.isArray(err.path) ? err.path.join('.') : err.path || 'unknown',
      message: err.message || 'Validation error',
      code: err.code || 'invalid',
    }));

    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        details,
      },
      { status: 400 }
    );
  }

  // Handle custom API errors
  if (isApiError(error)) {
    return NextResponse.json(
      formatErrorResponse(error, includeStack),
      { status: error.statusCode }
    );
  }

  // Handle generic errors
  const statusCode = isError(error) && error.message.includes('not found') ? 404 : 500;
  return NextResponse.json(
    formatErrorResponse(error, includeStack),
    { status }
  );
}

/**
 * Async handler wrapper to catch errors
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>,
  includeStack = false
): Promise<T | NextResponse> {
  return handler().catch((error) => handleApiError(error, includeStack));
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  limit = 100,
  windowMs = 60000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    const resetTime = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: limit - 1, resetTime };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count, resetTime: record.resetTime };
}

/**
 * Get client identifier for rate limiting
 */
export function getClientIdentifier(request: Request): string {
  // Try to get IP from various headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip = forwardedFor?.split(',')[0] || realIp || cfConnectingIp || 'unknown';

  // Add user agent if available for more specific limiting
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return `${ip}-${userAgent}`;
}

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit(limit = 100, windowMs = 60000) {
  return function <T>(handler: (request: Request) => Promise<T>): (request: Request) => Promise<T | NextResponse> {
    return async function (request: Request) {
      const identifier = getClientIdentifier(request);
      const rateLimit = checkRateLimit(identifier, limit, windowMs);

      if (!rateLimit.allowed) {
        throw new RateLimitError(
          `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds`
        );
      }

      return handler(request);
    };
  };
}