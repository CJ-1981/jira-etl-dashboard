/**
 * Dependency Resolver Tests
 * Verify topological sorting and circular dependency detection
 */

import { describe, it, expect } from 'vitest';
import {
  resolveDependencies,
  validateDependencies,
  getDependencyTree,
  DependencyNode,
} from '../utils/dependency-resolver';
import { KpiPlugin, KpiCategory, KpiDomain } from '../types';

describe('Dependency Resolver', () => {
  const createPlugin = (
    id: string,
    dependencies?: string[]
  ): KpiPlugin => ({
    id,
    name: `Plugin ${id}`,
    category: 'builtin' as KpiCategory,
    domain: 'custom' as KpiDomain,
    version: '1.0.0',
    unit: 'count',
    calculate: () => ({ name: 'test', value: 42, unit: 'count' }),
    dependencies,
  });

  describe('resolveDependencies()', () => {
    it('should resolve plugins with no dependencies', () => {
      const plugins = [createPlugin('a'), createPlugin('b'), createPlugin('c')];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(3);
    });

    it('should resolve plugins with simple dependencies', () => {
      const plugins = [
        createPlugin('c', ['b']),
        createPlugin('b', ['a']),
        createPlugin('a'),
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(3);

      // Check topological order: a before b before c
      const order = result.resolved.map((p) => p.id);
      const indexA = order.indexOf('a');
      const indexB = order.indexOf('b');
      const indexC = order.indexOf('c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it('should resolve plugins with multiple dependencies', () => {
      const plugins = [
        createPlugin('d', ['b', 'c']),
        createPlugin('c', ['a']),
        createPlugin('b', ['a']),
        createPlugin('a'),
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(4);

      // a must come before both b and c
      const order = result.resolved.map((p) => p.id);
      const indexA = order.indexOf('a');
      const indexB = order.indexOf('b');
      const indexC = order.indexOf('c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexA).toBeLessThan(indexC);
    });

    it('should detect circular dependencies', () => {
      const plugins = [
        createPlugin('a', ['b']),
        createPlugin('b', ['c']),
        createPlugin('c', ['a']), // Circular!
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Circular dependency');
      expect(result.resolved).toHaveLength(0);
    });

    it('should detect self-dependency', () => {
      const plugins = [createPlugin('a', ['a'])];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Circular dependency');
    });

    it('should detect missing dependencies', () => {
      const plugins = [
        createPlugin('a', ['b']),
        createPlugin('b', ['c']), // c doesn't exist
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].plugin).toBe('b');
      expect(result.errors[0].error).toContain('Missing dependency: c');
    });

    it('should handle complex diamond dependency', () => {
      //     a
      //    / \
      //   b   c
      //    \ /
      //     d
      const plugins = [
        createPlugin('d', ['b', 'c']),
        createPlugin('c', ['a']),
        createPlugin('b', ['a']),
        createPlugin('a'),
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(4);

      const order = result.resolved.map((p) => p.id);
      const indexA = order.indexOf('a');

      // a must come before b, c, and d
      expect(indexA).toBeLessThan(order.indexOf('b'));
      expect(indexA).toBeLessThan(order.indexOf('c'));
      expect(indexA).toBeLessThan(order.indexOf('d'));
    });

    it('should handle independent branches', () => {
      // a -> b
      // c -> d
      const plugins = [
        createPlugin('b', ['a']),
        createPlugin('d', ['c']),
        createPlugin('a'),
        createPlugin('c'),
      ];

      const result = resolveDependencies(plugins);

      expect(result.errors).toHaveLength(0);
      expect(result.resolved).toHaveLength(4);

      const order = result.resolved.map((p) => p.id);
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });
  });

  describe('validateDependencies()', () => {
    it('should pass validation with no dependencies', () => {
      const plugin = createPlugin('test');
      const availablePlugins = new Set(['a', 'b', 'c']);

      const result = validateDependencies(plugin, availablePlugins);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should pass validation with all dependencies available', () => {
      const plugin = createPlugin('test', ['a', 'b', 'c']);
      const availablePlugins = new Set(['a', 'b', 'c', 'd']);

      const result = validateDependencies(plugin, availablePlugins);

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should fail validation with missing dependencies', () => {
      const plugin = createPlugin('test', ['a', 'b', 'c']);
      const availablePlugins = new Set(['a', 'd']);

      const result = validateDependencies(plugin, availablePlugins);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['b', 'c']);
    });

    it('should handle empty available plugins set', () => {
      const plugin = createPlugin('test', ['a', 'b']);
      const availablePlugins = new Set<string>();

      const result = validateDependencies(plugin, availablePlugins);

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['a', 'b']);
    });
  });

  describe('getDependencyTree()', () => {
    it('should build tree for plugin with no dependencies', () => {
      const plugins = [createPlugin('a')];
      const tree = getDependencyTree('a', plugins);

      expect(tree).not.toBeNull();
      expect(tree?.id).toBe('a');
      expect(tree?.dependencies).toHaveLength(0);
    });

    it('should build tree for plugin with dependencies', () => {
      const plugins = [
        createPlugin('a', ['b', 'c']),
        createPlugin('b', ['d']),
        createPlugin('c'),
        createPlugin('d'),
      ];

      const tree = getDependencyTree('a', plugins);

      expect(tree).not.toBeNull();
      expect(tree?.id).toBe('a');
      expect(tree?.dependencies).toHaveLength(2);

      const depB = tree?.dependencies.find((d) => d.id === 'b');
      const depC = tree?.dependencies.find((d) => d.id === 'c');

      expect(depB).toBeDefined();
      expect(depC).toBeDefined();

      // b depends on d
      expect(depB?.dependencies).toHaveLength(1);
      expect(depB?.dependencies[0].id).toBe('d');

      // c has no dependencies
      expect(depC?.dependencies).toHaveLength(0);
    });

    it('should return null for non-existent plugin', () => {
      const plugins = [createPlugin('a')];
      const tree = getDependencyTree('non-existent', plugins);

      expect(tree).toBeNull();
    });

    it('should detect missing dependencies in tree', () => {
      const plugins = [
        createPlugin('a', ['b', 'c']), // c doesn't exist
        createPlugin('b'),
      ];

      const tree = getDependencyTree('a', plugins);

      expect(tree).not.toBeNull();

      const depC = tree?.dependencies.find((d) => d.id === 'c');
      expect(depC?.missing).toBe(true);
    });

    it('should detect circular dependencies in tree', () => {
      const plugins = [
        createPlugin('a', ['b']),
        createPlugin('b', ['c']),
        createPlugin('c', ['a']), // Circular!
      ];

      const tree = getDependencyTree('a', plugins);

      expect(tree).not.toBeNull();

      // Find circular node
      const findCircular = (node: DependencyNode): boolean => {
        if (node.circular) return true;
        return node.dependencies.some(findCircular);
      };

      expect(findCircular(tree!)).toBe(true);
    });

    it('should handle deep dependency chains', () => {
      // a -> b -> c -> d -> e
      const plugins = [
        createPlugin('e'),
        createPlugin('d', ['e']),
        createPlugin('c', ['d']),
        createPlugin('b', ['c']),
        createPlugin('a', ['b']),
      ];

      const tree = getDependencyTree('a', plugins);

      expect(tree).not.toBeNull();
      expect(tree?.id).toBe('a');

      // Navigate the chain
      let current = tree!;
      const expectedChain = ['a', 'b', 'c', 'd', 'e'];

      for (const expectedId of expectedChain) {
        expect(current.id).toBe(expectedId);
        if (current.dependencies.length > 0) {
          current = current.dependencies[0];
        }
      }
    });
  });
});
