/**
 * useGlobalShortcuts Hook
 *
 * Centralizes the global keyboard-shortcut mechanics that were duplicated
 * between src/app/page.tsx and KpiDashboard:
 *
 * - A typing guard that ignores events originating from inputs/textareas
 * - An interactive-element guard so bare-key shortcuts never hijack events
 *   from selects, buttons, links, or contentEditable regions
 * - Registration/cleanup of the window keydown listener
 *
 * The pure guard predicate is exported separately so it can be unit tested
 * without rendering a component.
 */

import { useEffect, useRef } from 'react';

export interface GlobalShortcutContext {
  /** The keyboard event being dispatched. */
  event: KeyboardEvent;
  /** The event target cast to an element (may be null). */
  target: HTMLElement | null;
}

export interface GlobalShortcutBinding {
  /**
   * Optional modifier-key combinations that must be held for this binding
   * (e.g. Ctrl+P). Bindings with modifiers are matched before the
   * interactive-element guard so they work regardless of focus (except while
   * typing in an input/textarea, which blocks everything).
   */
  modifierKeys?: Array<'ctrl' | 'meta' | 'alt'>;
  /** The key to match against `event.key`. */
  key: string;
  /**
   * When true the key comparison ignores case (e.g. matches both 'r' and 'R').
   * Defaults to an exact comparison.
   */
  caseInsensitive?: boolean;
  /** Invoked when the binding matches. */
  onTrigger: (ctx: GlobalShortcutContext) => void;
}

export interface UseGlobalShortcutsOptions {
  /** Bindings requiring Ctrl/Meta/Alt. Matched before the interactive guard. */
  modifierBindings?: GlobalShortcutBinding[];
  /** Bare-key bindings (no modifiers). Blocked by the interactive guard. */
  bareBindings?: GlobalShortcutBinding[];
  /**
   * When true, pressing Escape while focused on an input or textarea blurs it
   * (the event is still consumed by the typing guard afterwards).
   */
  blurInputOnEscape?: boolean;
  /** Whether the listener is attached. Defaults to true. */
  enabled?: boolean;
}

/**
 * Returns true when the given element is one from which bare-key shortcuts
 * must not hijack events: form controls, links, and contentEditable regions.
 * `document.body` (and null) are considered safe targets for shortcuts.
 */
export function isInteractiveShortcutTarget(target: HTMLElement | null): boolean {
  if (!target || target === document.body) return false;
  const tagName = target.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON' ||
    tagName === 'A' ||
    target.isContentEditable === true
  );
}

function matchesKey(event: KeyboardEvent, binding: GlobalShortcutBinding): boolean {
  return binding.caseInsensitive
    ? event.key.toLowerCase() === binding.key.toLowerCase()
    : event.key === binding.key;
}

function matchesModifiers(
  event: KeyboardEvent,
  modifierKeys: Array<'ctrl' | 'meta' | 'alt'> | undefined
): boolean {
  const needsCtrl = modifierKeys?.includes('ctrl') ?? false;
  const needsMeta = modifierKeys?.includes('meta') ?? false;
  const needsAlt = modifierKeys?.includes('alt') ?? false;
  // The binding fires when any of the requested modifier families is held.
  const requestedHeld =
    (needsCtrl && event.ctrlKey) ||
    (needsMeta && event.metaKey) ||
    (needsAlt && event.altKey);
  return requestedHeld;
}

/**
 * Registers a window keydown listener implementing the shared guard semantics.
 * The latest options are read from a ref, so callers may pass inline arrays
 * without causing the listener to be re-registered on every render.
 */
export function useGlobalShortcuts(options: UseGlobalShortcutsOptions): void {
  const { enabled = true } = options;

  // Always dispatch through the most recent options/handlers.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const { modifierBindings, bareBindings, blurInputOnEscape } = optionsRef.current;
      const target = e.target as HTMLElement | null;

      // Don't trigger if user is typing in an input — optionally blur on Escape
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        if (blurInputOnEscape && e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      // Modifier bindings fire regardless of focus (except while typing above)
      if (modifierBindings) {
        for (const binding of modifierBindings) {
          if (matchesKey(e, binding) && matchesModifiers(e, binding.modifierKeys)) {
            e.preventDefault();
            binding.onTrigger({ event: e, target });
            return;
          }
        }
      }

      // @MX:NOTE: Tightened guard — bare-key shortcuts must not hijack events from
      // interactive elements (selects, buttons, links, contentEditable, Radix triggers).
      // Only fire when the event target is document.body or a plain non-interactive element.
      if (isInteractiveShortcutTarget(target)) return;

      // No modifier keys for bare shortcuts (avoids eating Ctrl+R browser reload etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (bareBindings) {
        for (const binding of bareBindings) {
          if (matchesKey(e, binding)) {
            binding.onTrigger({ event: e, target });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
