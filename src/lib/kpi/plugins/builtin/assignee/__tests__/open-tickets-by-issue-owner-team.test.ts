/**
 * Open Tickets by Issue Owner Team Plugin Unit Tests
 */

import { describe, it, expect } from 'vitest';
import openTicketsByIssueOwnerTeamPlugin from '../open-tickets-by-issue-owner-team';
import { createMockContext } from '../../../../__tests__/mocks';

describe('open_tickets_by_issue_owner_team Plugin', () => {
  it('should have correct metadata', () => {
    expect(openTicketsByIssueOwnerTeamPlugin.id).toBe('open_tickets_by_issue_owner_team');
    expect(openTicketsByIssueOwnerTeamPlugin.name).toBe('Open Tickets by Issue Owner Team');
    expect(openTicketsByIssueOwnerTeamPlugin.category).toBe('builtin');
    expect(openTicketsByIssueOwnerTeamPlugin.domain).toBe('assignee');
    expect(openTicketsByIssueOwnerTeamPlugin.visualization).toBe('horizontal_bar');
    expect(openTicketsByIssueOwnerTeamPlugin.unit).toBe('tickets');
  });

  it('should calculate open tickets grouped by issue owner team', () => {
    const customIssues = [
      { key: 'TEST-1', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-2', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-3', issueOwnerTeam: 'LTIC-Team-B', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-4', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: Date.now() - 50000 }, // Should be excluded
      { key: 'TEST-5', issueOwnerTeam: 'LTIC-Team-B', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-6', issueOwnerTeam: null, created: Date.now() - 100000, resolved: null }, // Should be Unassigned
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByIssueOwnerTeamPlugin.calculate(context) as any[];

    expect(results).toHaveLength(3); // LTIC-Team-A, LTIC-Team-B, and Unassigned

    const teamAResult = results.find((r: any) => r.name === 'Team: LTIC-Team-A (This Week)');
    expect(teamAResult).toBeDefined();
    expect(teamAResult?.value).toBe(2); // 2 open tickets (TEST-1, TEST-2)
    expect(teamAResult?.dimensions?.team).toBe('LTIC-Team-A');
    expect(teamAResult?.ticketKeys).toEqual(['TEST-1', 'TEST-2']);

    const teamBResult = results.find((r: any) => r.name === 'Team: LTIC-Team-B (This Week)');
    expect(teamBResult).toBeDefined();
    expect(teamBResult?.value).toBe(2); // 2 open tickets (TEST-3, TEST-5)
    expect(teamBResult?.dimensions?.team).toBe('LTIC-Team-B');
    expect(teamBResult?.ticketKeys).toEqual(['TEST-3', 'TEST-5']);

    const unassignedResult = results.find((r: any) => r.name === 'Team: Unassigned (This Week)');
    expect(unassignedResult).toBeDefined();
    expect(unassignedResult?.value).toBe(1); // 1 open ticket (TEST-6)
    expect(unassignedResult?.dimensions?.team).toBe('Unassigned');
    expect(unassignedResult?.ticketKeys).toEqual(['TEST-6']);
  });

  it('should return empty array when no open issues', () => {
    const customIssues = [
      { key: 'TEST-1', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: Date.now() - 50000 },
      { key: 'TEST-2', issueOwnerTeam: 'LTIC-Team-B', created: Date.now() - 100000, resolved: Date.now() - 50000 },
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByIssueOwnerTeamPlugin.calculate(context);
    expect(results).toHaveLength(0);
  });

  it('should sort results by count descending', () => {
    const customIssues = [
      { key: 'TEST-1', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-2', issueOwnerTeam: 'LTIC-Team-B', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-3', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-4', issueOwnerTeam: 'LTIC-Team-A', created: Date.now() - 100000, resolved: null },
      { key: 'TEST-5', issueOwnerTeam: 'LTIC-Team-B', created: Date.now() - 100000, resolved: null },
    ];

    const context = createMockContext(0, { issues: customIssues as any, period: { start: new Date(Date.now() - 86400000 * 30), end: new Date() } });

    const results = openTicketsByIssueOwnerTeamPlugin.calculate(context) as any[];

    expect(results[0].value).toBeGreaterThanOrEqual(results[1]?.value || 0);
    expect(results[0].name).toBe('Team: LTIC-Team-A (This Week)'); // 3 tickets
    expect(results[1].name).toBe('Team: LTIC-Team-B (This Week)'); // 2 tickets
  });
});
