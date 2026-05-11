/**
 * Tests for useJqlFilters hook
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJqlFilters } from '../useJqlFilters';

// TODO: Write tests for useJqlFilters hook (Phase 2.5)
describe('useJqlFilters', () => {
  const mockStorageKey = 'test-jql-filters';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty JQL list', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    expect(result.current.jqlList).toEqual([]);
    expect(result.current.stagingFilters).toEqual([]);
  });

  it('should add new JQL filter', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      result.current.addJql('project = TEST', 'My Test JQL');
    });

    expect(result.current.jqlList).toHaveLength(1);
    expect(result.current.jqlList[0].name).toBe('My Test JQL');
    expect(result.current.jqlList[0].jql).toBe('project = TEST');
  });

  it('should edit existing JQL filter', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      result.current.addJql('project = TEST', 'My Test JQL');
    });

    const jqlId = result.current.jqlList[0].id;

    act(() => {
      result.current.editJql(jqlId, 'project = PROD', 'Updated JQL');
    });

    expect(result.current.jqlList[0].jql).toBe('project = PROD');
    expect(result.current.jqlList[0].name).toBe('Updated JQL');
  });

  it('should delete JQL filter', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      result.current.addJql('project = TEST', 'My Test JQL');
    });

    expect(result.current.jqlList).toHaveLength(1);

    const jqlId = result.current.jqlList[0].id;

    act(() => {
      result.current.deleteJql(jqlId);
    });

    expect(result.current.jqlList).toHaveLength(0);
  });

  it('should manage staging filters', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      result.current.addJql('project = TEST1', 'JQL 1');
      result.current.addJql('project = TEST2', 'JQL 2');
    });

    const jqlId1 = result.current.jqlList[0].id;
    const jqlId2 = result.current.jqlList[1].id;

    act(() => {
      result.current.toggleStagingFilter(jqlId1);
      result.current.toggleStagingFilter(jqlId2);
    });

    expect(result.current.stagingFilters).toEqual([jqlId1, jqlId2]);

    act(() => {
      result.current.toggleStagingFilter(jqlId1);
    });

    expect(result.current.stagingFilters).toEqual([jqlId2]);
  });

  it('should clear staging filters', () => {
    const { result } = renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      result.current.addJql('project = TEST', 'My Test JQL');
    });

    const jqlId = result.current.jqlList[0].id;

    act(() => {
      result.current.toggleStagingFilter(jqlId);
    });

    expect(result.current.stagingFilters).toHaveLength(1);

    act(() => {
      result.current.clearStagingFilters();
    });

    expect(result.current.stagingFilters).toHaveLength(0);
  });

  it('should persist to local storage', () => {
    renderHook(() => useJqlFilters(mockStorageKey));

    act(() => {
      // Add a JQL through the hook
      // Note: This would require the actual hook implementation
    });

    const saved = localStorage.getItem(mockStorageKey);
    // Verify persistence
    expect(saved).toBeTruthy();
  });
});
