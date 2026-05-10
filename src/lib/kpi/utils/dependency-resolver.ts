/**
 * KPI Plugin Dependency Resolver
 * Topological sort and circular dependency detection for plugin loading
 * @MX:ANCHOR: Dependency resolution infrastructure
 * @MX:REASON: Ensures plugins load in correct order based on dependencies
 */

import { KpiPlugin } from '../types';

/**
 * Resolution result with sorted plugins and any errors
 */
export interface DependencyResolution {
  resolved: KpiPlugin[];
  errors: Array<{ plugin: string; error: string }>;
}

/**
 * Resolve plugin dependencies and return topologically sorted list
 * Uses Kahn's algorithm for topological sorting
 * @param plugins - Array of plugins to resolve
 * @returns Resolution result with sorted plugins and errors
 */
export function resolveDependencies(plugins: KpiPlugin[]): DependencyResolution {
  const errors: Array<{ plugin: string; error: string }> = [];
  const pluginMap = new Map<string, KpiPlugin>();
  const inDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  // Build graph structures
  for (const plugin of plugins) {
    pluginMap.set(plugin.id, plugin);
    inDegree.set(plugin.id, 0);
    adjacencyList.set(plugin.id, []);
  }

  // Calculate in-degrees and build adjacency list
  for (const plugin of plugins) {
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (pluginMap.has(dep)) {
          adjacencyList.get(plugin.id)?.push(dep);
          inDegree.set(plugin.id, (inDegree.get(plugin.id) || 0) + 1);
        } else {
          errors.push({
            plugin: plugin.id,
            error: `Missing dependency: ${dep}`,
          });
        }
      }
    }
  }

  // Detect circular dependencies using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const circularDeps: string[] = [];

  const detectCycle = (node: string): boolean => {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = adjacencyList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (detectCycle(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        circularDeps.push(`${node} -> ${neighbor}`);
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  };

  const pluginIds = Array.from(pluginMap.keys());
  for (const pluginId of pluginIds) {
    if (!visited.has(pluginId)) {
      if (detectCycle(pluginId)) {
        errors.push({
          plugin: pluginId,
          error: `Circular dependency detected: ${circularDeps.join(', ')}`,
        });
        // Return early as circular dependencies make resolution impossible
        return { resolved: [], errors };
      }
    }
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  const result: KpiPlugin[] = [];

  // Add all nodes with in-degree 0 to queue
  const inDegreeEntries = Array.from(inDegree.entries());
  for (const [pluginId, degree] of inDegreeEntries) {
    if (degree === 0) {
      queue.push(pluginId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const plugin = pluginMap.get(current);

    if (plugin) {
      result.push(plugin);
    }

    // Reduce in-degree for all neighbors
    const neighbors = adjacencyList.get(current) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check if topological sort includes all nodes
  if (result.length !== pluginMap.size) {
    // This shouldn't happen after cycle detection, but check anyway
    const unsorted = Array.from(pluginMap.keys()).filter(
      (id) => !result.find((p) => p.id === id)
    );
    errors.push({
      plugin: 'system',
      error: `Unable to resolve dependencies for: ${unsorted.join(', ')}`,
    });
  }

  return { resolved: result, errors };
}

/**
 * Validate that a plugin's dependencies are satisfiable
 * Does not perform full resolution, just checks dependency validity
 * @param plugin - Plugin to validate
 * @param availablePlugins - Set of available plugin IDs
 * @returns true if all dependencies are available
 */
export function validateDependencies(
  plugin: KpiPlugin,
  availablePlugins: Set<string>
): { valid: boolean; missing: string[] } {
  if (!plugin.dependencies || plugin.dependencies.length === 0) {
    return { valid: true, missing: [] };
  }

  const missing: string[] = [];
  for (const dep of plugin.dependencies) {
    if (!availablePlugins.has(dep)) {
      missing.push(dep);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get the dependency tree for a specific plugin
 * Useful for debugging and visualization
 * @param pluginId - Plugin to analyze
 * @param allPlugins - All available plugins
 * @returns Nested tree structure showing dependencies
 */
export function getDependencyTree(
  pluginId: string,
  allPlugins: KpiPlugin[]
): DependencyNode | null {
  const pluginMap = new Map(allPlugins.map((p) => [p.id, p]));
  const plugin = pluginMap.get(pluginId);

  if (!plugin) {
    return null;
  }

  const buildTree = (id: string, visited = new Set<string>()): DependencyNode | null => {
    if (visited.has(id)) {
      return {
        id,
        circular: true,
        dependencies: [],
      };
    }

    visited.add(id);
    const currentPlugin = pluginMap.get(id);

    if (!currentPlugin) {
      return {
        id,
        missing: true,
        dependencies: [],
      };
    }

    const dependencies = currentPlugin.dependencies || [];
    const children: DependencyNode[] = [];

    for (const dep of dependencies) {
      const childNode = buildTree(dep, new Set(visited));
      if (childNode) {
        children.push(childNode);
      }
    }

    return {
      id,
      dependencies: children,
    };
  };

  return buildTree(pluginId);
}

/**
 * Node in the dependency tree
 */
export interface DependencyNode {
  /** Plugin ID */
  id: string;
  /** Child dependencies */
  dependencies: DependencyNode[];
  /** True if this node is part of a circular dependency */
  circular?: boolean;
  /** True if this dependency is missing */
  missing?: boolean;
}
