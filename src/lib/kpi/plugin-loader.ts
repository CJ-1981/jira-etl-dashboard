/**
 * KPI Plugin Loader
 * Auto-discovers and loads plugin files from domain-based directories
 * @MX:ANCHOR: Plugin auto-discovery and loading
 * @MX:REASON: Enables dynamic plugin registration without manual imports
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { KpiPlugin } from './types';
import { getCustomPluginDir } from './plugin-paths';

// Import all built-in plugins directly
import avgProcessingHoursPlugin from './plugins/builtin/processing-time/avg-processing-hours';
import medianProcessingHoursPlugin from './plugins/builtin/processing-time/median-processing-hours';
import avgWorkingDaysPlugin from './plugins/builtin/processing-time/avg-working-days';
import cycleTimeHistogramPlugin from './plugins/builtin/processing-time/cycle-time-histogram';
import agingWipPlugin from './plugins/builtin/processing-time/aging-wip';
import firstResponseTimePlugin from './plugins/builtin/processing-time/first-response-time';
import slaCompliancePlugin from './plugins/builtin/sla/sla-compliance';
import slaByPriorityPlugin from './plugins/builtin/sla/sla-by-priority';
import slaByStatusPlugin from './plugins/builtin/sla/sla-by-status';
import slaByStatusExclClonePlugin from './plugins/builtin/sla/sla-by-status-excl-clone';
import timeInStatusPlugin from './plugins/builtin/turnaround/time-in-status'
import noCommentFollowupPlugin from './plugins/builtin/turnaround/no-comment-followup';
import throughputPlugin from './plugins/builtin/throughput/throughput';
import openTicketsByPriorityPlugin from './plugins/builtin/throughput/open-tickets-by-priority';
import closedTicketsByPriorityPlugin from './plugins/builtin/throughput/closed-tickets-by-priority';
import openTicketsByStatusPlugin from './plugins/builtin/throughput/open-tickets-by-status';
import openTicketsKanbanPlugin from './plugins/builtin/throughput/open-tickets-kanban';
import weeklyTicketListPlugin from './plugins/builtin/throughput/weekly-ticket-list';
import resolutionRatePlugin from './plugins/builtin/quality/resolution-rate';
import reassignmentPlugin from './plugins/builtin/quality/reassignment';
import openTicketsByAssigneePlugin from './plugins/builtin/assignee/open-tickets-by-assignee';
import openTicketsByIssueOwnerTeamPlugin from './plugins/builtin/assignee/open-tickets-by-issue-owner-team';

// Import all time-series plugins directly
import avgProcessingHoursWeeklyPlugin from './plugins/time-series/processing-time/avg-processing-hours-weekly';
import throughputWeeklyPlugin from './plugins/time-series/throughput/throughput-weekly'
import priorityInflowWeeklyPlugin from './plugins/time-series/throughput/priority-inflow-weekly';
import cumulativeFlowDailyPlugin from './plugins/time-series/throughput/cumulative-flow-daily';
import slaComplianceWeeklyPlugin from './plugins/time-series/sla/sla-compliance-weekly';
import slaByStatusWeeklyPlugin from './plugins/time-series/sla/sla-by-status-weekly';
import slaByStatusExclCloneWeeklyPlugin from './plugins/time-series/sla/sla-by-status-excl-clone-weekly';
import timeInStatusWeeklyPlugin from './plugins/time-series/turnaround/time-in-status-daily';
import openTicketsByAssigneeWeeklyPlugin from './plugins/time-series/assignee/open-tickets-by-assignee-weekly';

/**
 * Plugin Loader for auto-discovering built-in plugins
 * Loads all plugins from domain directories
 * @MX:ANCHOR: PluginLoader core class
 * @MX:REASON: Provides automated plugin discovery from file system
 */
export class PluginLoader {
  /**
   * Load all built-in plugins from domain directories
   * @returns Array of discovered and instantiated plugins
   */
  loadBuiltinPlugins(): KpiPlugin[] {
    return [
      // Processing time plugins
      avgProcessingHoursPlugin,
      medianProcessingHoursPlugin,
      avgWorkingDaysPlugin,
      cycleTimeHistogramPlugin,
      agingWipPlugin,
      firstResponseTimePlugin,

      // SLA plugins
      slaCompliancePlugin,
      slaByPriorityPlugin,
      slaByStatusPlugin,
      slaByStatusExclClonePlugin,

      // Turnaround plugins
      timeInStatusPlugin,
      noCommentFollowupPlugin,

      // Throughput plugins
      throughputPlugin,
      openTicketsByPriorityPlugin,
      closedTicketsByPriorityPlugin,
      openTicketsByStatusPlugin,
      openTicketsKanbanPlugin,
      weeklyTicketListPlugin,

      // Quality plugins
      resolutionRatePlugin,
      reassignmentPlugin,

      // Assignee plugins
      openTicketsByAssigneePlugin,
      openTicketsByIssueOwnerTeamPlugin,
    ];
  }

  /**
   * Load custom plugins from user-defined directory
   * @returns Array of custom plugins
   * @MX:ANCHOR: Custom plugin loader
   * @MX:REASON: Enables users to add custom plugins without code changes
   */
  async loadCustomPlugins(): Promise<KpiPlugin[]> {
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
        } else if (entry.isFile() && this.isPluginFile(entry.name)) {
          // Try to load the plugin file using dynamic import
          try {
            const fileUrl = pathToFileURL(fullPath).href;
            const pluginModule = await import(/* webpackIgnore: true */ fileUrl);
            const plugin = pluginModule.default || pluginModule;

            // Validate plugin structure
            if (this.isValidPlugin(plugin)) {
              // Ensure category and domain are set correctly for custom plugins
              plugin.category = 'custom';
              if (!plugin.domain) {
                // Infer domain from directory structure
                const relativePath = path.relative(customDir, fullPath);
                const domainFolder = relativePath.split(path.sep)[0];
                plugin.domain = this.normalizeDomainName(domainFolder) as any;
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

  /**
   * Check if a file is a plugin file based on extension
   * @param filename - Name of the file to check
   * @returns True if the file appears to be a plugin file
   */
  private isPluginFile(filename: string): boolean {
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
   * @returns True if the object is a valid plugin
   */
  private isValidPlugin(plugin: unknown): plugin is KpiPlugin {
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
  private normalizeDomainName(folderName: string): string {
    // Convert folder names like "processing time" to "processing-time"
    return folderName.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Load all time-series plugins from the time-series directory
   * @returns Array of discovered time-series plugins
   * @MX:ANCHOR: Time-series plugin loader
   * @MX:REASON: Centralizes time-series plugin registration
   */
  public loadTimeSeriesPlugins(): KpiPlugin[] {
    return [
      // Processing time time-series plugins
      avgProcessingHoursWeeklyPlugin,

      // Throughput time-series plugins
      throughputWeeklyPlugin,
      priorityInflowWeeklyPlugin,
      cumulativeFlowDailyPlugin,

      // SLA time-series plugins
      slaComplianceWeeklyPlugin,
      slaByStatusWeeklyPlugin,
      slaByStatusExclCloneWeeklyPlugin,

      // Turnaround time-series plugins
      timeInStatusWeeklyPlugin,

      // Assignee time-series plugins
      openTicketsByAssigneeWeeklyPlugin,
    ];
  }
}
