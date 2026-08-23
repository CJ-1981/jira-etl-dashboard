import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { createMockStore, renderWithProviders } from '@/test/mock-store';
import { WidgetResizeContainer } from '../WidgetResizeContainer';

// WidgetResizeContainer reads widgetHeights/setWidgetHeights from the store.
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
}));

function setup(overrides: Record<string, unknown> = {}) {
  storeRef.current = createMockStore(overrides);
  return storeRef.current;
}

const getHandle = (container: HTMLElement) =>
  container.querySelector('[role="slider"]') as HTMLElement;

describe('WidgetResizeContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with the default height when nothing is saved', () => {
    setup();
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const inner = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(inner.style.height).toBe('300px');
  });

  it('restores a previously saved height from the store (persistence)', () => {
    setup({ widgetHeights: { w1: 450 } });
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const inner = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(inner.style.height).toBe('450px');
  });

  it('clamps saved heights into the allowed min/max range', () => {
    setup({ widgetHeights: { w1: 5000 } });
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const inner = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(inner.style.height).toBe('600px');
  });

  it('exposes slider semantics for accessibility', () => {
    setup();
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300} minHeight={200}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const handle = getHandle(container);
    expect(handle).toBeTruthy();
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-valuemax')).toBe('600');
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  it('resizes with arrow keys and persists the new height', () => {
    const store = setup();
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const handle = getHandle(container);

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(handle.getAttribute('aria-valuenow')).toBe('280');
    expect(store.widgetHeights.w1).toBe(280);

    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(handle.getAttribute('aria-valuenow')).toBe('320');
    expect(store.widgetHeights.w1).toBe(320);
  });

  it('uses a larger step with Shift and clamps at the bounds', () => {
    const store = setup();
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300} minHeight={250}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const handle = getHandle(container);

    // Shift+ArrowUp jumps by 100
    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(store.widgetHeights.w1).toBe(400);

    // Home snaps to min
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(store.widgetHeights.w1).toBe(250);

    // End snaps to max
    fireEvent.keyDown(handle, { key: 'End' });
    expect(store.widgetHeights.w1).toBe(600);

    // ArrowDown from max with Shift clamps to 500, not below
    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });
    expect(store.widgetHeights.w1).toBe(500);
  });

  it('ignores unrelated keys', () => {
    const store = setup();
    const { container } = renderWithProviders(
      <WidgetResizeContainer widgetId="w1" defaultHeight={300}>
        <div>content</div>
      </WidgetResizeContainer>
    );
    const handle = getHandle(container);
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
    expect(store.widgetHeights.w1).toBeUndefined();
  });
});
