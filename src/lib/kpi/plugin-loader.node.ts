/**
 * Node-only custom KPI plugin loader (filesystem scan + dynamic ESM import).
 *
 * @MX:NOTE: Split out of plugin-loader.ts so the shared loader stays
 * browser-safe for static/relay builds (where KPI math runs client-side).
 * Only import this module from server code — the KpiEngine reaches it via a
 * dynamic import guarded by a `typeof window` check.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { KpiPlugin } from './types';
import { getCustomPluginDir } from './plugin-paths';

/**
 * Check if a file is a plugin file based on extension
 * @param filename - Name of the file to check
 * @returns True if the file appears to be a plugin file
 */
function isPluginFile(filename: string): boolean {
  // Accept .ts, .js, .tsx, .jsx files
  // Exclude test files and type definition files
  return /\.(ts|js|tsx|jsx)$/.test(filename) &&
         !/\.test\./.test(filename) &&
         !/\.spec\./.test(filename) &&
         !/\.d\.ts$/.test(filename) &&
         filename !== 'index.ts' &&
         filename !== 'index.js';
}

/**
 * Validate that an object implements the KpiPlugin interface
 * @param plugin - Object to validate
 * @returns True if the object is a valid KpiPlugin
 */
function isValidPlugin(plugin: unknown): plugin is KpiPlugin {
  if (typeof plugin !== 'object' || plugin === null) {
    return false;
  }

  const p = plugin as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.calculate === 'function' &&
    typeof p.unit === 'string'
  );
}

/**
 * Normalize domain name from folder name to KpiDomain format
 * @param folderName - Folder name to normalize
 * @returns Normalized domain name
 */
function normalizeDomainName(folderName: string): string {
  // Convert folder names like "processing time" to "processing-time"
  return folderName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Load custom plugins from user-defined directory
 * @returns Array of custom plugins
 * @MX:ANCHOR: Custom plugin loader
 * @MX:REASON: Enables users to add custom plugins without code changes
 */
export async function loadCustomPluginsFromDisk(): Promise<KpiPlugin[]> {
  const customPlugins: KpiPlugin[] = [];

  // Centralized writable path (shared with the watcher and custom-plugin API)
  const customDir = getCustomPluginDir();

  // Check if custom directory exists and is writable
  try {
    if (!fs.existsSync(customDir)) {
      console.log(`[PluginLoader] Custom plugins directory not found at ${customDir}, creating it...`);
      fs.mkdirSync(customDir, { recursive: true });
    }
    fs.accessSync(customDir, fs.constants.W_OK);
  } catch (error) {
    console.error(`[PluginLoader] Custom plugins directory "${customDir}" is not writable or cannot be created:`, error);
    return customPlugins;
  }

  // Recursively scan for plugin files
  const scanDirectory = async (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories (domain folders)
        await scanDirectory(fullPath);
      } else if (entry.isFile() && isPluginFile(entry.name)) {
        // Try to load the plugin file using dynamic import
        try {
          const fileUrl = pathToFileURL(fullPath).href;
          const pluginModule = await import(/* webpackIgnore: true */ fileUrl);
          const plugin = pluginModule.default || pluginModule;

          // Validate plugin structure
          if (isValidPlugin(plugin)) {
            // Ensure category and domain are set correctly for custom plugins
            plugin.category = 'custom';
            if (!plugin.domain) {
              // Infer domain from directory structure
              const relativePath = path.relative(customDir, fullPath);
              const domainFolder = relativePath.split(path.sep)[0];
              plugin.domain = normalizeDomainName(domainFolder) as any;
            }
            customPlugins.push(plugin);
            console.log(`[PluginLoader] Loaded custom plugin: ${plugin.id}`);
          } else {
            console.warn(`[PluginLoader] Invalid plugin structure in ${fullPath}`);
          }
        } catch (error) {
          console.error(`[PluginLoader] Failed to load plugin from ${fullPath}:`, error);
        }
      }
    }
  };

  await scanDirectory(customDir);
  return customPlugins;
}
