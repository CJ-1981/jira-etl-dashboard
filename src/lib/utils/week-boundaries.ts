/**
 * Local-time Monday-based week boundary helpers.
 *
 * @MX:ANCHOR: Shared week-boundary math for the KPI engine and weekly plugins
 * @MX:REASON: The same local-time Monday-week computation was duplicated in
 * KpiEngine.buildPreprocessed(), KpiEngine.calculate(), and the
 * weekly_ticket_list plugin. One shared helper keeps the semantics identical
 * everywhere and gives the behavior a single tested home.
 *
 * @MX:WARN: These helpers use LOCAL time and Monday-first weeks (getDay() with
 * a `day === 0 ? -6 : 1` adjustment). This is intentionally different from the
 * UTC ISO-8601 week math in src/lib/kpi/utils/time-series-utils.ts used by the
 * time-series trend plugins — see the note at the top of that file. Do not
 * "unify" them without a product decision.
 */

/**
 * Week boundaries for local-time Monday-based weeks.
 *
 * - `thisWeekStart` — Monday of the week containing `now`, at local midnight.
 * - `thisWeekEnd`   — the following Monday at local midnight (EXCLUSIVE end;
 *                     compare with `d < thisWeekEnd`).
 * - `lastWeekStart` — the Monday of the previous week, at local midnight.
 * - `lastWeekEnd`   — same instant as `thisWeekStart` (EXCLUSIVE end;
 *                     compare with `d < lastWeekEnd`).
 */
export interface LocalMondayWeekBounds {
  thisWeekStart: Date;
  thisWeekEnd: Date;
  lastWeekStart: Date;
  lastWeekEnd: Date;
}

/**
 * Compute the current and previous local-time Monday-based week boundaries.
 *
 * @param now - Any instant inside the target week (typically `new Date()`).
 *              The input is not mutated.
 * @returns Fresh Date objects, all at local midnight; end bounds are exclusive.
 */
export function getLocalMondayWeekBounds(now: Date): LocalMondayWeekBounds {
  // Monday of the week containing `now`.
  // getDay(): 0 = Sunday ... 6 = Saturday; Sunday belongs to the week that
  // started on the PREVIOUS Monday, hence the `day === 0 ? -6 : 1` adjustment.
  const thisWeekStart = new Date(now);
  const day = thisWeekStart.getDay();
  const diff = thisWeekStart.getDate() - day + (day === 0 ? -6 : 1);
  thisWeekStart.setDate(diff);
  thisWeekStart.setHours(0, 0, 0, 0);

  // Exclusive end of this week = next Monday local midnight.
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

  // Previous week runs from the prior Monday up to (excluding) this Monday.
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lastWeekEnd = new Date(thisWeekStart);

  return { thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd };
}
