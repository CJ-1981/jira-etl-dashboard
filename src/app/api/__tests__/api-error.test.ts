/**
 * Unit tests for the shared API error helpers (`src/lib/api-error.ts`).
 *
 * These lock down the status-resolution contract that every route handler now
 * delegates to via `handleApiError`:
 *  - Zod validation errors           -> 400 with structured `details`
 *  - Typed ApiError subclasses       -> their explicit statusCode
 *  - Errors carrying a numeric `.status`/`.statusCode` (upstream HTTP errors)
 *                                      -> that status is forwarded (not flattened)
 *  - Anything else                   -> 500
 *
 * Critically, the helper must NOT infer 404 from a "not found" message
 * substring (the previous fragile heuristic); routes that mean "not found"
 * throw `NotFoundError` explicitly.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { z, ZodError } from 'zod';
import {
  handleApiError,
  getApiErrorStatus,
  formatErrorResponse,
  isApiError,
  ApiError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
} from '@/lib/api-error';

// Silence the helper's console.error so test output stays readable.
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

async function body(res: Response): Promise<any> {
  return res.json();
}

describe('getApiErrorStatus', () => {
  it('returns the statusCode of a typed ApiError', () => {
    expect(getApiErrorStatus(new NotFoundError('View'))).toBe(404);
    expect(getApiErrorStatus(new RateLimitError())).toBe(429);
  });

  it('returns a numeric .status carried by a plain error', () => {
    const err = Object.assign(new Error('upstream'), { status: 429 });
    expect(getApiErrorStatus(err)).toBe(429);
  });

  it('returns a numeric .statusCode carried by a plain error', () => {
    const err = Object.assign(new Error('upstream'), { statusCode: 503 });
    expect(getApiErrorStatus(err)).toBe(503);
  });

  it('ignores non-numeric or out-of-range status values', () => {
    expect(getApiErrorStatus(Object.assign(new Error('x'), { status: '404' }))).toBeUndefined();
    expect(getApiErrorStatus(Object.assign(new Error('x'), { status: 42 }))).toBeUndefined();
    expect(getApiErrorStatus(Object.assign(new Error('x'), { status: 999 }))).toBeUndefined();
  });

  it('returns undefined for errors without an explicit status', () => {
    expect(getApiErrorStatus(new Error('boom'))).toBeUndefined();
    expect(getApiErrorStatus('string error')).toBeUndefined();
    expect(getApiErrorStatus(null)).toBeUndefined();
  });
});

describe('handleApiError — status resolution', () => {
  it('maps ZodError to 400 with structured details', async () => {
    let zodError: ZodError | undefined;
    try {
      z.object({ connectionRef: z.string() }).parse({ connectionRef: 123 });
    } catch (e) {
      zodError = e as ZodError;
    }
    const res = handleApiError(zodError);
    expect(res.status).toBe(400);
    const json = await body(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Validation failed');
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.details[0].path).toBe('connectionRef');
  });

  it('uses the statusCode of typed ApiError subclasses', async () => {
    const cases: Array<[ApiError, number]> = [
      [new ValidationError('bad input'), 400],
      [new AuthenticationError(), 401],
      [new NotFoundError('View'), 404],
      [new ConflictError('already exists'), 409],
      [new RateLimitError(), 429],
      [new InternalServerError(), 500],
    ];
    for (const [err, status] of cases) {
      const res = handleApiError(err);
      expect(res.status).toBe(status);
      const json = await body(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe(err.message);
    }
  });

  it('forwards an upstream numeric .status instead of flattening to 500', async () => {
    const err = Object.assign(new Error('Jira rate limit exceeded (HTTP 429).'), { status: 429 });
    const res = handleApiError(err);
    expect(res.status).toBe(429);
    const json = await body(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/rate limit/i);
  });

  it('defaults to 500 for generic errors', async () => {
    const res = handleApiError(new Error('something exploded'));
    expect(res.status).toBe(500);
    const json = await body(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('something exploded');
  });

  it('does NOT infer 404 from a "not found" message substring', async () => {
    // The old heuristic would have turned this into a 404. It must now be a 500
    // unless the caller throws an explicit NotFoundError.
    const res = handleApiError(new Error('Connection not found in the pool'));
    expect(res.status).toBe(500);
  });

  it('normalizes non-Error thrown values into the error envelope', async () => {
    const res = handleApiError({ weird: true });
    expect(res.status).toBe(500);
    const json = await body(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('An unexpected error occurred');
  });
});

describe('formatErrorResponse / isApiError', () => {
  it('includes details for ApiError instances', () => {
    const err = new ValidationError('bad', { field: 'x' });
    const formatted = formatErrorResponse(err);
    expect(formatted.success).toBe(false);
    expect(formatted.error).toBe('bad');
    expect(formatted.details).toEqual({ field: 'x' });
  });

  it('only includes stack when requested', () => {
    const err = new Error('boom');
    expect(formatErrorResponse(err).stack).toBeUndefined();
    expect(formatErrorResponse(err, true).stack).toBeDefined();
  });

  it('identifies ApiError instances via the guard', () => {
    expect(isApiError(new NotFoundError('x'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
