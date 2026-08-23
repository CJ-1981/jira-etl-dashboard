/**
 * usePersistedList Hook Tests
 *
 * Unit tests for the generic localStorage-backed list hook that backs
 * useWidgetOrder and usePluginVisibility. Covers:
 * - Initialization from localStorage (fallback, transform, validation)
 * - Reordering and membership toggling
 * - Persistence on change
 * - Cross-instance synchronization via storage + custom events
 * - Echo-write suppression and self-write guarding
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedList, type UsePersistedListOptions } from '../usePersistedList';

const KEY = 'test-persisted-list';
const CHANGE_EVENT = 'test-persisted-list-change';

function render(options: Partial<UsePersistedListOptions<string>> = {}, key = KEY) {
  const opts: UsePersistedListOptions<string> = { fallback: [], ...options };
  return renderHook(() => usePersistedList<string>(key, opts));
}

describe('usePersistedList - Initialization', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('falls back when nothing is stored', () => {
    const { result } = render({ fallback: ['a', 'b'] });
    expect(result.current.list).toEqual(['a', 'b']);
  });

  it('loads a stored list', () => {
    localStorage.setItem(KEY, JSON.stringify(['x', 'y']));
    const { result } = render();
    expect(result.current.list).toEqual(['x', 'y']);
  });

  it('applies the onLoad transform to stored data', () => {
    localStorage.setItem(KEY, JSON.stringify(['keep', 'panel-drop', 'keep2']));
    const { result } = render({ onLoad: items => items.filter(i => !i.startsWith('panel-')) });
    expect(result.current.list).toEqual(['keep', 'keep2']);
  });

  it('falls back when isValid rejects the stored value', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }));
    const { result } = render({
      fallback: ['default'],
      isValid: parsed => Array.isArray(parsed),
    });
    expect(result.current.list).toEqual(['default']);
    consoleErrorSpy.mockRestore();
  });

  it('falls back and logs when stored JSON is corrupt', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(KEY, '{not-valid-json');
    const { result } = render({ fallback: ['fb'] });
    expect(result.current.list).toEqual(['fb']);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('usePersistedList - Reorder and Toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(['a', 'b', 'c']));
  });
  afterEach(() => vi.restoreAllMocks());

  it('reorders by moving an item to a new index', () => {
    const { result } = render();
    act(() => result.current.reorder(0, 2));
    expect(result.current.list).toEqual(['b', 'c', 'a']);
  });

  it('persists the reordered list', () => {
    const { result } = render();
    act(() => result.current.reorder(0, 2));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['b', 'c', 'a']);
  });

  it('toggle removes a present item', () => {
    const { result } = render();
    act(() => result.current.toggle('b'));
    expect(result.current.list).toEqual(['a', 'c']);
  });

  it('toggle adds an absent item', () => {
    const { result } = render();
    act(() => result.current.toggle('d'));
    expect(result.current.list).toEqual(['a', 'b', 'c', 'd']);
  });

  it('setList supports arbitrary updates', () => {
    const { result } = render();
    act(() => result.current.setList(prev => [...prev, 'z']));
    expect(result.current.list).toEqual(['a', 'b', 'c', 'z']);
  });
});

describe('usePersistedList - Cross-Instance Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(KEY, JSON.stringify(['a', 'b', 'c']));
  });
  afterEach(() => vi.restoreAllMocks());

  it('adopts changes from cross-tab storage events', () => {
    const { result } = render();
    localStorage.setItem(KEY, JSON.stringify(['z']));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    expect(result.current.list).toEqual(['z']);
  });

  it('ignores storage events for other keys', () => {
    const { result } = render();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' }));
    });
    expect(result.current.list).toEqual(['a', 'b', 'c']);
  });

  it('syncs from a same-tab custom change event', () => {
    const { result } = render({ changeEvent: CHANGE_EVENT });
    localStorage.setItem(KEY, JSON.stringify(['q']));
    act(() => {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    });
    expect(result.current.list).toEqual(['q']);
  });

  it('does not echo-write when adopting a synced value (suppressSyncEcho)', () => {
    const { result } = render({ changeEvent: CHANGE_EVENT, suppressSyncEcho: true });
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');

    localStorage.setItem(KEY, JSON.stringify(['external']));
    const callsAfterExternalWrite = setItemSpy.mock.calls.length;

    act(() => {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    });

    expect(result.current.list).toEqual(['external']);
    // Adopting the synced value must not trigger another persist
    expect(setItemSpy.mock.calls.length).toBe(callsAfterExternalWrite);
  });

  it('persists user changes after a sync (isSyncing does not stick)', () => {
    const { result } = render({ changeEvent: CHANGE_EVENT, suppressSyncEcho: true });

    localStorage.setItem(KEY, JSON.stringify(['external']));
    act(() => {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    });
    expect(result.current.list).toEqual(['external']);

    act(() => result.current.toggle('added'));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['external', 'added']);
  });
});

describe('usePersistedList - syncOnMount / resetOnMissingKey', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('re-reads storage on mount when syncOnMount is set', () => {
    localStorage.setItem(KEY, JSON.stringify(['synced']));
    const { result } = render({ syncOnMount: true, fallback: ['fb'] });
    expect(result.current.list).toEqual(['synced']);
  });

  it('resets to fallback when the key is missing and resetOnMissingKey is set', () => {
    const { result } = render({ syncOnMount: true, resetOnMissingKey: true, fallback: ['fb'] });
    // Nothing stored -> syncOnMount reads null -> resets to fallback
    expect(result.current.list).toEqual(['fb']);
  });

  it('keeps current state when the key is missing and resetOnMissingKey is not set', () => {
    localStorage.setItem(KEY, JSON.stringify(['present']));
    const { result } = render({ fallback: ['fb'] });
    expect(result.current.list).toEqual(['present']);
    // Remove the key externally and notify via a storage event
    localStorage.removeItem(KEY);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    // Without resetOnMissingKey the hook keeps its current value
    expect(result.current.list).toEqual(['present']);
  });
});
