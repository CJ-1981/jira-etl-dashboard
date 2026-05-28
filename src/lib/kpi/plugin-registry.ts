/**
 * KPI Plugin Registry
 * Central repository for managing registered KPI plugins
 * @MX:ANCHOR: Plugin registration and retrieval
 * @MX:REASON: Provides O(1) plugin lookup and filtering capabilities
 */

import { KpiPlugin, KpiCategory, KpiDomain } from './types';

/**
 * Registry for managing KPI plugins with fast lookup and filtering
 * @MX:ANCHOR: PluginRegistry core class
 * @MX:REASON: High-performance plugin management with Map-based storage
 */
export class PluginRegistry {
  private plugins: Map<string, KpiPlugin>;

  constructor() {
    this.plugins = new Map();
  }

  /**
   * Register a plugin in the registry
   * @param plugin - Plugin instance to register
   * @throws Error if plugin ID already exists
   */
  register(plugin: KpiPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(
        `Plugin with id '${plugin.id}' is already registered. ` +
          `Each plugin must have a unique identifier.`
      );
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Retrieve a plugin by ID
   * @param id - Plugin identifier
   * @returns Plugin or undefined if not found
   */
  get(id: string): KpiPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * List all plugins, optionally filtered by category
   * @param category - Optional category filter
   * @returns Array of plugins matching the filter
   */
  list(category?: KpiCategory): KpiPlugin[] {
    if (!category) {
      return Array.from(this.plugins.values());
    }
    return Array.from(this.plugins.values()).filter(
      (plugin) => plugin.category === category
    );
  }

  /**
   * List plugins by domain, optionally filtering by specific domain
   * @param domain - Optional domain filter
   * @returns Array of plugins in the specified domain
   */
  listByDomain(domain?: KpiDomain): KpiPlugin[] {
    if (!domain) {
      return Array.from(this.plugins.values());
    }
    return Array.from(this.plugins.values()).filter(
      (plugin) => plugin.domain === domain
    );
  }

  /**
   * Check if a plugin ID is registered
   * @param id - Plugin identifier to check
   * @returns true if plugin exists in registry
   */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /**
   * Remove all plugins from the registry
   * Useful for testing or reinitialization
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Get the total number of registered plugins
   * @returns Count of registered plugins
   */
  size(): number {
    return this.plugins.size;
  }

  /**
   * Get all plugin IDs in the registry
   * @returns Array of plugin identifiers
   */
  getIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugins by multiple IDs in a single call
   * @param ids - Array of plugin identifiers
   * @returns Map of ID to plugin (only includes found plugins)
   */
  getMultiple(ids: string[]): Map<string, KpiPlugin> {
    const result = new Map<string, KpiPlugin>();
    for (const id of ids) {
      const plugin = this.plugins.get(id);
      if (plugin) {
        result.set(id, plugin);
      }
    }
    return result;
  }

  /**
   * Unregister a plugin by ID
   * @param id - Plugin identifier to remove
   * @returns true if plugin was removed, false if not found
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }
}
