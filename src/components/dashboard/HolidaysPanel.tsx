'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Calendar, RefreshCw } from 'lucide-react';
import { GERMAN_STATES } from '@/lib/config/constants';
import { useAppStore } from '@/store/app-store';
import { getDataSource } from '@/lib/datasource';

// @MX:ANCHOR: Year bounds for the holiday calendar. The underlying holiday tables
// only define entries for modern years; values outside this range are rejected.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = CURRENT_YEAR + 5;

export function HolidaysPanel() {
  const { region, setRegion, settings } = useAppStore();
  // @MX:NOTE: Year is validated against MIN_YEAR..MAX_YEAR below. Multi-region
  // selection is intentionally deferred: `region` is shared app-wide state that
  // also drives KPI business-hour calculations, so it needs a product decision.
  const [year, setYear] = useState<number | undefined>(CURRENT_YEAR);

  const yearError =
    year !== undefined && (year < MIN_YEAR || year > MAX_YEAR)
      ? `Year must be between ${MIN_YEAR} and ${MAX_YEAR}`
      : null;

  // @MX:ANCHOR: Initialize region from KPI Calculation Defaults on mount
  // @MX:REASON: When user saves a preferred state in KPI Calculation Defaults, Holiday Calendar should use it
  useEffect(() => {
    const defaultRegion = settings?.general?.defaultHolidayState;
    if (defaultRegion && defaultRegion !== region) {
      setRegion(defaultRegion);
    }
  }, []); // Run once on mount

  const yearValid = year !== undefined && year >= MIN_YEAR && year <= MAX_YEAR;

  /**
   * @MX:ANCHOR: holidays query
   * Fetches holiday data via React Query, keyed by year + region so changing
   * either re-fetches automatically. All failure modes normalize to the same
   * user-facing message the previous implementation toasted.
   */
  const {
    data: holidays = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['holidays', year, region],
    queryFn: async (): Promise<Array<{ date: string; name: string; nameLocal: string; isNational: boolean; regions: string[] }>> => {
      try {
        const data = await getDataSource().getHolidays(year as number, region);
        return (data.holidays || []) as Array<{ date: string; name: string; nameLocal: string; isNational: boolean; regions: string[] }>;
      } catch (e) {
        console.error('[Holidays] Fetch error:', e);
        throw new Error('Failed to load holidays');
      }
    },
    enabled: yearValid,
    retry: false,
  });

  // Surface a toast whenever a load fails (network error or unsuccessful
  // payload). The effect re-runs only when the error instance changes, so a
  // failed manual refresh still produces exactly one toast.
  useEffect(() => {
    if (isError && error) {
      toast.error(error.message || 'Failed to load holidays');
    }
  }, [isError, error]);

  const national = holidays.filter((h) => h.isNational).sort((a, b) => a.date.localeCompare(b.date));
  const regional = holidays.filter((h) => !h.isNational).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-emerald-400" /> German Holiday Calendar</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Year</Label>
              <Input 
                type="number" 
                placeholder="Year" 
                min={MIN_YEAR}
                max={MAX_YEAR}
                value={year || ''} 
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setYear(isNaN(val) ? undefined : val);
                }} 
                aria-invalid={!!yearError}
                className={`bg-gray-100 dark:bg-slate-800 w-32 ${yearError ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700'}`} 
              />
              {yearError && <p className="text-xs text-red-500" role="alert">{yearError}</p>}
            </div>
            <div className="space-y-2 flex-1">
              <Label className="text-slate-700 dark:text-slate-300">State</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  {GERMAN_STATES.map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end"><Button onClick={() => refetch()} variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-400 border-emerald-500/30">National</Badge>({national.length})</CardTitle></CardHeader>
          <CardContent><div className="space-y-1">{loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full bg-gray-100 dark:bg-slate-800" />) : national.map((h) => (<div key={`${h.date}-${h.name}`} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div></CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-purple-50 dark:bg-purple-500/10 text-purple-400 border-purple-500/30">Regional</Badge>({regional.length})</CardTitle></CardHeader>
          <CardContent>{regional.length === 0 ? <div className="text-center py-12 text-slate-400 dark:text-slate-500"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No regional holidays for this selection</p></div> : <div className="space-y-1">{regional.map((h) => (<div key={`${h.date}-${h.name}`} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal} {h.regions.length > 0 && <span className="text-purple-400">({h.regions.join(', ')})</span>}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
