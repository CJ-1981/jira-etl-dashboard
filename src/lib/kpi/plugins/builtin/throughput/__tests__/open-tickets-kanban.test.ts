/**
 * Open Tickets in Kanban View Plugin Unit Tests
 */

import { describe, it, expect } from 'vitest';
import openTicketsKanbanPlugin from '../open-tickets-kanban';
import { createMockContext } from '../../../../__tests__/mocks';

describe('open_tickets_kanban Plugin', () => {
  it('should have correct metadata', () => {
    expect(openTicketsKanbanPlugin.id).toBe('open_tickets_kanban');
    expect(openTicketsKanbanPlugin.name).toBe('Open Tickets in Kanban View');
    expect(openTicketsKanbanPlugin.category).toBe('builtin');
    expect(openTicketsKanbanPlugin.domain).toBe('throughput');
    expect(openTicketsKanbanPlugin.visualization).toBe('card');
    expect(openTicketsKanbanPlugin.unit).toBe('tickets');
  });

  it('should calculate open tickets grouped by status, assignee, and age', () => {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const customIssues = [
      { key: 'TEST-1', status: 'In Progress', assignee: 'Alice', created: now - 100000, resolved: null }, // This week
      { key: 'TEST-2', status: 'In Progress', assignee: 'Alice', created: now - msPerWeek * 1.5, resolved: null }, // 1 week old (last_week)
      { key: 'TEST-3', status: 'To Do', assignee: 'Bob', created: now - msPerWeek * 3, resolved: null }, // Existing (2+ weeks)
      { key: 'TEST-4', status: 'Done', assignee: 'Alice', created: now - 100000, resolved: now - 50000 }, // Excluded
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(now - 86400000 * 30), end: new Date(now) } });

    const results = openTicketsKanbanPlugin.calculate(context) as any[];

    expect(results).toHaveLength(3);

    const aliceInProgressThisWeek = results.find((r: any) => r.dimensions?.assignee === 'Alice' && r.dimensions?.ageCategory === 'this_week');
    expect(aliceInProgressThisWeek).toBeDefined();
    expect(aliceInProgressThisWeek?.value).toBe(1);
    expect(aliceInProgressThisWeek?.name).toBe('Alice (In Progress) [This week]');
    expect(aliceInProgressThisWeek?.ticketKeys).toEqual(['TEST-1']);

    const aliceInProgressLastWeek = results.find((r: any) => r.dimensions?.assignee === 'Alice' && r.dimensions?.ageCategory === 'last_week');
    expect(aliceInProgressLastWeek).toBeDefined();
    expect(aliceInProgressLastWeek?.value).toBe(1);
    expect(aliceInProgressLastWeek?.name).toBe('Alice (In Progress) [1 week]');
    expect(aliceInProgressLastWeek?.ticketKeys).toEqual(['TEST-2']);

    const bobToDoExisting = results.find((r: any) => r.dimensions?.assignee === 'Bob' && r.dimensions?.ageCategory === 'existing');
    expect(bobToDoExisting).toBeDefined();
    expect(bobToDoExisting?.value).toBe(1);
    expect(bobToDoExisting?.name).toBe('Bob (To Do) [2+ weeks]');
    expect(bobToDoExisting?.ticketKeys).toEqual(['TEST-3']);
  });

  it('should return empty array when no open issues', () => {
    const customIssues = [
      { key: 'TEST-1', status: 'Done', assignee: 'Alice', created: Date.now() - 100000, resolved: Date.now() - 50000 },
      { key: 'TEST-2', status: 'Closed', assignee: 'Bob', created: Date.now() - 100000, resolved: Date.now() - 50000 },
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsKanbanPlugin.calculate(context);
    expect(results).toHaveLength(0);
  });
});
