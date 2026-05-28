/**
 * Open Tickets by Status Plugin Unit Tests
 */

import { describe, it, expect } from 'vitest';
import openTicketsByStatusPlugin from '../open-tickets-by-status';
import { createMockContext } from '../../../../__tests__/mocks';

describe('open_tickets_by_status Plugin', () => {
  it('should have correct metadata', () => {
    expect(openTicketsByStatusPlugin.id).toBe('open_tickets_by_status');
    expect(openTicketsByStatusPlugin.name).toBe('Open Tickets by Status');
    expect(openTicketsByStatusPlugin.category).toBe('builtin');
    expect(openTicketsByStatusPlugin.domain).toBe('throughput');
    expect(openTicketsByStatusPlugin.visualization).toBe('horizontal_bar');
    expect(openTicketsByStatusPlugin.unit).toBe('tickets');
  });

  it('should calculate open tickets grouped by status', () => {
    const customIssues = [
      { key: 'TEST-1', status: 'In Progress', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-2', status: 'In Progress', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-3', status: 'To Do', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-4', status: 'Done', created: Date.now() - 100000, resolved: Date.now() - 50000 }, // Should be excluded
      { key: 'TEST-5', status: 'In Progress', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-6', status: undefined, created: Date.now() - 100000, resolved: null }, // Should be Unassigned
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByStatusPlugin.calculate(context) as any[];

    expect(results).toHaveLength(3); // In Progress, To Do, and Unassigned (Done is excluded)

    const inProgressResult = results.find((r: any) => r.name === 'Status: In Progress (This Week)');
    expect(inProgressResult).toBeDefined();
    expect(inProgressResult?.value).toBe(3);
    expect(inProgressResult?.dimensions?.status).toBe('In Progress');
    expect(inProgressResult?.ticketKeys).toEqual(['TEST-1', 'TEST-2', 'TEST-5']);

    const toDoResult = results.find((r: any) => r.name === 'Status: To Do (This Week)');
    expect(toDoResult).toBeDefined();
    expect(toDoResult?.value).toBe(1);
    expect(toDoResult?.dimensions?.status).toBe('To Do');
    expect(toDoResult?.ticketKeys).toEqual(['TEST-3']);

    const unassignedResult = results.find((r: any) => r.name === 'Status: Unassigned (This Week)');
    expect(unassignedResult).toBeDefined();
    expect(unassignedResult?.value).toBe(1);
    expect(unassignedResult?.dimensions?.status).toBe('Unassigned');
    expect(unassignedResult?.ticketKeys).toEqual(['TEST-6']);
  });

  it('should return empty array when no open issues', () => {
    const customIssues = [
      { key: 'TEST-1', status: 'Done', created: Date.now() - 100000, resolved: Date.now() - 50000 },
      { key: 'TEST-2', status: 'Closed', created: Date.now() - 100000, resolved: Date.now() - 50000 },
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByStatusPlugin.calculate(context);
    expect(results).toHaveLength(0);
  });

  it('should sort results by count descending', () => {
    const customIssues = [
      { key: 'TEST-1', status: 'To Do', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-2', status: 'In Progress', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-3', status: 'In Progress', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-4', status: 'To Do', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-5', status: 'In Progress', created: Date.now() - 100000, resolved: null },
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByStatusPlugin.calculate(context) as any[];

    expect(results[0].value).toBeGreaterThanOrEqual(results[1]?.value || 0);
    expect(results[0].name).toBe('Status: In Progress (This Week)'); // 3 tickets
    expect(results[1].name).toBe('Status: To Do (This Week)'); // 2 tickets
  });
});
