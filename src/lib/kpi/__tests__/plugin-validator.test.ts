/**
 * Plugin Validator Tests
 * Verify type guards and validation logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginValidator } from '../plugin-validator';
import { PluginRegistry } from '../plugin-registry';
import { KpiPlugin, KpiCategory, KpiDomain } from '../types';

describe('PluginValidator', () => {
  let validator: PluginValidator;
  let registry: PluginRegistry;

  beforeEach(() => {
    validator = new PluginValidator();
    registry = new PluginRegistry();
  });

  describe('validate()', () => {
    it('should validate correct plugin object', () => {
      const plugin: KpiPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
      };

      expect(validator.validate(plugin)).toBe(true);
    });

    it('should reject invalid plugin - missing id', () => {
      const plugin = {
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
      };

      expect(validator.validate(plugin)).toBe(false);
    });

    it('should reject invalid plugin - wrong category type', () => {
      const plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'invalid',
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
      };

      expect(validator.validate(plugin)).toBe(false);
    });

    it('should reject invalid plugin - calculate not a function', () => {
      const plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: 'not a function',
      };

      expect(validator.validate(plugin)).toBe(false);
    });

    it('should validate plugin with optional fields', () => {
      const plugin: KpiPlugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
        dependencies: ['plugin-a', 'plugin-b'],
        metadata: {
          description: 'Test description',
          author: 'Test Author',
          tags: ['tag1', 'tag2'],
        },
      };

      expect(validator.validate(plugin)).toBe(true);
    });

    it('should reject plugin with invalid dependencies', () => {
      const plugin = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin' as KpiCategory,
        domain: 'custom' as KpiDomain,
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
        dependencies: ['valid', 123], // Invalid: number in array
      };

      expect(validator.validate(plugin)).toBe(false);
    });
  });

  describe('validateId()', () => {
    it('should accept valid kebab-case IDs', () => {
      expect(validator.validateId('my-plugin')).toBe(true);
      expect(validator.validateId('my-awesome-plugin')).toBe(true);
      expect(validator.validateId('plugin123')).toBe(true);
      expect(validator.validateId('my-plugin-v2')).toBe(true);
    });

    it('should reject invalid IDs', () => {
      expect(validator.validateId('')).toBe(false); // Too short
      expect(validator.validateId('a')).toBe(false); // Too short
      expect(
        validator.validateId('a'.repeat(65)) // Too long
      ).toBe(false);
      expect(validator.validateId('MyPlugin')).toBe(false); // PascalCase
      expect(validator.validateId('my_plugin')).toBe(false); // Snake case
      expect(validator.validateId('my plugin')).toBe(false); // Space
      expect(validator.validateId('my-plugin!')).toBe(false); // Special char
    });
  });

  describe('validateDependencies()', () => {
    const createPlugin = (id: string, deps?: string[]): KpiPlugin => ({
      id,
      name: `Plugin ${id}`,
      category: 'builtin' as KpiCategory,
      domain: 'custom' as KpiDomain,
      version: '1.0.0',
      calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
      dependencies: deps,
    });

    it('should pass validation with no dependencies', () => {
      const plugin = createPlugin('test-plugin');
      const result = validator.validateDependencies(plugin, registry);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should pass validation with all dependencies present', () => {
      registry.register(createPlugin('dep-a'));
      registry.register(createPlugin('dep-b'));

      const plugin = createPlugin('test-plugin', ['dep-a', 'dep-b']);
      const result = validator.validateDependencies(plugin, registry);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should fail validation with missing dependencies', () => {
      registry.register(createPlugin('dep-a'));

      const plugin = createPlugin('test-plugin', ['dep-a', 'dep-b', 'dep-c']);
      const result = validator.validateDependencies(plugin, registry);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['dep-b', 'dep-c']);
    });
  });

  describe('validatePluginFile()', () => {
    it('should validate correct plugin file', () => {
      const content = {
        default: {
          id: 'test-plugin',
          name: 'Test Plugin',
          category: 'builtin',
          domain: 'custom',
          version: '1.0.0',
          calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
        },
      };

      const result = validator.validatePluginFile(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate named export', () => {
      const content = {
        id: 'test-plugin',
        name: 'Test Plugin',
        category: 'builtin',
        domain: 'custom',
        version: '1.0.0',
        calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
      };

      const result = validator.validatePluginFile(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-object content', () => {
      const result = validator.validatePluginFile('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin file must export an object');
    });

    it('should reject invalid plugin ID format', () => {
      const content = {
        default: {
          id: 'Invalid_ID', // PascalCase, not kebab-case
          name: 'Test Plugin',
          category: 'builtin',
          domain: 'custom',
          version: '1.0.0',
          calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
        },
      };

      const result = validator.validatePluginFile(content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid plugin ID'))).toBe(
        true
      );
    });

    it('should reject invalid version format', () => {
      const content = {
        default: {
          id: 'test-plugin',
          name: 'Test Plugin',
          category: 'builtin',
          domain: 'custom',
          version: 'v1', // Not semver
          calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
        },
      };

      const result = validator.validatePluginFile(content);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid version'))).toBe(
        true
      );
    });

    it('should accept valid semver versions', () => {
      const versions = ['1.0.0', '2.1.3', '1.0.0-beta', '1.0.0-beta.1', '1.0.0+meta'];

      versions.forEach((version) => {
        const content = {
          default: {
            id: 'test-plugin',
            name: 'Test Plugin',
            category: 'builtin',
            domain: 'custom',
            version,
            calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
          },
        };

        const result = validator.validatePluginFile(content);
        expect(result.valid).toBe(true);
      });
    });
  });
});
