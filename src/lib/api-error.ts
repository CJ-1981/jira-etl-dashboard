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
 * Type guard for a value that is a plausible HTTP status code (100–599).
 */
function isValidHttpStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
}

/**
 * Resolve an explicit HTTP status carried by an error, if any.
 *
 * Precedence:
 *  1. Typed {@link ApiError} subclasses -> their `statusCode`.
 *  2. Any error object carrying a valid numeric `.statusCode` or `.status`
 *     (e.g. upstream Jira HTTP errors) -> that status, so callers can forward
 *     upstream 401/429/5xx instead of flattening everything to 500.
 *
 * Returns `undefined` when no explicit status is present, in which case the
 * caller applies its default. This supersedes the previous fragile
 * `message.includes('not found') -> 404` heuristic; routes that mean "not
 * found" should throw {@link NotFoundError} explicitly.
 */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (isApiError(error)) return error.statusCode;
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as { statusCode?: unknown; status?: unknown };
  const candidate = record.statusCode ?? record.status;
  return isValidHttpStatus(candidate) ? candidate : undefined;
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

/**
 * Minimal structural shape of a Zod issue, so we can normalize details without
 * depending on a specific Zod version's exported types.
 */
interface ZodIssueLike {
  path?: Array<string | number>;
  message?: string;
  code?: string;
}

/**
 * Extract Zod issues from an error, if present.
 *
 * Handles both a genuine `ZodError` instance and the (rare) case where the
 * error is a ZodError that fails the `instanceof` check (e.g. duplicated zod
 * copies) by recovering the issues from the serialized message or a duck-typed
 * `.issues` array.
 */
function extractZodIssues(error: unknown): ZodIssueLike[] {
  if (error instanceof ZodError && Array.isArray(error.issues)) {
    return error.issues as unknown as ZodIssueLike[];
  }
  if (isError(error) && error.name === 'ZodError') {
    try {
      const parsed: unknown = JSON.parse(error.message);
      if (Array.isArray(parsed)) return parsed as ZodIssueLike[];
    } catch {
      const maybeIssues = (error as { issues?: unknown }).issues;
      if (Array.isArray(maybeIssues)) return maybeIssues as ZodIssueLike[];
    }
  }
  return [];
}

export function handleApiError(error: unknown, includeStack = false): NextResponse {
  console.error('[API Error]:', error);

  // Zod validation errors -> 400 with structured per-field details.
  const zodIssues = extractZodIssues(error);
  if (zodIssues.length > 0) {
    const details = zodIssues.map((issue) => ({
      path: Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : 'unknown',
      message: issue.message || 'Validation error',
      code: issue.code || 'invalid',
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

  // Status resolution: prefer an explicit status carried by the error (a typed
  // ApiError, or an upstream error exposing `.status`/`.statusCode`); default
  // to 500. We intentionally do NOT infer semantics from the message text.
  const statusCode = getApiErrorStatus(error) ?? 500;

  return NextResponse.json(formatErrorResponse(error, includeStack), { status: statusCode });
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