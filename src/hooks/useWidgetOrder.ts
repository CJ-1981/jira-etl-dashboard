/**
 * useWidgetOrder Hook
 *
 * Manages the display order of widgets (individual KPIs and panel sections) on the dashboard.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { widgetOrder, reorderWidget, toggleWidgetVisibility } = useWidgetOrder();
 *   return <div>{widgetOrder.map(id => <Widget key={id} id={id} />)}</div>;
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// @MX:NOTE: Custom event for same-tab synchronization
// @MX:REASON: Storage events only fire across tabs, not within the same tab
const WIDGET_ORDER_CHANGE_EVENT = 'widget-order-change';

// Widget type definitions
export type WidgetType = 'kpi' | 'panel';

export interface WidgetDefinition {
  id: string;
  type: WidgetType;
  name: string;
  category?: string;
  icon?: string;
}

export interface UseWidgetOrderResult {
  widgetOrder: string[];
  reorderWidget: (sourceIndex: number, destIndex: number) => void;
  toggleWidgetVisibility: (widgetId: string) => void;
  isWidgetVisible: (widgetId: string) => boolean;
  getWidgetDefinitions: () => WidgetDefinition[];
  initializeWidgetOrder: (availableKpis: string[], excludeFilter?: (id: string) => boolean) => void;
}

// @MX:NOTE: Main hook implementation for widget display order management
// @MX:REASON: Centralizes widget ordering logic for both KPIs and panel sections
export function useWidgetOrder(): UseWidgetOrderResult {
  const STORAGE_KEY = 'widget_display_order';

  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter((id: string) => !id.startsWith('panel-'));
      }
      return [];
    } catch (error) {
      console.error(`Failed to load ${STORAGE_KEY} from localStorage:`, error);
      return [];
    }
  });

  const isSelfWriting = useRef(false);
  const isSyncing = useRef(false);

  // Re-sync from localStorage whenever changes happen from other components
  // @MX:NOTE: Uses both storage events (cross-tab) and custom events (same-tab)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromStorage = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const cleaned = parsed.filter((id: string) => !id.startsWith('panel-'));
          isSyncing.current = true;
          setWidgetOrder(cleaned);
          Promise.resolve().then(() => { isSyncing.current = false; });
        }
      } catch (error) {
        console.error(`[useWidgetOrder] Failed to sync:`, error);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && !isSelfWriting.current) {
        syncFromStorage();
      }
    };

    const handleCustomEvent = () => {
      syncFromStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(WIDGET_ORDER_CHANGE_EVENT, handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(WIDGET_ORDER_CHANGE_EVENT, handleCustomEvent);
    };
  }, []);

  // Persist to local storage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSyncing.current) return;

    try {
      isSelfWriting.current = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder));
      window.dispatchEvent(new CustomEvent(WIDGET_ORDER_CHANGE_EVENT));
      Promise.resolve().then(() => {
        isSelfWriting.current = false;
      });
    } catch (error) {
      isSelfWriting.current = false;
      console.error(`[useWidgetOrder] Failed to save:`, error);
    }
  }, [widgetOrder]);

  const reorderWidget = useCallback((sourceIndex: number, destIndex: number) => {
    setWidgetOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(destIndex, 0, removed);
      return newOrder;
    });
  }, []);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgetOrder(prev => {
      if (prev.includes(widgetId)) {
        return prev.filter(id => id !== widgetId);
      } else {
        return [...prev, widgetId];
      }
    });
  }, []);

  const isWidgetVisible = useCallback((widgetId: string) => {
    return widgetOrder.includes(widgetId);
  }, [widgetOrder]);

  const getWidgetDefinitions = useCallback((): WidgetDefinition[] => {
    return [];
  }, []);

  const initializeWidgetOrder = useCallback((availableKpis: string[], excludeFilter?: (id: string) => boolean) => {
    setWidgetOrder(prev => {
      const widgetKpis = excludeFilter ? availableKpis.filter(id => !excludeFilter(id)) : availableKpis;
      const existingKpis = prev.filter(id => !excludeFilter || !excludeFilter(id));
      const newKpis = widgetKpis.filter(id => !existingKpis.includes(id));
      return [...newKpis, ...existingKpis];
    });
  }, []);

  return {
    widgetOrder,
    reorderWidget,
    toggleWidgetVisibility,
    isWidgetVisible,
    getWidgetDefinitions,
    initializeWidgetOrder,
  };
}