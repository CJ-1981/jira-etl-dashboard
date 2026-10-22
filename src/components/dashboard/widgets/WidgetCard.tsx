'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RotateCw, ChevronUp, ChevronDown } from 'lucide-react';
import { PluginInfoIcon } from '../PluginInfoIcon';

/**
 * Shared card chrome for the dimension widgets (status-time, status-open,
 * sla-priority, other-priority, sla-status, assignee).
 *
 * Renders the identical Card header — title, collapse chevron, plugin info
 * icon and the conditional "Restore All" button — plus the collapsible body.
 * Kanban and cycle-time-histogram use their own bespoke chrome.
 */
export interface WidgetCardProps {
  /** Plugin id used for the collapse toggle, info icon and restore prefix. */
  pluginId: string;
  /** Full title content (icon + label) rendered inside CardTitle. */
  titleContent: ReactNode;
  /** Plugin description forwarded to the info icon tooltip. */
  pluginDescription?: string;
  /** Whether the body is expanded. */
  isExpanded: boolean;
  /** Collapse toggle handler (owned by KpiDashboard). */
  onToggleCollapse: (pluginId: string) => void;
  /** Current hidden-dimension keys. */
  hiddenDimensions: string[];
  /** Prefix used to detect / restore hidden dimensions for this widget. */
  hiddenPrefix: string;
  /** Restore-all handler; removes every hidden key starting with the prefix. */
  onRestoreAll: (prefix: string) => void;
  /** Color classes for the "Restore All" button (varies per widget). */
  restoreAllClassName: string;
  /** Hover highlight for title + chevron — usually the widget's accent color
   *  (e.g. "group-hover/toggle:text-blue-600 dark:group-hover/toggle:text-blue-400"). */
  accentClassName?: string;
  /** Body content rendered inside CardContent when expanded. */
  children: ReactNode;
}

export function WidgetCard({
  pluginId,
  titleContent,
  pluginDescription,
  isExpanded,
  onToggleCollapse,
  hiddenDimensions,
  hiddenPrefix,
  onRestoreAll,
  restoreAllClassName,
  accentClassName = 'group-hover/toggle:text-slate-900 dark:group-hover/toggle:text-slate-100',
  children,
}: WidgetCardProps) {
  const hasHidden = hiddenDimensions.some(k => k.startsWith(hiddenPrefix));

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          {/* Title and chevron toggle together and highlight together — the
              shared hover/click pattern used by every dashboard widget. */}
          <div className="group/toggle flex min-w-0 items-center gap-2">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleCollapse(pluginId)}
                className={`flex min-w-0 items-center gap-2 text-left transition-colors ${accentClassName}`}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {titleContent}
              </button>
              <button
                onClick={() => onToggleCollapse(pluginId)}
                className={`text-slate-400 p-0.5 transition-colors ${accentClassName}`}
                title={isExpanded ? 'Collapse' : 'Expand'}
                aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
              >
                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </CardTitle>
            <PluginInfoIcon pluginId={pluginId} description={pluginDescription} />
          </div>
          {hasHidden && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRestoreAll(hiddenPrefix)}
              className={`h-7 text-[10px] ${restoreAllClassName}`}
            >
              <RotateCw className="h-3 w-3 mr-1" /> Restore All
            </Button>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          {children}
        </CardContent>
      )}
    </Card>
  );
}
