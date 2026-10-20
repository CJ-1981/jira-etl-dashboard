/**
 * Simple Ticket List Plugin
 * Emits every ticket in scope (analysis period + global dashboard filters are
 * already applied by the engine) as a flat list for the SimpleTicketListWidget.
 * Complements the aggregate KPIs: the widget renders the list like the Data
 * Center extract preview (key / summary / assignee / participants / status)
 * with its own search, filters, sorting, and a copy-as-TSV shortcut.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const simpleTicketListPlugin: KpiPlugin = {
  id: 'simple_ticket_list',
  name: 'Ticket List',
  description: 'Flat list of all tickets in scope for the current filters and period.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'list',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    // Newest first, matching the extract preview's default sort. `created`
    // values are Date objects on transformed issues (see engine-utils).
    const sorted = [...context.issues].sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
    );

    return [
      {
        name: 'Tickets in Scope',
        value: sorted.length,
        unit: 'tickets',
        ticketKeys: sorted.map((i) => i.key),
        dimensions: { scope: 'all' },
      },
    ];
  },
};

export default simpleTicketListPlugin;
