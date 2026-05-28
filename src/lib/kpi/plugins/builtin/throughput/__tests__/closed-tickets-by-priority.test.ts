/**
 * Closed Tickets by Priority Plugin Unit Tests
 */

import { describe, it, expect } from 'vitest';
import closedTicketsByPriorityPlugin from '../closed-tickets-by-priority';
import { createMockContext } from '../../../../__tests__/mocks';

describe('closed_tickets_by_priority Plugin', () => {
  it('should have correct metadata', () => {
    expect(closedTicketsByPriorityPlugin.id).toBe('closed_tickets_by_priority');
    expect(closedTicketsByPriorityPlugin.name).toBe('Closed Tickets by Priority');
    expect(closedTicketsByPriorityPlugin.category).toBe('builtin');
    expect(closedTicketsByPriorityPlugin.domain).toBe('throughput');
    expect(closedTicketsByPriorityPlugin.visualization).toBe('horizontal_bar');
    expect(closedTicketsByPriorityPlugin.unit).toBe('tickets');
  });

  it('should calculate closed tickets grouped by priority and age', () => {
    const now = Date.now();
    const customIssues = [
      { key: 'TEST-1', priority: 'High', status: 'Done', created: now - 100000, resolved: now - 1000 }, // This week
      { key: 'TEST-2', priority: 'High', status: 'Done', created: now - 100000, resolved: now - 86400000 * 8 }, // Last week
      { key: 'TEST-3', priority: 'Medium', status: 'Closed', created: now - 100000, resolved: now - 86400000 * 20 }, // Existing
      { key: 'TEST-4', priority: 'Low', status: 'In Progress', created: now - 100000, resolved: null }, // Open, should be excluded
      { key: 'TEST-5', priority: undefined, status: 'Done', created: now - 100000, resolved: now - 1000 }, // Unassigned
    ];

    const context = createMockContext(0, {
      issues: customIssues as any,
      period: { start: new Date(now - 86400000 * 30), end: new Date(now) }
    });

    const results = closedTicketsByPriorityPlugin.calculate(context) as any[];

    expect(results).toHaveLength(4); // High (This week), High (Last week), Medium (Existing), Unassigned (This week)

    const highThisWeek = results.find((r: any) => r.name === 'Priority: High (This Week)');
    expect(highThisWeek).toBeDefined();
    expect(highThisWeek?.value).toBe(1);
    expect(highThisWeek?.dimensions?.priority).toBe('High');
    expect(highThisWeek?.dimensions?.ageCategory).toBe('this_week');
    expect(highThisWeek?.ticketKeys).toEqual(['TEST-1']);

    const highLastWeek = results.find((r: any) => r.name === 'Priority: High (Last Week)');
    expect(highLastWeek).toBeDefined();
    expect(highLastWeek?.value).toBe(1);
    expect(highLastWeek?.dimensions?.priority).toBe('High');
    expect(highLastWeek?.dimensions?.ageCategory).toBe('last_week');
    expect(highLastWeek?.ticketKeys).toEqual(['TEST-2']);

    const mediumExisting = results.find((r: any) => r.name === 'Priority: Medium (Existing)');
    expect(mediumExisting).toBeDefined();
    expect(mediumExisting?.value).toBe(1);
    expect(mediumExisting?.dimensions?.priority).toBe('Medium');
    expect(mediumExisting?.dimensions?.ageCategory).toBe('existing');
    expect(mediumExisting?.ticketKeys).toEqual(['TEST-3']);
  });

  it('should return empty array when no closed issues', () => {
    const now = Date.now();
    const customIssues = [
      { key: 'TEST-1', priority: 'High', status: 'In Progress', created: now - 100000, resolved: null },
      { key: 'TEST-2', priority: 'Medium', status: 'To Do', created: now - 100000, resolved: null },
    ];

    const context = createMockContext(0, {
      issues: customIssues as any,
      period: { start: new Date(now - 86400000 * 30), end: new Date(now) }
    });

    const results = closedTicketsByPriorityPlugin.calculate(context);
    expect(results).toHaveLength(0);
  });
});
