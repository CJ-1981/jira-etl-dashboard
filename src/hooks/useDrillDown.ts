/**
 * useDrillDown Hook
 *
 * Manages drill-down state for KPI dashboard - displaying ticket lists for metrics.
 *
 * Extracted from KpiDashboard component to encapsulate drill-down logic.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { drillDownKeys, drillDownTitle, isDrillDownOpen, openDrillDown, closeDrillDown } = useDrillDown();
 *   return (
 *     <>
 *       <button onClick={() => openDrillDown(['KEY-1', 'KEY-2'], 'Open Bugs')}>
 *         Show Tickets
 *       </button>
 *       <Sheet open={isDrillDownOpen} onOpenChange={(open) => !open && closeDrillDown()}>
 *         <SheetContent>
 *           <h2>{drillDownTitle}</h2>
 *           <TicketList keys={drillDownKeys} />
 *         </SheetContent>
 *       </Sheet>
 *     </>
 *   );
 * }
 * ```
 */
import { useState, useCallback, useMemo } from 'react';

export interface UseDrillDownResult {
  /** Array of JIRA ticket keys to display in drill-down view */
  drillDownKeys: string[] | null;
  /** Title for the drill-down sheet (e.g., metric name) */
  drillDownTitle: string;
  /** Derived boolean: true when drill-down keys are present */
  isDrillDownOpen: boolean;
  /** Open drill-down with ticket keys and title */
  openDrillDown: (keys: string[], title: string) => void;
  /** Close drill-down by clearing keys and title */
  closeDrillDown: () => void;
}

/**
 * Hook for managing drill-down state in KPI dashboard.
 *
 * @returns Drill-down state and handlers
 *
 * @MX:NOTE: [AUTO] Drill-down state extracted from KpiDashboard for better separation of concerns
 */
export function useDrillDown(): UseDrillDownResult {
  const [drillDownKeys, setDrillDownKeys] = useState<string[] | null>(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');

  const openDrillDown = useCallback((keys: string[], title: string) => {
    setDrillDownKeys(keys);
    setDrillDownTitle(title);
  }, []);

  const closeDrillDown = useCallback(() => {
    setDrillDownKeys(null);
    setDrillDownTitle('');
  }, []);

  // Derived state: open when keys exist
  const isDrillDownOpen = useMemo(() => {
    return drillDownKeys !== null && drillDownKeys.length > 0;
  }, [drillDownKeys]);

  return {
    drillDownKeys,
    drillDownTitle,
    isDrillDownOpen,
    openDrillDown,
    closeDrillDown,
  };
}
