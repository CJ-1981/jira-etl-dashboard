'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
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

interface HolidaysPanelProps {
  region: string;
  setRegion: (region: string) => void;
}

export function HolidaysPanel({ region, setRegion }: HolidaysPanelProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Array<{ date: string; name: string; nameLocal: string; isNational: boolean; regions: string[] }>>([]);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);
  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/holidays?year=${year}&region=${region}`);
      const data = await res.json();
      if (isMounted.current && data.success) {
        setHolidays(data.holidays);
      }
    } catch {
      if (isMounted.current) toast.error('Failed to load holidays');
    }
    if (isMounted.current) setLoading(false);
  }, [year, region]);
  
  useEffect(() => { loadHolidays(); }, [loadHolidays]);
  const national = holidays.filter((h) => h.isNational).sort((a, b) => a.date.localeCompare(b.date));
  const regional = holidays.filter((h) => !h.isNational).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-emerald-400" /> German Holiday Calendar</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2"><Label className="text-slate-700 dark:text-slate-300">Year</Label><Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 w-32" /></div>
            <div className="space-y-2 flex-1"><Label className="text-slate-700 dark:text-slate-300">State</Label><Select value={region} onValueChange={setRegion}><SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"><SelectValue /></SelectTrigger><SelectContent>{GERMAN_STATES.filter(s => s.code !== 'all').map((s) => (<SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>))}</SelectContent></Select></div>
            <div className="flex items-end"><Button onClick={loadHolidays} variant="outline" className="border-slate-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-400 border-emerald-500/30">National</Badge>({national.length})</CardTitle></CardHeader>
          <CardContent><div className="space-y-1">{loading ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full bg-gray-100 dark:bg-slate-800" />) : national.map((h, i) => (<div key={i} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div></CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Badge className="bg-purple-50 dark:bg-purple-500/10 text-purple-400 border-purple-500/30">Regional</Badge>({regional.length})</CardTitle></CardHeader>
          <CardContent>{regional.length === 0 ? <div className="text-center py-12 text-slate-400 dark:text-slate-500"><Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No regional holidays for this selection</p></div> : <div className="space-y-1">{regional.map((h, i) => (<div key={i} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50 dark:bg-slate-800/50"><div><p className="text-sm font-medium">{h.name}</p><p className="text-xs text-slate-400 dark:text-slate-500">{h.nameLocal} {h.regions.length > 0 && <span className="text-purple-400">({h.regions.join(', ')})</span>}</p></div><Badge variant="outline" className="text-xs font-mono">{h.date}</Badge></div>))}</div>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
