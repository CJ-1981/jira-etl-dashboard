/**
 * Shared Security Utilities
 *
 * Centralized security boundary functions used across API routes.
 * @MX:ANCHOR: Security boundary utilities
 */

/**
 * @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
 * @MX:REASON: API endpoints are unauthenticated and may forward custom plugin
 * formulas into the KPI engine. Any website the user visits could POST a
 * `no-cors` text/plain request to the localhost server. Browsers attach an
 * `origin` (or `referer`) header to such cross-origin POSTs, so we reject
 * every request whose origin is not a loopback address. Requests without
 * these headers (server-side fetches, curl, packaged-app launcher) pass.
 */
export function isLoopbackOriginRequest(request: Request): boolean {
  const headerValue =
    request.headers.get('origin') || request.headers.get('referer');
  if (!headerValue) return true;

  let host: string;
  try {
    host = new URL(headerValue).hostname;
  } catch {
    // Unparseable origin/referer: fail closed.
    return false;
  }

  if (host === 'localhost' || host === '127.0.0.1') return true;
  // IPv6 loopback arrives URL-encoded as "[::1]" from URL.hostname.
  const normalized = host.replace(/^\[|\]$/g, '');
  return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
}
