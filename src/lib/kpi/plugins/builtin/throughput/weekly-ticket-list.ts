/**
 * Weekly Ticket List Plugin
 * Shows opened and closed tickets for this week and last week as a scrollable list widget.
 * Supplements aggregate counters with actual ticket details for quick overview.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

/**
 * Compute Monday-based calendar week boundaries
 */
function getWeekBoundaries() {
  const now = new Date();

  // This week: Monday to Sunday
  const thisWeekMonday = new Date(now);
  const day = thisWeekMonday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  thisWeekMonday.setDate(thisWeekMonday.getDate() + diff);
  thisWeekMonday.setHours(0, 0, 0, 0);

  const thisWeekSunday = new Date(thisWeekMonday);
  thisWeekSunday.setDate(thisWeekSunday.getDate() + 6);
  thisWeekSunday.setHours(23, 59, 59, 999);

  // Last week
  const lastWeekMonday = new Date(thisWeekMonday);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

  const lastWeekSunday = new Date(thisWeekMonday);
  lastWeekSunday.setDate(lastWeekSunday.getDate() - 1);
  lastWeekSunday.setHours(23, 59, 59, 999);

  return { thisWeekMonday, thisWeekSunday, lastWeekMonday, lastWeekSunday };
}

const weeklyTicketListPlugin: KpiPlugin = {
  id: 'weekly_ticket_list',
  name: 'Weekly Ticket List',
  description: 'Opened and closed tickets for this week and last week.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'list',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const { thisWeekMonday, thisWeekSunday, lastWeekMonday, lastWeekSunday } = getWeekBoundaries();

    const thisWeekOpened = context.issues.filter(
      (i) => i.created >= thisWeekMonday && i.created <= thisWeekSunday
    );

    const thisWeekClosed = context.issues.filter(
      (i) => i.resolved && i.resolved >= thisWeekMonday && i.resolved <= thisWeekSunday
    );

    const lastWeekOpened = context.issues.filter(
      (i) => i.created >= lastWeekMonday && i.created <= lastWeekSunday
    );

    const lastWeekClosed = context.issues.filter(
      (i) => i.resolved && i.resolved >= lastWeekMonday && i.resolved <= lastWeekSunday
    );

    return [
      {
        name: 'This Week Opened',
        value: thisWeekOpened.length,
        unit: 'tickets',
        ticketKeys: thisWeekOpened.map((i) => i.key),
        dimensions: { week: 'this_week', activity: 'opened' },
      },
      {
        name: 'This Week Closed',
        value: thisWeekClosed.length,
        unit: 'tickets',
        ticketKeys: thisWeekClosed.map((i) => i.key),
        dimensions: { week: 'this_week', activity: 'closed' },
      },
      {
        name: 'Last Week Opened',
        value: lastWeekOpened.length,
        unit: 'tickets',
        ticketKeys: lastWeekOpened.map((i) => i.key),
        dimensions: { week: 'last_week', activity: 'opened' },
      },
      {
        name: 'Last Week Closed',
        value: lastWeekClosed.length,
        unit: 'tickets',
        ticketKeys: lastWeekClosed.map((i) => i.key),
        dimensions: { week: 'last_week', activity: 'closed' },
      },
    ];
  },
};

export default weeklyTicketListPlugin;
