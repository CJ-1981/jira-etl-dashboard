"use client";

/**
 * PluginInfoIcon — small "info" affordance for KPI widget headers.
 * Shows the plugin's description in a hover tooltip. When `description` is
 * not passed, it resolves one from the plugin registry (custom plugins in
 * localStorage, builtins via /api/kpi/plugins — fetched once, module-cached).
 */

import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { localConfig } from '@/lib/config/local-store';

let builtinDescriptions: Record<string, string> | null = null;
let builtinFetch: Promise<Record<string, string>> | null = null;

function fetchBuiltinDescriptions(): Promise<Record<string, string>> {
  if (!builtinFetch) {
    builtinFetch = fetch('/api/kpi/plugins')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        const map: Record<string, string> = {};
        if (data?.success && Array.isArray(data.plugins)) {
          for (const p of data.plugins) {
            if (p?.id && p.description) map[p.id] = p.description;
          }
        }
        builtinDescriptions = map;
        return map;
      })
      .catch(() => {
        builtinFetch = null; // allow retry after a failed fetch
        return {};
      });
  }
  return builtinFetch;
}

function resolveDescription(pluginId: string): string | undefined {
  // Custom formula plugins live in localStorage and are available synchronously.
  const custom = localConfig.getKpiPlugins().find((p) => p.id === pluginId);
  if (custom?.description) return custom.description;
  return builtinDescriptions?.[pluginId];
}

export interface PluginInfoIconProps {
  pluginId: string;
  /** When the caller already has the description (e.g. KpiDashboard's plugin registry). */
  description?: string;
}

export function PluginInfoIcon({ pluginId, description }: PluginInfoIconProps) {
  const [resolved, setResolved] = useState<string | undefined>(
    () => description || resolveDescription(pluginId)
  );

  useEffect(() => {
    if (description) {
      setResolved(description);
      return;
    }
    const direct = resolveDescription(pluginId);
    if (direct) {
      setResolved(direct);
      return;
    }
    let cancelled = false;
    fetchBuiltinDescriptions().then((map) => {
      if (!cancelled && map[pluginId]) setResolved(map[pluginId]);
    });
    return () => {
      cancelled = true;
    };
  }, [pluginId, description]);

  if (!resolved) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-help inline-flex"
            aria-label={`About ${pluginId}`}
            data-export-ignore="true"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-3 text-xs leading-relaxed">
          {resolved}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default PluginInfoIcon;
