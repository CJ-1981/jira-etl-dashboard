"use client";

/**
 * PluginInfoIcon — small "info" affordance for KPI widget headers.
 * Shows the plugin's description in a hover tooltip. When `description` is
 * not passed, it resolves one from the plugin registry (custom plugins in
 * localStorage, builtins via /api/kpi/plugins — fetched once per QueryClient
 * via useQuery with an infinite staleTime).
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { localConfig } from '@/lib/config/local-store';
import { getDataSource } from '@/lib/datasource';

async function fetchBuiltinDescriptions(): Promise<Record<string, string>> {
  const plugins = await getDataSource().listPlugins();
  const map: Record<string, string> = {};
  for (const p of plugins) {
    if (p?.id && p.description) map[p.id] = p.description;
  }
  return map;
}

export interface PluginInfoIconProps {
  pluginId: string;
  /** When the caller already has the description (e.g. KpiDashboard's plugin registry). */
  description?: string;
}

export function PluginInfoIcon({ pluginId, description }: PluginInfoIconProps) {
  // Custom formula plugins live in localStorage and resolve synchronously.
  const customDescription = localConfig.getKpiPlugins().find((p) => p.id === pluginId)?.description;

  const { data: builtinDescriptions } = useQuery({
    queryKey: ['kpi-plugin-descriptions'],
    queryFn: fetchBuiltinDescriptions,
    staleTime: Infinity,
    // Only hit the network when the caller didn't provide a description and
    // the plugin isn't a locally stored custom formula plugin.
    enabled: !description && !customDescription,
  });

  const resolved = description || customDescription || builtinDescriptions?.[pluginId];

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
