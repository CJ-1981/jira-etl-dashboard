/**
 * useGlobalShortcuts Tests
 *
 * Unit tests for the shared keyboard-shortcut guard predicate and the hook's
 * dispatch semantics (typing guard, interactive-element guard, modifier
 * handling).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useGlobalShortcuts,
  isInteractiveShortcutTarget,
} from '../useGlobalShortcuts';

describe('isInteractiveShortcutTarget (guard predicate)', () => {
  it('returns false for null (no target)', () => {
    expect(isInteractiveShortcutTarget(null)).toBe(false);
  });

  it('returns false for document.body', () => {
    expect(isInteractiveShortcutTarget(document.body)).toBe(false);
  });

  it('returns false for a plain container element', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(isInteractiveShortcutTarget(div)).toBe(false);
    div.remove();
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'])(
    'returns true for %s elements',
    tagName => {
      const el = document.createElement(tagName);
      document.body.appendChild(el);
      expect(isInteractiveShortcutTarget(el)).toBe(true);
      el.remove();
    }
  );

  it('returns true for contentEditable elements', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // jsdom does not compute isContentEditable, so stub it directly
    Object.defineProperty(el, 'isContentEditable', { value: true, configurable: true });
    expect(isInteractiveShortcutTarget(el)).toBe(true);
    el.remove();
  });
});

function fireKey(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalShortcuts - dispatch semantics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => vi.restoreAllMocks());

  it('fires a bare binding when focus is on the body', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({ bareBindings: [{ key: '1', onTrigger }] })
    );

    fireKey(document.body, '1');
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not fire a bare binding while typing in an input', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({ bareBindings: [{ key: '1', onTrigger }] })
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey(input, '1');
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not fire a bare binding when a button is focused', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({ bareBindings: [{ key: '1', onTrigger }] })
    );

    const button = document.createElement('button');
    document.body.appendChild(button);
    fireKey(button, '1');
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('does not fire a bare binding when a modifier key is held', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({ bareBindings: [{ key: 'r', caseInsensitive: true, onTrigger }] })
    );

    fireKey(document.body, 'r', { ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('fires a modifier binding even when a button is focused', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({
        modifierBindings: [{ key: 'p', modifierKeys: ['ctrl', 'meta'], onTrigger }],
      })
    );

    const button = document.createElement('button');
    document.body.appendChild(button);
    fireKey(button, 'p', { ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not fire a modifier binding while typing in an input', () => {
    const onTrigger = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({
        modifierBindings: [{ key: 'p', modifierKeys: ['ctrl', 'meta'], onTrigger }],
      })
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey(input, 'p', { ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('blurs an input on Escape when blurInputOnEscape is set', () => {
    renderHook(() => useGlobalShortcuts({ blurInputOnEscape: true }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const blurSpy = vi.spyOn(input, 'blur');

    fireKey(input, 'Escape');
    expect(blurSpy).toHaveBeenCalled();
  });

  it('respects case-insensitive matching only when flagged', () => {
    const caseInsensitive = vi.fn();
    const exact = vi.fn();
    renderHook(() =>
      useGlobalShortcuts({
        bareBindings: [
          { key: 'r', caseInsensitive: true, onTrigger: caseInsensitive },
          { key: 'p', onTrigger: exact },
        ],
      })
    );

    fireKey(document.body, 'R');
    expect(caseInsensitive).toHaveBeenCalledTimes(1);
    expect(exact).not.toHaveBeenCalled();

    fireKey(document.body, 'P');
    // 'p' binding is exact-match, so uppercase 'P' must not trigger it
    expect(exact).not.toHaveBeenCalled();
  });
});
