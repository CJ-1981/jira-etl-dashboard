/**
 * Runtime build mode — the single source of truth for dual-mode behavior.
 *
 * @MX:NOTE: Mode is decided at BUILD time, not runtime. The static GitHub
 * Pages build (`npm run build:static`) bakes NEXT_PUBLIC_BUILD_MODE=static
 * into the client bundle, which selects 'relay' mode (local Python relay +
 * client-side KPI calculation). The regular server/exe build leaves the
 * variable unset and every consumer behaves exactly as before.
 *
 * Never probe the network to detect the mode — a missing relay is a valid
 * runtime state (relay not started yet), not a different build.
 */

export type AppMode = 'server' | 'relay';

const MODE: AppMode =
  process.env.NEXT_PUBLIC_BUILD_MODE === 'static' ? 'relay' : 'server';

export function getAppMode(): AppMode {
  return MODE;
}

export function isRelayMode(): boolean {
  return MODE === 'relay';
}

/**
 * Capability flags derived from the build mode. UI panels use these to hide
 * server-backed features in relay mode instead of removing them from the
 * codebase — server-mode behavior stays untouched.
 */
export const runtimeFeatures = {
  /** Next.js API routes are reachable (npm dev / standalone / exe builds). */
  hasServerApis: MODE === 'server',
  /** Filesystem custom-plugin CRUD + file-watcher events (server-only). */
  hasFilePlugins: MODE === 'server',
  /** Storage panel: SQLite/PostgreSQL storage selection, cleanup, db location. */
  hasStoragePanel: MODE === 'server',
  /** PG/Metabase export from the Export panel. */
  hasPgExport: MODE === 'server',
  /** Server-side polling scheduler + webhook configuration. */
  hasPolling: MODE === 'server',
  /** Custom-field discovery via the server-side Jira fields/suggest proxy. */
  hasFieldDiscovery: MODE === 'server',
} as const;
