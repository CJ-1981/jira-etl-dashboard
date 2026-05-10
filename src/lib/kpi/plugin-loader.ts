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

// Import all time-series plugins directly
import avgProcessingHoursWeeklyPlugin from './plugins/time-series/processing-time/avg-processing-hours-weekly';
import throughputWeeklyPlugin from './plugins/time-series/throughput/throughput-weekly';
import cumulativeFlowDailyPlugin from './plugins/time-series/throughput/cumulative-flow-daily';
import slaComplianceWeeklyPlugin from './plugins/time-series/sla/sla-compliance-daily';
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
