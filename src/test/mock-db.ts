import { vi } from 'vitest';

/**
 * Deep Prisma mock for unit-testing API route handlers without a database.
 *
 * Any `db.<model>.<method>(...)` resolves to a sensible default (arrays for
 * findMany, numbers for count, {count} for deleteMany, etc.) so a handler can
 * run end-to-end out of the box. Tests override a specific call with the
 * memoized vi.fn:
 *
 *   const db = createMockDb();
 *   vi.mocked(db.etlRun.findMany).mockResolvedValue([{ id: 'r1' }]);
 *
 * Top-level `$queryRaw` / `$transaction` are also available as memoized fns.
 */
export function createMockDb() {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();

  const getFn = (key: string, impl: (...args: any[]) => unknown) => {
    let fn = fns.get(key);
    if (!fn) {
      fn = vi.fn(impl);
      fns.set(key, fn);
    }
    return fn;
  };

  const defaultFor = (method: string): (() => unknown) => {
    switch (method) {
      case 'count':
        return () => Promise.resolve(0);
      case 'aggregate':
        return () => Promise.resolve({ _sum: {}, _min: {}, _max: {} });
      // *Many variants return a batch result object.
      case 'deleteMany':
      case 'updateMany':
        return () => Promise.resolve({ count: 0 });
      // Single-record methods return the record — or null when nothing matched.
      case 'delete':
      case 'update':
      case 'upsert':
      case 'findFirst':
      case 'findUnique':
        return () => Promise.resolve(null);
      case 'create':
        return () => Promise.resolve({});
      default: // findMany
        return () => Promise.resolve([]);
    }
  };

  // A "model" object: every property is a memoized vi.fn with a smart default.
  const modelProxy = (model: string) =>
    new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get: (_t, method: string) => {
        if (method === '$queryRaw' || method === '$transaction') return undefined;
        return getFn(`${model}.${String(method)}`, defaultFor(String(method)));
      },
    });

  const db = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) => {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      if (prop === '$queryRaw' || prop === '$executeRaw' || prop === '$executeRawUnsafe') {
        return getFn(prop, () => Promise.resolve([{ '?column?': 1 }]));
      }
      if (prop === '$transaction') {
        // Interactive transactions: run the callback against this same proxy.
        const runTransaction = (cb: (tx: any) => Promise<any>): Promise<any> =>
          typeof cb === 'function' ? Promise.resolve(cb(db)) : Promise.resolve(undefined);
        return getFn('$transaction', runTransaction);
      }
      return modelProxy(prop);
    },
  });

  return db;
}

/**
 * Build a Next.js Request for a route-handler test.
 * The handler signature uses `Request` (Web standard), available globally in Node 18+.
 */
export function makeRequest(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Request {
  const { method = 'GET', body } = init;
  return new Request(`http://localhost${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Convenience: await a handler's Response and parse JSON. */
export async function readJson(res: Response): Promise<any> {
  return res.json();
}
