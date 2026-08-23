'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';

// @MX:NOTE Resizable container that persists height adjustments to Zustand store
// @MX:ANCHOR WidgetResizeContainer is the integration point for resize persistence across view switches
// @MX:WARN Edge cases: max/min height clamping (200-600px), pointer capture/release on drag
// @MX:NOTE Drag handle is keyboard-operable (role="slider") and persistence is covered by tests

interface WidgetResizeContainerProps {
  widgetId: string;
  defaultHeight: number;
  minHeight?: number;
  className?: string;
  children: React.ReactNode;
}

const MAX_HEIGHT = 600;
const KEYBOARD_STEP = 20;
const KEYBOARD_LARGE_STEP = 100;

export function WidgetResizeContainer({
  widgetId,
  defaultHeight,
  minHeight = 200,
  className,
  children,
}: WidgetResizeContainerProps) {
  const widgetHeights = useAppStore((s) => s.widgetHeights);
  const setWidgetHeights = useAppStore((s) => s.setWidgetHeights);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const savedHeight = widgetHeights[widgetId];
  const [localHeight, setLocalHeight] = useState(() =>
    Math.min(MAX_HEIGHT, Math.max(minHeight, savedHeight ?? defaultHeight))
  );

  // Sync with saved height on mount and when savedHeight changes
  useEffect(() => {
    if (isDragging.current) return;
    if (savedHeight !== undefined && savedHeight !== localHeight) {
      setLocalHeight(Math.min(MAX_HEIGHT, Math.max(minHeight, savedHeight)));
    }
  }, [savedHeight, minHeight, localHeight]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = localHeight;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [localHeight]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientY - startY.current;
    const next = Math.min(MAX_HEIGHT, Math.max(minHeight, startH.current + delta));
    setLocalHeight(next);
  }, [minHeight]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const finalHeight = Math.min(MAX_HEIGHT, Math.max(minHeight, localHeight));
    setWidgetHeights((prev) => ({ ...prev, [widgetId]: finalHeight }));
    // Immediately update local state to ensure consistency
    setLocalHeight(finalHeight);
  }, [widgetId, localHeight, minHeight, setWidgetHeights]);

  // @MX:NOTE Keyboard resize support for accessibility (role="slider" pattern)
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = localHeight + step;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        next = localHeight - step;
        break;
      case 'Home':
        next = minHeight;
        break;
      case 'End':
        next = MAX_HEIGHT;
        break;
      default:
        return;
    }
    e.preventDefault();
    const clamped = Math.min(MAX_HEIGHT, Math.max(minHeight, next));
    setLocalHeight(clamped);
    setWidgetHeights((prev) => ({ ...prev, [widgetId]: clamped }));
  }, [widgetId, localHeight, minHeight, setWidgetHeights]);

  return (
    <div>
      <div
        className={className || ''}
        style={{ height: localHeight, minHeight, overflowX: 'hidden' }}
      >
        {children}
      </div>
      {/* Drag handle (pointer + keyboard operable) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={`Resize ${widgetId} height`}
        aria-orientation="vertical"
        aria-valuemin={minHeight}
        aria-valuemax={MAX_HEIGHT}
        aria-valuenow={localHeight}
        className="flex items-center justify-center h-5 cursor-row-resize group/handle focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
      >
        <div className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover/handle:bg-blue-400 dark:group-hover/handle:bg-blue-500 transition-colors" />
      </div>
    </div>
  );
}
