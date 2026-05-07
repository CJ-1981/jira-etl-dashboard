import { describe, it, expect, beforeEach } from 'vitest';
import { getKpiEngine } from '../engine';
import { GERMAN_STATES } from '../../holidays/german-holidays';

describe('Time-Series Plugins', () => {
  let engine: ReturnType<typeof getKpiEngine>;
  
  beforeEach(() => {
    engine = getKpiEngine();
  });
  
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

  it('should generate throughput trend data', () => {
    const issues = [
      {
        fields: {
          summary: 'Issue 1',
          created: '2026-05-05T10:00:00Z',
          resolutiondate: '2026-05-06T10:00:00Z',
          status: { name: 'Done', statusCategory: { name: 'Done' } }
        },
        key: 'PROJ-1',
        changelog: { histories: [] }
      },
      {
        fields: {
          summary: 'Issue 2',
          created: '2026-05-12T10:00:00Z',
          resolutiondate: '2026-05-13T10:00:00Z',
          status: { name: 'Done', statusCategory: { name: 'Done' } }
        },
        key: 'PROJ-2',
        changelog: { histories: [] }
      }
    ];

    const results = engine.calculate('throughput_trend', issues as any, mockHolidays, mockPeriod);
    
    expect(results[0].timeSeries).toBeDefined();
    expect(results[0].timeSeries?.length).toBeGreaterThan(0);
    
    // Check if we have values in different weeks
    const pointsWithValues = results[0].timeSeries?.filter(p => p.value > 0);
    expect(pointsWithValues?.length).toBe(2);
  });

  it('should generate cumulative flow data', () => {
    const issues = [
      {
        fields: {
          summary: 'Issue 1',
          created: '2026-05-01T10:00:00Z',
          status: { name: 'To Do', statusCategory: { name: 'To Do' } }
        },
        key: 'PROJ-1',
        changelog: {
          histories: [
            {
              created: '2026-05-10T10:00:00Z',
              items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }]
            }
          ]
        }
      }
    ];

    const results = engine.calculate('cumulative_flow_trend', issues as any, mockHolidays, mockPeriod);
    
    // Results for each status
    const toDoTrend = results.find(r => r.dimensions?.status === 'To Do');
    const inProgressTrend = results.find(r => r.dimensions?.status === 'In Progress');

    expect(toDoTrend).toBeDefined();
    expect(inProgressTrend).toBeDefined();

    // Check To Do count before transition
    const beforeTransition = toDoTrend?.timeSeries?.find(p => p.period.includes('2026-05-05')) || 
                             toDoTrend?.timeSeries?.find(p => p.period.includes('2026-05'));
    expect(beforeTransition?.value).toBe(1);

    // Check In Progress count after transition
    const afterTransition = inProgressTrend?.timeSeries?.find(p => p.period.includes('2026-05-15')) || 
                            inProgressTrend?.timeSeries?.find(p => p.period.includes('2026-05'));
    expect(afterTransition?.value).toBe(1);
  });
});
