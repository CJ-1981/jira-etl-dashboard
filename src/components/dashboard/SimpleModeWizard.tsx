'use client';

import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plug, FlaskConical, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { localConfig } from '@/lib/config/local-store';
import { DEMO_CONNECTION_ID } from '@/lib/datasource/demo-data';
import { useAppStore } from '@/store/app-store';

const WIZARD_DISMISS_KEY = 'cfg_simple_wizard_dismissed';

/** True when the first-run wizard should be offered (simple mode only). */
export function shouldShowSimpleModeWizard(): boolean {
  if (typeof window === 'undefined') return false;
  if (localConfig.getUiMode() !== 'simple') return false;
  if (localConfig.getJiraConnections().length > 0) return false;
  if (localConfig.getDemoMode()) return false;
  return sessionStorage.getItem(WIZARD_DISMISS_KEY) !== '1';
}

/**
 * First-run wizard for simple mode: shown when no Jira connection is
 * configured and demo mode is off. Offers real setup (Settings → Connections)
 * or the artificial demo dataset for exploration. "Skip for now" only
 * dismisses for the current session — the wizard re-appears next session
 * until a connection exists or demo is enabled.
 */
export const SimpleModeWizard = React.memo(function SimpleModeWizard() {
  const [open, setOpen] = useState(() => shouldShowSimpleModeWizard());
  const connections = useAppStore((s) => s.connections);
  const setActiveConnectionId = useAppStore((s) => s.setActiveConnectionId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setDateFrom = useAppStore((s) => s.setDateFrom);
  const setDateTo = useAppStore((s) => s.setDateTo);

  const skip = useCallback(() => {
    sessionStorage.setItem(WIZARD_DISMISS_KEY, '1');
    setOpen(false);
  }, []);

  const openConnectionSetup = useCallback(() => {
    sessionStorage.setItem(WIZARD_DISMISS_KEY, '1');
    setOpen(false);
    setActiveTab('settings');
  }, [setActiveTab]);

  const tryDemoData = useCallback(() => {
    sessionStorage.setItem(WIZARD_DISMISS_KEY, '1');
    setOpen(false);
    localConfig.saveDemoMode(true);
    setActiveConnectionId(DEMO_CONNECTION_ID);
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 89);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
    toast.success('Demo mode enabled', {
      description: 'Exploring with artificial demo data — no Jira credentials used.',
      duration: 5000,
    });
  }, [setActiveConnectionId, setDateFrom, setDateTo]);

  // Self-heal: if a connection appears (or demo is on) while open, close.
  React.useEffect(() => {
    if (open && (connections.length > 0 || localConfig.getDemoMode())) setOpen(false);
  }, [connections.length, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) skip(); }}>
      <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            Welcome to Jira ETL Dashboard
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 text-sm">
            To analyze tickets, either connect your Jira instance or explore with
            artificial demo data first — you can switch at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <button
            onClick={openConnectionSetup}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors text-left"
          >
            <Plug className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Set up Jira connection</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Add your Jira URL, email, and API token in Settings → Connections.
            </span>
          </button>
          <button
            onClick={tryDemoData}
            className="flex flex-col items-start gap-2 p-4 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors text-left"
          >
            <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Try demo data</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Explore the full dashboard with an artificial dataset. No credentials needed.
            </span>
          </button>
        </div>

        <DialogFooter className="sm:justify-between items-center">
          <button
            onClick={skip}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors inline-flex items-center gap-1"
          >
            Skip for now <ArrowRight className="h-3 w-3" />
          </button>
          <p className="text-[10px] text-slate-400">
            You can switch between Simple and Expert mode in the header.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
