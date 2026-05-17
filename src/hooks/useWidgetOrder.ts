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

import { useState, useCallback, useEffect } from 'react';

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
  /** Array of widget IDs in current display order */
  widgetOrder: string[];
  /** Reorder widget from sourceIndex to destIndex */
  reorderWidget: (sourceIndex: number, destIndex: number) => void;
  /** Toggle widget visibility (add if hidden, remove if visible) */
  toggleWidgetVisibility: (widgetId: string) => void;
  /** Check if widget is currently visible */
  isWidgetVisible: (widgetId: string) => boolean;
  /** Get all available widget definitions */
  getWidgetDefinitions: () => WidgetDefinition[];
  /** Initialize widget order with default widgets */
  initializeWidgetOrder: (availableKpis: string[], excludeFilter?: (id: string) => boolean) => void;
}

/**
 * Hook for managing widget display order on the dashboard.
 *
 * @returns Widget order state and operations
 *
 * @remarks
 * - Manages both individual KPI widgets and panel section widgets
 * - Persists widget order to localStorage
 * - Provides default panel sections that can be toggled
 * - Individual KPIs are managed through active plugins
 */
// @MX:NOTE: Main hook implementation for widget display order management
// @MX:REASON: Centralizes widget ordering logic for both KPIs and panel sections
export function useWidgetOrder(): UseWidgetOrderResult {
  const STORAGE_KEY = 'widget_display_order';

  // Initialize from local storage or use empty array (no default panels)
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);

        // Filter out any legacy panel IDs - only keep individual plugin IDs
        const cleaned = parsed.filter((id: string) => !id.startsWith('panel-'));

        return cleaned;
      }
      return [];
    } catch (error) {
      console.error(`Failed to load ${STORAGE_KEY} from localStorage:`, error);
      return [];
    }
  });

  // Persist to local storage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder));
    } catch (error) {
      console.error(`Failed to save ${STORAGE_KEY} to localStorage:`, error);
    }
  }, [widgetOrder]);

  // Reorder widget by moving item from sourceIndex to destIndex
  const reorderWidget = useCallback((sourceIndex: number, destIndex: number) => {
    setWidgetOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(sourceIndex, 1);
      newOrder.splice(destIndex, 0, removed);
      return newOrder;
    });
  }, []);

  // Toggle widget visibility (add if hidden, remove if visible)
  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgetOrder(prev => {
      if (prev.includes(widgetId)) {
        // Remove from visible widgets
        return prev.filter(id => id !== widgetId);
      } else {
        // Add to visible widgets at the end
        return [...prev, widgetId];
      }
    });
  }, []);

  // Check if widget is currently visible
  const isWidgetVisible = useCallback((widgetId: string) => {
    return widgetOrder.includes(widgetId);
  }, [widgetOrder]);

  // Get all available widget definitions (no panels, only individual plugins)
  const getWidgetDefinitions = useCallback((): WidgetDefinition[] => {
    return [];
  }, []);

  // Initialize widget order with available KPIs (filtering out time-series plugins)
  const initializeWidgetOrder = useCallback((availableKpis: string[], excludeFilter?: (id: string) => boolean) => {
    setWidgetOrder(prev => {
      // Apply filter if provided (e.g., to exclude time-series plugins)
      const widgetKpis = excludeFilter ? availableKpis.filter(id => !excludeFilter(id)) : availableKpis;

      // Add any new KPIs that aren't already in the order
      const existingKpis = prev.filter(id => !id.startsWith('panel-') && (!excludeFilter || !excludeFilter(id)));
      const newKpis = widgetKpis.filter(id => !existingKpis.includes(id));
      const panels = prev.filter(id => id.startsWith('panel-'));

      // Place new KPIs after panels but before existing KPIs
      return [...panels, ...newKpis, ...existingKpis];
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
