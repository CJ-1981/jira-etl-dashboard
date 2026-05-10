/**
 * KPI Plugin Validator
 * Runtime validation for KPI plugins ensuring type safety and contract compliance
 * @MX:ANCHOR: Plugin validation infrastructure
 * @MX:REASON: Type guards and runtime checks prevent invalid plugins from loading
 */

import { KpiPlugin, KpiCategory, KpiDomain } from './types';
import { PluginRegistry } from './plugin-registry';

/**
 * Validator for KPI plugin instances and plugin files
 * Provides type guards and comprehensive validation logic
 */
export class PluginValidator {
  /**
   * Type guard to check if a value is a valid KpiPlugin
   * @param plugin - Unknown value to validate
   * @returns true if value is a valid KpiPlugin
   */
  validate(plugin: unknown): plugin is KpiPlugin {
    return (
      this.isObject(plugin) &&
      this.isValidString(plugin.id) &&
      this.isValidString(plugin.name) &&
      this.isValidCategory(plugin.category) &&
      this.isValidDomain(plugin.domain) &&
      this.isValidString(plugin.version) &&
      typeof plugin.calculate === 'function' &&
      (plugin.dependencies === undefined ||
        this.isValidStringArray(plugin.dependencies)) &&
      (plugin.metadata === undefined || this.isObject(plugin.metadata))
    );
  }

  /**
   * Validate plugin ID format
   * @param id - Plugin ID to validate
   * @returns true if ID is valid
   */
  validateId(id: string): boolean {
    // IDs should be kebab-case, at least 2 characters, max 64 characters
    const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    return (
      typeof id === 'string' &&
      id.length >= 2 &&
      id.length <= 64 &&
      kebabCaseRegex.test(id)
    );
  }

  /**
   * Validate that all plugin dependencies exist in the registry
   * @param plugin - Plugin with dependencies to validate
   * @param registry - Registry containing registered plugins
   * @returns Validation result with missing dependencies if any
   */
  validateDependencies(
    plugin: KpiPlugin,
    registry: PluginRegistry
  ): { valid: boolean; missing: string[] } {
    if (!plugin.dependencies || plugin.dependencies.length === 0) {
      return { valid: true, missing: [] };
    }

    const missing: string[] = [];
    for (const dep of plugin.dependencies) {
      if (!registry.has(dep)) {
        missing.push(dep);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Validate a complete plugin file content
   * Used when loading plugins from file system
   * @param content - Unknown content from plugin file
   * @returns Validation result with detailed error messages
   */
  validatePluginFile(content: unknown): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!this.isObject(content)) {
      errors.push('Plugin file must export an object');
      return { valid: false, errors };
    }

    // Check for default export or named export
    const plugin = 'default' in content ? content.default : content;

    if (!this.validate(plugin)) {
      errors.push(...this.getValidationErrors(plugin));
      return { valid: false, errors };
    }

    // Additional checks for plugin ID
    if ('id' in plugin && typeof plugin.id === 'string') {
      if (!this.validateId(plugin.id)) {
        errors.push(
          `Invalid plugin ID '${plugin.id}'. ` +
            'IDs must be kebab-case, 2-64 characters.'
        );
      }
    }

    // Check version format
    if ('version' in plugin && typeof plugin.version === 'string') {
      if (!this.isValidVersion(plugin.version)) {
        errors.push(
          `Invalid version '${plugin.version}'. ` +
            'Use semantic versioning (e.g., 1.0.0).'
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get detailed validation errors for a plugin
   * @param plugin - Plugin to validate
   * @returns Array of error message strings
   */
  private getValidationErrors(plugin: unknown): string[] {
    const errors: string[] = [];

    if (!this.isObject(plugin)) {
      return ['Plugin must be an object'];
    }

    if (!('id' in plugin) || !this.isValidString(plugin.id)) {
      errors.push('Plugin must have a valid string id');
    }

    if (!('name' in plugin) || !this.isValidString(plugin.name)) {
      errors.push('Plugin must have a valid string name');
    }

    if (!('category' in plugin) || !this.isValidCategory(plugin.category)) {
      errors.push(
        'Plugin must have a valid category (builtin, custom, or time-series)'
      );
    }

    if (!('domain' in plugin) || !this.isValidDomain(plugin.domain)) {
      errors.push(
        'Plugin must have a valid domain (processing-time, turnaround, throughput, sla, quality, assignee, or custom)'
      );
    }

    if (!('version' in plugin) || !this.isValidString(plugin.version)) {
      errors.push('Plugin must have a valid string version');
    }

    if (!('calculate' in plugin) || typeof plugin.calculate !== 'function') {
      errors.push('Plugin must have a calculate function');
    }

    if (
      'dependencies' in plugin &&
      !this.isValidStringArray(plugin.dependencies)
    ) {
      errors.push('Plugin dependencies must be an array of strings');
    }

    if ('metadata' in plugin && !this.isObject(plugin.metadata)) {
      errors.push('Plugin metadata must be an object');
    }

    return errors;
  }

  /**
   * Type guard to check if value is a non-null object
   */
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /**
   * Type guard to check if value is a non-empty string
   */
  private isValidString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Type guard to check if value is a valid KpiCategory
   */
  private isValidCategory(value: unknown): value is KpiCategory {
    return (
      typeof value === 'string' &&
      ['builtin', 'custom', 'time-series'].includes(value)
    );
  }

  /**
   * Type guard to check if value is a valid KpiDomain
   */
  private isValidDomain(value: unknown): value is KpiDomain {
    return (
      typeof value === 'string' &&
      [
        'processing-time',
        'turnaround',
        'throughput',
        'sla',
        'quality',
        'assignee',
        'custom',
      ].includes(value)
    );
  }

  /**
   * Type guard to check if value is an array of non-empty strings
   */
  private isValidStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string' && item.trim().length > 0)
    );
  }

  /**
   * Validate semantic version format
   * Accepts: 1.0.0, 1.0.0-beta, 1.0.0-beta.1
   */
  private isValidVersion(version: string): boolean {
    const semverRegex =
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    return semverRegex.test(version);
  }
}
