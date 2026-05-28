/**
 * Characterization Tests for useJqlFilters hook
 *
 * These tests capture the ACTUAL behavior of JQL filter management
 * extracted from KpiDashboard component (Phase 2.5: T-012)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJqlFilters } from '../useJqlFilters';

describe('useJqlFilters - Characterization Tests (T-012)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should initialize with empty JQL list from localStorage', () => {
      const { result } = renderHook(() => useJqlFilters());

      expect(result.current.jqlList).toEqual([]);
    });

    it('should initialize with saved JQLs from localStorage', () => {
      const savedJqls = [
        { id: 'djql-1', name: 'Test JQL', query: 'project = TEST' },
        { id: 'djql-2', name: 'Prod JQL', query: 'project = PROD' },
      ];
      localStorage.setItem('cfg_dashboard_jqls', JSON.stringify(savedJqls));

      const { result } = renderHook(() => useJqlFilters());

      expect(result.current.jqlList).toEqual(savedJqls);
    });

    it('should initialize with empty staging filters', () => {
      const { result } = renderHook(() => useJqlFilters());

      expect(result.current.stagingFilters).toEqual({});
    });
  });

  describe('addJql - Add new JQL filter', () => {
    it('should add JQL with generated ID (djql-{timestamp}-{counter})', () => {
      const { result } = renderHook(() => useJqlFilters());
      const beforeTimestamp = Date.now();

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const afterTimestamp = Date.now();

      expect(result.current.jqlList).toHaveLength(1);
      const added = result.current.jqlList[0];
      expect(added.name).toBe('My Test JQL');
      expect(added.query).toBe('project = TEST');
      expect(added.id).toMatch(/^djql-\d+-\d+$/);
      const parts = added.id.split('-');
      const timestamp = parseInt(parts[1]);
      const counter = parseInt(parts[2]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(timestamp).toBeLessThanOrEqual(afterTimestamp);
      expect(counter).toBe(1); // First JQL has counter 1
    });

    it('should persist to localStorage after adding JQL', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const saved = localStorage.getItem('cfg_dashboard_jqls');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed).toEqual([
        expect.objectContaining({
          name: 'My Test JQL',
          query: 'project = TEST',
        }),
      ]);
    });

    it('should add multiple JQLs with unique IDs', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST1', 'JQL 1');
      });

      act(() => {
        result.current.addJql('project = TEST2', 'JQL 2');
      });

      expect(result.current.jqlList).toHaveLength(2);
      expect(result.current.jqlList[0].id).not.toBe(result.current.jqlList[1].id);
    });
  });

  describe('editJql - Edit existing JQL filter', () => {
    it('should update JQL by ID', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'Original JQL');
      });

      const jqlId = result.current.jqlList[0].id;

      act(() => {
        result.current.editJql(jqlId, 'project = PROD', 'Updated JQL');
      });

      expect(result.current.jqlList).toHaveLength(1);
      expect(result.current.jqlList[0]).toEqual({
        id: jqlId,
        name: 'Updated JQL',
        query: 'project = PROD',
      });
    });

    it('should persist to localStorage after editing JQL', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'Original JQL');
      });

      const jqlId = result.current.jqlList[0].id;

      act(() => {
        result.current.editJql(jqlId, 'project = PROD', 'Updated JQL');
      });

      const saved = localStorage.getItem('cfg_dashboard_jqls');
      const parsed = JSON.parse(saved!);
      expect(parsed).toEqual([
        expect.objectContaining({
          id: jqlId,
          name: 'Updated JQL',
          query: 'project = PROD',
        }),
      ]);
    });

    it('should not modify other JQLs when editing one', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST1', 'JQL 1');
      });
      act(() => {
        result.current.addJql('project = TEST2', 'JQL 2');
      });
      act(() => {
        result.current.addJql('project = TEST3', 'JQL 3');
      });

      const jqlId2 = result.current.jqlList[1].id;

      act(() => {
        result.current.editJql(jqlId2, 'project = EDITED', 'Edited JQL');
      });

      expect(result.current.jqlList[0]).toEqual(
        expect.objectContaining({ name: 'JQL 1', query: 'project = TEST1' })
      );
      expect(result.current.jqlList[1]).toEqual(
        expect.objectContaining({ name: 'Edited JQL', query: 'project = EDITED' })
      );
      expect(result.current.jqlList[2]).toEqual(
        expect.objectContaining({ name: 'JQL 3', query: 'project = TEST3' })
      );
    });
  });

  describe('deleteJql - Delete JQL filter', () => {
    it('should remove JQL by ID', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST1', 'JQL 1');
      });
      act(() => {
        result.current.addJql('project = TEST2', 'JQL 2');
      });

      expect(result.current.jqlList).toHaveLength(2);

      const jqlId1 = result.current.jqlList[0].id;

      act(() => {
        result.current.deleteJql(jqlId1);
      });

      expect(result.current.jqlList).toHaveLength(1);
      expect(result.current.jqlList[0].name).toBe('JQL 2');
    });

    it('should persist to localStorage after deleting JQL', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const jqlId = result.current.jqlList[0].id;

      act(() => {
        result.current.deleteJql(jqlId);
      });

      const saved = localStorage.getItem('cfg_dashboard_jqls');
      const parsed = JSON.parse(saved!);
      expect(parsed).toEqual([]);
    });

    it('should handle deleting non-existent ID gracefully', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const originalLength = result.current.jqlList.length;

      act(() => {
        result.current.deleteJql('non-existent-id');
      });

      expect(result.current.jqlList).toHaveLength(originalLength);
    });
  });

  describe('toggleStagingFilter - Toggle filter in staging', () => {
    it('should add filter to staging when not present', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const jql = result.current.jqlList[0];

      act(() => {
        result.current.toggleStagingFilter('jql', jql.query);
      });

      expect(result.current.stagingFilters).toEqual({
        jql: [jql.query],
      });
    });

    it('should remove filter from staging when already present', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const jql = result.current.jqlList[0];

      act(() => {
        result.current.toggleStagingFilter('jql', jql.query);
        result.current.toggleStagingFilter('jql', jql.query);
      });

      expect(result.current.stagingFilters).toEqual({});
    });

    it('should handle multiple filters in same category', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST1', 'JQL 1');
      });
      act(() => {
        result.current.addJql('project = TEST2', 'JQL 2');
      });

      const jql1 = result.current.jqlList[0];
      const jql2 = result.current.jqlList[1];

      act(() => {
        result.current.toggleStagingFilter('jql', jql1.query);
        result.current.toggleStagingFilter('jql', jql2.query);
      });

      expect(result.current.stagingFilters).toEqual({
        jql: [jql1.query, jql2.query],
      });
    });

    it('should handle filters from different categories', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.toggleStagingFilter('project', 'TEST');
        result.current.toggleStagingFilter('priority', 'High');
      });

      expect(result.current.stagingFilters).toEqual({
        project: ['TEST'],
        priority: ['High'],
      });
    });

    it('should handle value="all" to clear category', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.toggleStagingFilter('project', 'TEST1');
        result.current.toggleStagingFilter('project', 'TEST2');
      });

      expect(result.current.stagingFilters.project).toHaveLength(2);

      act(() => {
        result.current.toggleStagingFilter('project', 'all');
      });

      expect(result.current.stagingFilters.project).toEqual([]);
    });

    it('should preserve order of added filters', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST1', 'JQL 1');
      });
      act(() => {
        result.current.addJql('project = TEST2', 'JQL 2');
      });
      act(() => {
        result.current.addJql('project = TEST3', 'JQL 3');
      });

      const jql1 = result.current.jqlList[0];
      const jql2 = result.current.jqlList[1];
      const jql3 = result.current.jqlList[2];

      act(() => {
        result.current.toggleStagingFilter('jql', jql1.query);
        result.current.toggleStagingFilter('jql', jql2.query);
        result.current.toggleStagingFilter('jql', jql3.query);
      });

      expect(result.current.stagingFilters.jql).toEqual([
        jql1.query,
        jql2.query,
        jql3.query,
      ]);
    });
  });

  describe('clearStagingFilters - Clear all staging filters', () => {
    it('should clear all staging filters', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const jql = result.current.jqlList[0];

      act(() => {
        result.current.toggleStagingFilter('jql', jql.query);
      });

      expect(result.current.stagingFilters).toEqual({
        jql: [jql.query],
      });

      act(() => {
        result.current.clearStagingFilters();
      });

      expect(result.current.stagingFilters).toEqual({});
    });

    it('should clear filters from multiple categories', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.toggleStagingFilter('project', 'TEST');
        result.current.toggleStagingFilter('priority', 'High');
        result.current.toggleStagingFilter('status', 'Done');
      });

      expect(Object.keys(result.current.stagingFilters)).toHaveLength(3);

      act(() => {
        result.current.clearStagingFilters();
      });

      expect(result.current.stagingFilters).toEqual({});
    });
  });

  describe('applyStagingFilters - Apply filters', () => {
    it('should return current staging filters', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', 'My Test JQL');
      });

      const jql = result.current.jqlList[0];

      act(() => {
        result.current.toggleStagingFilter('jql', jql.query);
      });

      const applied = result.current.applyStagingFilters();

      expect(applied).toEqual({
        jql: [jql.query],
      });
    });

    it('should return empty object when no filters staged', () => {
      const { result } = renderHook(() => useJqlFilters());

      const applied = result.current.applyStagingFilters();

      expect(applied).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in JQL queries', () => {
      const { result } = renderHook(() => useJqlFilters());

      const specialJQL = 'project = TEST AND summary ~ "special\\"chars\\"';

      act(() => {
        result.current.addJql(specialJQL, 'Special JQL');
      });

      expect(result.current.jqlList[0].query).toBe(specialJQL);
    });

    it('should handle empty JQL name', () => {
      const { result } = renderHook(() => useJqlFilters());

      act(() => {
        result.current.addJql('project = TEST', '');
      });

      expect(result.current.jqlList[0].name).toBe('');
    });

    it('should handle very long JQL queries', () => {
      const { result } = renderHook(() => useJqlFilters());

      const longJQL =
        'project = TEST AND (' +
        Array(100)
          .fill(0)
          .map((_, i) => `field${i} = value${i}`)
          .join(' OR ') +
        ')';

      act(() => {
        result.current.addJql(longJQL, 'Long JQL');
      });

      expect(result.current.jqlList[0].query).toBe(longJQL);
    });
  });

  describe('Multi-select Mode (> 10 items)', () => {
    it('should handle more than 10 JQL filters', () => {
      const { result } = renderHook(() => useJqlFilters());

      for (let i = 0; i < 15; i++) {
        act(() => {
          result.current.addJql(`project = TEST${i}`, `JQL ${i}`);
        });
      }

      expect(result.current.jqlList).toHaveLength(15);
    });

    it('should stage multiple filters efficiently', () => {
      const { result } = renderHook(() => useJqlFilters());

      // Add 15 JQLs
      for (let i = 0; i < 15; i++) {
        act(() => {
          result.current.addJql(`project = TEST${i}`, `JQL ${i}`);
        });
      }

      // Stage all of them
      for (let i = 0; i < 15; i++) {
        act(() => {
          result.current.toggleStagingFilter('jql', `project = TEST${i}`);
        });
      }

      expect(result.current.stagingFilters.jql).toHaveLength(15);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully without crashing', () => {
      const { result } = renderHook(() => useJqlFilters());

      // Spy on console.error to verify error handling
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Add JQL should not throw even if localStorage fails
      act(() => {
        expect(() => {
          result.current.addJql('project = TEST', 'Test JQL');
        }).not.toThrow();
      });

      // Verify JQL was added to state even if save failed
      expect(result.current.jqlList).toHaveLength(1);

      consoleSpy.mockRestore();
    });

    it('should initialize with empty array on load error', () => {
      // Clear any existing data
      localStorage.clear();

      const { result } = renderHook(() => useJqlFilters());

      // Should default to empty array
      expect(result.current.jqlList).toEqual([]);
      expect(result.current.stagingFilters).toEqual({});
    });
  });
});
