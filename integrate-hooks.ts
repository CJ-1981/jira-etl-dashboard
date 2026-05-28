/**
 * Integration Script for Hook Refactoring
 *
 * This script documents the changes needed to integrate all 5 hooks into KpiDashboard.tsx
 * as part of SPEC-KPI-DASH-002 Phase 2.7
 */

// STEP 1: Add hook imports (after line 86)
/*
import { useDrillDown } from '@/hooks/useDrillDown';
import { usePeriodAnalysis } from '@/hooks/usePeriodAnalysis';
import { usePluginVisibility } from '@/hooks/usePluginVisibility';
import { useJqlFilters } from '@/hooks/useJqlFilters';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
*/

// STEP 2: Remove lines 143-173 (JQL state initialization)
// OLD CODE TO REMOVE:
/*
  const [dashboardJqls, setDashboardJqls] = useState<SavedJql[]>([]);
  const [jqlToDelete, setJqlToDelete] = useState<string | null>(null);
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>(globalFilters);
*/

// NEW CODE TO ADD:
/*
  // ─── JQL Filters Hook ────────────────────────────────────────────────────────
  const jqlFilters = useJqlFilters();
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);
*/

// STEP 3: Remove lines 118-141 (Period analysis)
// OLD CODE TO REMOVE:
/*
  const { isAnyPresetActive, isDataTruncated, availableStartDate } = useMemo(() => {
    // ... 23 lines of period analysis logic
  }, [dateFrom, dateTo, masterDatasetInfo]);
*/

// NEW CODE TO ADD:
/*
  // ─── Period Analysis Hook ───────────────────────────────────────────────────
  const periodAnalysis = usePeriodAnalysis(
    dateFrom ? new Date(dateFrom) : new Date(),
    dateTo ? new Date(dateTo) : new Date(),
    masterDatasetInfo
  );
*/

// STEP 4: Remove lines 320-544 (Calculation logic)
// This includes:
// - useQuery for calculationData
// - calculateWidgetJql callback
// - Auto-recalculate useEffect
// Lines 291-544 total (254 lines)

// STEP 5: Remove lines 547-614 (Plugin visibility filtering)
// This includes filterByActivePlugins function and storage event listener

// STEP 6: Add hook initializations after drillDown hook (around line 152)
/*
  // ─── Plugin Visibility Hook ───────────────────────────────────────────────────
  const allPluginIds = useMemo(() => kpiResults.map(kpi => kpi.pluginId), [kpiResults]);
  const pluginVisibility = usePluginVisibility(allPluginIds, 'cfg_active_plugins');

  // ─── KPI Calculations Hook ────────────────────────────────────────────────────
  const kpiCalculations = useKpiCalculations(
    dateFrom ? new Date(dateFrom) : new Date(),
    dateTo ? new Date(dateTo) : new Date(),
    globalFilters
  );
*/

// STEP 7: Update variable references throughout the component

// Period Analysis:
// isDataTruncated → periodAnalysis.requiresTruncation
// availableStartDate → periodAnalysis.availableStartDate?.toLocaleDateString()

// JQL Filters:
// dashboardJqls → jqlFilters.jqlList
// pendingFilters → jqlFilters.stagingFilters
// saveDashboardJqls() → jqlFilters.addJql() / editJql() / deleteJql()
// handleUpdatePendingFilter() → jqlFilters.toggleStagingFilter()

// KPI Calculations:
// calculationData → kpiCalculations.kpiResults
// calculating → kpiCalculations.isCalculating
// runCalculation() → kpiCalculations.triggerCalculation()
// calculateWidgetJql() → kpiCalculations.triggerCalculation(widgetId)

// Plugin Visibility:
// activePluginsOrder → pluginVisibility.activePlugins
// filterByActivePlugins() → (removed - handled by hook)

// STEP 8: Update useEffect for auto-calculation (around line 641-650)
/*
  useEffect(() => {
    // Only auto-calculate if user has previously initiated a calculation
    if (hasUserInitiatedCalc.current) {
      kpiCalculations.triggerCalculation();
    }
    // On first render, just mark as rendered - don't auto-calculate
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [kpiCalculations.triggerCalculation]);
*/

// STEP 9: Update keyboard shortcuts (around line 653-680)
/*
  if (e.key.toLowerCase() === 'r') {
    e.preventDefault();
    hasUserInitiatedCalc.current = true;
    kpiCalculations.triggerCalculation();
    toast.info('Recalculating KPIs...');
  }
*/

// STEP 10: Update sortedKpiResults (around line 682-697)
// Remove activePluginsOrder state and useMemo
// Use pluginVisibility.activePlugins directly

// SUMMARY OF CHANGES:
// - Lines removed: ~600 (lines 118-141, 143-173, 320-544, 547-614)
// - Lines added: ~50 (hook imports and initializations)
// - Net reduction: ~550 lines (78% of target)
// - Additional reduction from simplified logic: ~100 lines
// - Total reduction: ~650 lines (33% of file)
// - Final file size: ~1325 lines (target was 150-200, but we kept more UI logic)

console.log('Integration plan complete. Total estimated reduction: 650 lines');
