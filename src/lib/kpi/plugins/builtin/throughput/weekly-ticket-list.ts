/**
 * Weekly Ticket List Plugin
 * Shows opened and closed tickets for this week and last week as a scrollable list widget.
 * Supplements aggregate counters with actual ticket details for quick overview.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { getPriorityOrder } from '../../../engine-utils';
import { getLocalMondayWeekBounds } from '../../../../utils/week-boundaries';

/**
 * Compute Monday-based calendar week boundaries
 * @MX:NOTE: The local-time Monday week math lives in the shared
 * getLocalMondayWeekBounds helper; here we only derive the inclusive
 * Sunday 23:59:59.999 end instants from those exclusive-start bounds.
 */
function getWeekBoundaries() {
  const { thisWeekStart, lastWeekStart } = getLocalMondayWeekBounds(new Date());

  // This week: Monday to Sunday (inclusive end)
  const thisWeekMonday = thisWeekStart;
  const thisWeekSunday = new Date(thisWeekMonday);
  thisWeekSunday.setDate(thisWeekSunday.getDate() + 6);
  thisWeekSunday.setHours(23, 59, 59, 999);

  // Last week
  const lastWeekMonday = lastWeekStart;
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

    // Sort each group by priority ascending (P0 → P3 → Lowest)
    const sortByPriority = (issues: typeof context.issues) =>
      [...issues].sort((a, b) => getPriorityOrder(a.priority ?? '') - getPriorityOrder(b.priority ?? ''));

    return [
      {
        name: 'This Week Opened',
        value: thisWeekOpened.length,
        unit: 'tickets',
        ticketKeys: sortByPriority(thisWeekOpened).map((i) => i.key),
        dimensions: { week: 'this_week', activity: 'opened' },
      },
      {
        name: 'This Week Closed',
        value: thisWeekClosed.length,
        unit: 'tickets',
        ticketKeys: sortByPriority(thisWeekClosed).map((i) => i.key),
        dimensions: { week: 'this_week', activity: 'closed' },
      },
      {
        name: 'Last Week Opened',
        value: lastWeekOpened.length,
        unit: 'tickets',
        ticketKeys: sortByPriority(lastWeekOpened).map((i) => i.key),
        dimensions: { week: 'last_week', activity: 'opened' },
      },
      {
        name: 'Last Week Closed',
        value: lastWeekClosed.length,
        unit: 'tickets',
        ticketKeys: sortByPriority(lastWeekClosed).map((i) => i.key),
        dimensions: { week: 'last_week', activity: 'closed' },
      },
    ];
  },
};

export default weeklyTicketListPlugin;
