import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/store/app-store';

/**
 * Contract tests for the plain-data state slices.
 *
 * hiddenDimensions / collapsedWidgets / calculatingWidgets are string[] and
 * customWidgetResults / jqlResultCache are plain records. Setters accept the
 * new shape directly or a functional updater, and every update publishes a
 * fresh reference so Zustand change detection fires.
 */

const resetSlices = () => {
  useAppStore.setState({
    hiddenDimensions: [],
    collapsedWidgets: [],
    calculatingWidgets: [],
    customWidgetResults: {},
    jqlResultCache: {},
  });
};

describe('app-store plain-data slices', () => {
  beforeEach(() => {
    resetSlices();
  });

  describe('defaults', () => {
    it('initializes array slices as plain arrays and caches as plain records', () => {
      const state = useAppStore.getState();
      expect(Array.isArray(state.hiddenDimensions)).toBe(true);
      expect(Array.isArray(state.collapsedWidgets)).toBe(true);
      expect(Array.isArray(state.calculatingWidgets)).toBe(true);
      expect(state.customWidgetResults).toBeTypeOf('object');
      expect(state.jqlResultCache).toBeTypeOf('object');
      expect(state.customWidgetResults).not.toBeInstanceOf(Map);
      expect(state.jqlResultCache).not.toBeInstanceOf(Map);
      expect(state.hiddenDimensions).not.toBeInstanceOf(Set);
      expect(state.collapsedWidgets).not.toBeInstanceOf(Set);
      expect(state.calculatingWidgets).not.toBeInstanceOf(Set);
    });
  });

  describe('setHiddenDimensions', () => {
    it('accepts a plain array', () => {
      useAppStore.getState().setHiddenDimensions(['a|1', 'b|2']);
      expect(useAppStore.getState().hiddenDimensions).toEqual(['a|1', 'b|2']);
    });

    it('accepts a functional updater that receives the previous array', () => {
      useAppStore.getState().setHiddenDimensions(['a|1']);
      useAppStore.getState().setHiddenDimensions(prev => [...prev, 'b|2']);
      expect(useAppStore.getState().hiddenDimensions).toEqual(['a|1', 'b|2']);
    });

    it('preserves insertion order', () => {
      useAppStore.getState().setHiddenDimensions(['z', 'a', 'm']);
      expect(useAppStore.getState().hiddenDimensions).toEqual(['z', 'a', 'm']);
    });

    it('publishes a new array reference on every update', () => {
      useAppStore.getState().setHiddenDimensions(['a']);
      const before = useAppStore.getState().hiddenDimensions;
      useAppStore.getState().setHiddenDimensions(prev => [...prev, 'b']);
      expect(useAppStore.getState().hiddenDimensions).not.toBe(before);
    });

    it('does not mutate the previous array when using a functional updater', () => {
      useAppStore.getState().setHiddenDimensions(['a']);
      const before = useAppStore.getState().hiddenDimensions;
      useAppStore.getState().setHiddenDimensions(prev => prev.filter(k => k !== 'a'));
      expect(before).toEqual(['a']);
      expect(useAppStore.getState().hiddenDimensions).toEqual([]);
    });
  });

  describe('setCollapsedWidgets', () => {
    it('accepts a plain array', () => {
      useAppStore.getState().setCollapsedWidgets(['metrics-overview']);
      expect(useAppStore.getState().collapsedWidgets).toEqual(['metrics-overview']);
    });

    it('supports toggle-style functional updates', () => {
      const toggle = (id: string) =>
        useAppStore.getState().setCollapsedWidgets(prev =>
          prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id],
        );

      toggle('metrics-overview');
      expect(useAppStore.getState().collapsedWidgets).toEqual(['metrics-overview']);
      toggle('metrics-overview');
      expect(useAppStore.getState().collapsedWidgets).toEqual([]);
    });

    it('publishes a new array reference on every update', () => {
      useAppStore.getState().setCollapsedWidgets(['a']);
      const before = useAppStore.getState().collapsedWidgets;
      useAppStore.getState().setCollapsedWidgets(['a', 'b']);
      expect(useAppStore.getState().collapsedWidgets).not.toBe(before);
    });
  });

  describe('setCalculatingWidgets', () => {
    it('accepts a plain array', () => {
      useAppStore.getState().setCalculatingWidgets(['widget-1']);
      expect(useAppStore.getState().calculatingWidgets).toEqual(['widget-1']);
    });

    it('accepts a functional updater', () => {
      useAppStore.getState().setCalculatingWidgets(prev => [...prev, 'widget-1']);
      useAppStore.getState().setCalculatingWidgets(prev => prev.filter(id => id !== 'widget-1'));
      expect(useAppStore.getState().calculatingWidgets).toEqual([]);
    });

    it('publishes a new array reference on every update', () => {
      const before = useAppStore.getState().calculatingWidgets;
      useAppStore.getState().setCalculatingWidgets(['widget-1']);
      expect(useAppStore.getState().calculatingWidgets).not.toBe(before);
    });
  });

  describe('setCustomWidgetResults', () => {
    it('accepts a plain record', () => {
      const entry = { context: { query: 'x' }, results: [] };
      useAppStore.getState().setCustomWidgetResults({ 'chart-1': entry });
      expect(useAppStore.getState().customWidgetResults['chart-1']).toEqual(entry);
    });

    it('accepts a functional updater that receives the previous record', () => {
      useAppStore.getState().setCustomWidgetResults(prev => ({
        ...prev,
        'chart-1': { context: {}, results: [] },
      }));
      useAppStore.getState().setCustomWidgetResults(prev => ({
        ...prev,
        'chart-2': { context: {}, results: [] },
      }));
      const state = useAppStore.getState().customWidgetResults;
      expect(Object.keys(state)).toEqual(['chart-1', 'chart-2']);
    });

    it('publishes a new record reference on every update', () => {
      const before = useAppStore.getState().customWidgetResults;
      useAppStore.getState().setCustomWidgetResults(prev => ({ ...prev, 'chart-1': { context: {}, results: [] } }));
      expect(useAppStore.getState().customWidgetResults).not.toBe(before);
    });
  });

  describe('setJqlResultCache', () => {
    it('accepts a plain record', () => {
      useAppStore.getState().setJqlResultCache({ q1: { results: [], timestamp: 1 } });
      expect(useAppStore.getState().jqlResultCache.q1).toEqual({ results: [], timestamp: 1 });
    });

    it('accepts a functional updater', () => {
      useAppStore.getState().setJqlResultCache(prev => ({ ...prev, q1: { results: [], timestamp: 1 } }));
      useAppStore.getState().setJqlResultCache(prev => ({ ...prev, q2: { results: [], timestamp: 2 } }));
      expect(Object.keys(useAppStore.getState().jqlResultCache)).toEqual(['q1', 'q2']);
    });

    it('publishes a new record reference on every update', () => {
      const before = useAppStore.getState().jqlResultCache;
      useAppStore.getState().setJqlResultCache(prev => ({ ...prev, q1: { results: [], timestamp: 1 } }));
      expect(useAppStore.getState().jqlResultCache).not.toBe(before);
    });
  });
});
