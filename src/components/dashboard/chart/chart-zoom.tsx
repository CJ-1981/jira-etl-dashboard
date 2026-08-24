'use client';

import { useCallback, useState } from 'react';
import { ReferenceArea } from 'recharts';

/** Subset of recharts' categorical-chart mouse state used by drag-to-zoom. */
export interface ChartMouseState {
  activeTooltipIndex?: number;
}

/** Drag-to-zoom state for time-series (line/area) charts. */
export interface ChartZoomState {
  leftIndex: number | null;
  rightIndex: number | null;
  refAreaLeft: number | undefined;
  refAreaRight: number | undefined;
}

const INITIAL_ZOOM_STATE: ChartZoomState = {
  leftIndex: null,
  rightIndex: null,
  refAreaLeft: undefined,
  refAreaRight: undefined,
};

export interface UseChartZoomResult {
  zoomState: ChartZoomState;
  /** True once a zoom window has been committed (shows the Reset Zoom button). */
  isZoomed: boolean;
  resetZoom: () => void;
  /** Spread onto the recharts chart element to enable drag-to-zoom. */
  zoomMouseHandlers: {
    onMouseDown: (e: ChartMouseState) => void;
    onMouseMove: (e: ChartMouseState) => void;
    onMouseUp: () => void;
  };
}

/**
 * Drag-to-zoom state machine shared by the line and area chart renderers:
 * mouse-down anchors the selection, mouse-move extends it and mouse-up
 * commits the [left, right] index window.
 */
export function useChartZoom(): UseChartZoomResult {
  const [zoomState, setZoomState] = useState<ChartZoomState>(INITIAL_ZOOM_STATE);

  const resetZoom = useCallback(() => {
    setZoomState(INITIAL_ZOOM_STATE);
  }, []);

  const handleZoom = useCallback(() => {
    setZoomState(prev => {
      const { refAreaLeft, refAreaRight } = prev;

      if (refAreaLeft === undefined || refAreaRight === undefined || refAreaLeft === refAreaRight) {
        return {
          ...prev,
          refAreaLeft: undefined,
          refAreaRight: undefined,
        };
      }

      // Ensure left < right
      const leftIndex = Math.min(refAreaLeft, refAreaRight);
      const rightIndex = Math.max(refAreaLeft, refAreaRight);

      return {
        ...prev,
        refAreaLeft: undefined,
        refAreaRight: undefined,
        leftIndex,
        rightIndex,
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: ChartMouseState) => {
    if (e && e.activeTooltipIndex !== undefined) {
      setZoomState(prev => ({
        ...prev,
        refAreaLeft: e.activeTooltipIndex,
      }));
    }
  }, []);

  const handleMouseMove = useCallback((e: ChartMouseState) => {
    if (e && e.activeTooltipIndex !== undefined) {
      setZoomState(prev => {
        if (prev.refAreaLeft !== undefined) {
          return { ...prev, refAreaRight: e.activeTooltipIndex };
        }
        return prev;
      });
    }
  }, []);

  return {
    zoomState,
    isZoomed: zoomState.leftIndex !== null || zoomState.rightIndex !== null,
    resetZoom,
    zoomMouseHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleZoom,
    },
  };
}

/**
 * Apply the committed zoom window to a dataset. Returns the original array
 * unchanged when no zoom window is active.
 */
export function sliceForZoom<T>(
  data: T[],
  zoomState: Pick<ChartZoomState, 'leftIndex' | 'rightIndex'>,
): T[] {
  if (zoomState.leftIndex !== null && zoomState.rightIndex !== null) {
    return data.slice(zoomState.leftIndex, zoomState.rightIndex + 1);
  }
  return data;
}

/**
 * Purple selection overlay drawn while the user drags to zoom.
 * `data` is the full (unzoomed) dataset so indices map back to period names.
 */
export function ZoomSelectionArea({
  data,
  zoomState,
}: {
  data: Array<{ name: string }>;
  zoomState: Pick<ChartZoomState, 'refAreaLeft' | 'refAreaRight'>;
}) {
  if (zoomState.refAreaLeft === undefined || zoomState.refAreaRight === undefined) {
    return null;
  }
  return (
    <ReferenceArea
      x1={data[zoomState.refAreaLeft]?.name}
      x2={data[zoomState.refAreaRight]?.name}
      stroke="none"
      fillOpacity={0.3}
      fill="purple"
    />
  );
}
