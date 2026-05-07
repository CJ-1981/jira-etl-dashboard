import { describe, it, expect } from 'vitest';
import { getKpiEngine, type KpiContext, type TransformedIssue } from '../engine';
import { GERMAN_STATES } from '../../holidays/german-holidays';

describe('KPI Engine', () => {
  const engine = getKpiEngine();
  
  const mockHolidays = {
    regions: [GERMAN_STATES.NATIONAL],
    workStartHour: 9,
    workEndHour: 17,
    slaTargetHours: 40
  };

  const mockPeriod = {
    start: new Date('2026-05-01T00:00:00'),
    end: new Date('2026-05-31T23:59:59')
  };

  const createMockIssue = (overrides: Partial<TransformedIssue> = {}): TransformedIssue => ({
    key: 'PROJ-1',
    project: 'PROJ',
    summary: 'Test Issue',
    issueType: 'Story',
    priority: 'Medium',
    status: 'Done',
    statusCategory: 'Done',
    assignee: 'Alice',
    reporter: 'Bob',
    created: new Date('2026-05-11T10:00:00'),
    updated: new Date('2026-05-12T10:00:00'),
    resolved: new Date('2026-05-12T10:00:00'),
    dueDate: null,
    storyPoints: 5,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...overrides
  });

  describe('avg_processing_hours', () => {
    it('should calculate average business hours correctly', () => {
      const issue1 = createMockIssue({
        created: new Date('2026-05-11T10:00:00'), // Mon
        resolved: new Date('2026-05-11T14:00:00'), // 4h
      });
      const issue2 = createMockIssue({
        key: 'PROJ-2',
        created: new Date('2026-05-12T10:00:00'), // Tue
        resolved: new Date('2026-05-12T16:00:00'), // 6h
      });

      // We need to wrap them in JiraIssue or similar if we use engine.calculate
      // But engine.calculate takes JiraIssue[] and transforms them.
      // Let's test the plugin's calculate method directly if possible, or use engine.calculate with minimal JiraIssue structure.
      
      const plugin = engine.getPlugin('avg_processing_hours');
      const results = plugin!.calculate({
        issues: [issue1, issue2],
        holidays: mockHolidays,
        period: mockPeriod
      });

      expect(results[0].value).toBe(5); // (4 + 6) / 2
    });
  });

  describe('sla_by_status with comment reset', () => {
    it('should reset SLA clock when assignee comments', () => {
      const statusEntry = new Date('2026-05-11T10:00:00');
      const commentTime = new Date('2026-05-11T14:00:00');
      const statusExit = new Date('2026-05-11T16:00:00');

      const issue = createMockIssue({
        assignee: 'Alice',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'Alice', occurredAt: statusEntry }
        ],
        comments: [
          { author: 'Alice', created: commentTime }
        ],
        resolved: statusExit
      });

      const plugin = engine.getPlugin('sla_by_status');
      const results = plugin!.calculate({
        issues: [issue],
        holidays: mockHolidays,
        period: mockPeriod,
        slaTargets: { 'In Progress': 4 }
      });

      // Without reset: 10:00 to 16:00 = 6h (Breach if target is 4)
      // With reset: 14:00 to 16:00 = 2h (Within SLA)
      expect(results[0].value).toBe(100); // 100% compliance
      expect(results[0].details?.find(d => d.label === 'Within SLA')?.value).toBe(1);
    });

    it('should NOT reset SLA clock when someone else comments', () => {
        const statusEntry = new Date('2026-05-11T10:00:00');
        const commentTime = new Date('2026-05-11T14:00:00');
        const statusExit = new Date('2026-05-11T16:00:00');
  
        const issue = createMockIssue({
          assignee: 'Alice',
          transitions: [
            { fromStatus: 'Open', toStatus: 'In Progress', author: 'Alice', occurredAt: statusEntry }
          ],
          comments: [
            { author: 'Bob', created: commentTime } // Bob is not the assignee
          ],
          resolved: statusExit
        });
  
        const plugin = engine.getPlugin('sla_by_status');
        const results = plugin!.calculate({
          issues: [issue],
          holidays: mockHolidays,
          period: mockPeriod,
          slaTargets: { 'In Progress': 4 }
        });
  
        // 10:00 to 16:00 = 6h (Breach if target is 4)
        expect(results[0].value).toBe(0); // 0% compliance
      });
  });

  describe('throughput', () => {
      it('should count created, resolved and open tickets correctly', () => {
          const issue1 = createMockIssue({
              created: new Date('2026-05-05T10:00:00'),
              resolved: new Date('2026-05-06T10:00:00'),
          });
          const issue2 = createMockIssue({
              key: 'PROJ-2',
              created: new Date('2026-05-05T10:00:00'),
              resolved: null, // Open
              status: 'In Progress',
              statusCategory: 'In Progress'
          });

          const plugin = engine.getPlugin('throughput');
          const results = plugin!.calculate({
              issues: [issue1, issue2],
              holidays: mockHolidays,
              period: mockPeriod
          });

          expect(results.find(r => r.name === 'Created Tickets')?.value).toBe(2);
          expect(results.find(r => r.name === 'Resolved Tickets')?.value).toBe(1);
          expect(results.find(r => r.name === 'Open Tickets')?.value).toBe(1);
      });
  });
});
