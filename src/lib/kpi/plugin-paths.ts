import path from 'path';

/**
 * Resolves the directory where user-defined custom KPI plugins live.
 *
 * This is the single source of truth shared by:
 * - the plugin loader, which reads and registers plugins at startup,
 * - the file watcher, which detects add/change/unlink events, and
 * - the custom-plugin API, which writes uploaded plugin files.
 *
 * @MX:ANCHOR: Custom plugin directory resolution
 * @MX:REASON: Previously the loader read from `data/custom-plugins` while the
 * API and watcher used `src/lib/kpi/plugins/custom`, so uploaded plugins were
 * written to one place but loaded from another and never activated. Routing all
 * three through this helper keeps them permanently aligned.
 *
 * Override with the CUSTOM_PLUGIN_DIR environment variable. The default lives
 * under the writable `data/` directory so it also works in packaged builds
 * where the `src/` tree is not present.
 */
export function getCustomPluginDir(): string {
  return process.env.CUSTOM_PLUGIN_DIR || path.join(process.cwd(), 'data', 'custom-plugins');
}
