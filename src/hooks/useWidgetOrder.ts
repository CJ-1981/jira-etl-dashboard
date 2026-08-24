/**
 * useWidgetOrder Hook
 *
 * Manages the display order of widgets (individual KPIs and panel sections) on the dashboard.
 *
 * Thin wrapper around the generic usePersistedList hook, which implements the
 * shared localStorage persistence / cross-instance synchronization mechanics.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { widgetOrder, reorderWidget, toggleWidgetVisibility } = useWidgetOrder();
 *   return <div>{widgetOrder.map(id => <Widget key={id} id={id} />)}</div>;
 * }
 * ```
 */

import { useCallback, useMemo } from 'react';
import { KEYS } from '@/lib/config/local-store';
import { usePersistedList } from './usePersistedList';

// @MX:NOTE: Custom event for same-tab synchronization
// @MX:REASON: Storage events only fire across tabs, not within the same tab
const WIDGET_ORDER_CHANGE_EVENT = 'widget-order-change';

export interface UseWidgetOrderResult {
  widgetOrder: string[];
  reorderWidget: (sourceIndex: number, destIndex: number) => void;
  toggleWidgetVisibility: (widgetId: string) => void;
  initializeWidgetOrder: (availableKpis: string[], excludeFilter?: (id: string) => boolean) => void;
}

// Panel section ids are managed separately and must never leak into widget order
const stripPanelIds = (ids: string[]) => ids.filter(id => !id.startsWith('panel-'));

// @MX:NOTE: Main hook implementation for widget display order management
// @MX:REASON: Centralizes widget ordering logic for both KPIs and panel sections
export function useWidgetOrder(): UseWidgetOrderResult {
  // Stable options object so the generic hook's effects don't re-subscribe on
  // every render of the wrapper.
  const options = useMemo(
    () => ({
      fallback: [] as string[],
      onLoad: stripPanelIds,
      changeEvent: WIDGET_ORDER_CHANGE_EVENT,
      // Another instance in this tab announces writes via the custom event;
      // adopting them must not trigger an echo write back to storage.
      suppressSyncEcho: true,
    }),
    []
  );

  const { list, setList, reorder, toggle } = usePersistedList<string>(
    KEYS.widgetOrder,
    options
  );

  const initializeWidgetOrder = useCallback((availableKpis: string[], excludeFilter?: (id: string) => boolean) => {
    setList(prev => {
      const widgetKpis = excludeFilter ? availableKpis.filter(id => !excludeFilter(id)) : availableKpis;
      const existingKpis = prev.filter(id => !excludeFilter || !excludeFilter(id));
      const newKpis = widgetKpis.filter(id => !existingKpis.includes(id));
      return [...newKpis, ...existingKpis];
    });
  }, [setList]);

  return {
    widgetOrder: list,
    reorderWidget: reorder,
    toggleWidgetVisibility: toggle,
    initializeWidgetOrder,
  };
}
