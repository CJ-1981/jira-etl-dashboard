'use client';

import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowUpDown, Search, AlertTriangle, CheckCircle2, 
  Clock, Target, TrendingUp, Zap, ChevronDown
} from 'lucide-react';

interface KpiDataRow {
  id: string;
  pluginId: string;
  name: string;
  value: number;
  unit: string;
  category: string;
  alertStatus: 'critical' | 'warning' | null;
  ticketKeys?: string[];
}

interface KpiDataTableProps {
  results: any[];
  settings: any;
  onDrillDown: (keys: string[], title: string) => void;
}

export function KpiDataTable({ results, settings, onDrillDown }: KpiDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const data = useMemo(() => {
    const rows: KpiDataRow[] = [];
    results.forEach((kpi) => {
      kpi.results.forEach((res: any, idx: number) => {
        const pluginId = kpi.pluginId;
        const alertConfig = settings?.alerts?.thresholds?.[pluginId];
        let alertStatus: 'critical' | 'warning' | null = null;

        if (alertConfig) {
          const { warning, critical, operator } = alertConfig;
          const val = res.value;
          if (operator === '>') {
            if (val >= critical) alertStatus = 'critical';
            else if (val >= warning) alertStatus = 'warning';
          } else {
            if (val <= critical) alertStatus = 'critical';
            else if (val <= warning) alertStatus = 'warning';
          }
        }

        rows.push({
          id: `${pluginId}-${idx}-${res.name}`,
          pluginId,
          name: res.name,
          value: res.value,
          unit: res.unit || '',
          category: pluginId.split('_')[0],
          alertStatus,
          ticketKeys: res.ticketKeys,
        });
      });
    });
    return rows;
  }, [results, settings]);

  const columnHelper = createColumnHelper<KpiDataRow>();

  const columns = [
    columnHelper.accessor('name', {
      header: ({ column }) => (
        <Button 
          variant="ghost" 
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold"
        >
          Metric Name <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col">
            <span 
              className={`font-medium ${row.ticketKeys?.length ? 'cursor-pointer hover:text-emerald-500 hover:underline' : ''}`}
              onClick={() => row.ticketKeys?.length && onDrillDown(row.ticketKeys, row.name)}
            >
              {info.getValue()}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
              {row.pluginId}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('value', {
      header: ({ column }) => (
        <Button 
          variant="ghost" 
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold"
        >
          Value <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              {typeof info.getValue() === 'number' ? info.getValue().toFixed(1) : info.getValue()}
            </span>
            <span className="text-xs text-slate-400">{row.unit}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor('alertStatus', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        if (!status) return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] h-5">Healthy</Badge>;
        return (
          <Badge 
            className={`h-5 text-[10px] gap-1 ${
              status === 'critical' 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-amber-500 hover:bg-amber-600'
            } text-white border-none`}
          >
            <AlertTriangle className="h-3 w-3" />
            {status.toUpperCase()}
          </Badge>
        );
      },
    }),
    columnHelper.accessor('id', {
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        return (
          <Button 
            variant="ghost" 
            size="sm" 
            disabled={!row.ticketKeys || row.ticketKeys.length === 0}
            onClick={() => row.ticketKeys && onDrillDown(row.ticketKeys, row.name)}
            className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
          >
            Details
          </Button>
        );
      },
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <Input
            placeholder="Search metrics..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 pl-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:ring-emerald-500/20"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {table.getFilteredRowModel().rows.length} metrics
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/50 shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-slate-200 dark:border-slate-800">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 text-slate-500 dark:text-slate-400">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-100 dark:border-slate-800 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                  No metrics found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
