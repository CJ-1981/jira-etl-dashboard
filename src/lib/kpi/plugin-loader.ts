/**
 * KPI Plugin Loader
 * Auto-discovers and loads plugin files from domain-based directories
 * @MX:ANCHOR: Plugin auto-discovery and loading
 * @MX:REASON: Enables dynamic plugin registration without manual imports
 */

import type { KpiPlugin } from './types';

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
import timeInStatusPlugin from './plugins/builtin/turnaround/time-in-status';
import throughputPlugin from './plugins/builtin/throughput/throughput';
import openTicketsByPriorityPlugin from './plugins/builtin/throughput/open-tickets-by-priority';
import resolutionRatePlugin from './plugins/builtin/quality/resolution-rate';
import reassignmentPlugin from './plugins/builtin/quality/reassignment';
import openTicketsByAssigneePlugin from './plugins/builtin/assignee/open-tickets-by-assignee';

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

      // Throughput plugins
      throughputPlugin,
      openTicketsByPriorityPlugin,

      // Quality plugins
      resolutionRatePlugin,
      reassignmentPlugin,

      // Assignee plugins
      openTicketsByAssigneePlugin,
    ];
  }

  /**
   * Load custom plugins from user-defined directory
   * @returns Array of custom plugins
   */
  loadCustomPlugins(): KpiPlugin[] {
    // Custom plugins would be loaded here in the future
    return [];
  }
}
