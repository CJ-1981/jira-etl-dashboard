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
  ArrowUpDown, Search, AlertTriangle,
  ChevronDown, ChevronRight, Ticket, Tag, Filter,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface KpiDataRow {
  id: string;
  pluginId: string;
  pluginName: string;
  metricName: string;
  dimension: string;
  dimensionType: string;
  value: number;
  unit: string;
  ticketCount: number;
  alertStatus: 'critical' | 'warning' | null;
  ticketKeys?: string[];
}

interface KpiDataTableProps {
  results: any[];
  onDrillDown: (keys: string[], title: string) => void;
  getPluginName?: (pluginId: string) => string;
}

const DIMENSION_TYPE_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  team: 'Team',
  bucket: 'Bucket',
  none: '—',
};

export function KpiDataTable({ results, onDrillDown, getPluginName }: KpiDataTableProps) {
  const { settings } = useAppStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'pluginId', desc: false }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pluginFilter, setPluginFilter] = useState<string>('all');
  const [dimTypeFilter, setDimTypeFilter] = useState<string>('all');

  const data = useMemo<KpiDataRow[]>(() => {
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

        // Resolve dimension type and value
        const dims = res.dimensions || {};
        let dimensionType = 'none';
        let dimensionValue = '—';
        if (dims.status) { dimensionType = 'status'; dimensionValue = dims.status; }
        else if (dims.priority) { dimensionType = 'priority'; dimensionValue = dims.priority; }
        else if (dims.assignee) { dimensionType = 'assignee'; dimensionValue = dims.assignee; }
        else if (dims.team) { dimensionType = 'team'; dimensionValue = dims.team; }
        else if (dims.bucket) { dimensionType = 'bucket'; dimensionValue = dims.bucket; }

        const resolvedName = getPluginName ? getPluginName(pluginId) : pluginId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        rows.push({
          id: `${pluginId}-${idx}-${res.name}`,
          pluginId,
          pluginName: resolvedName,
          metricName: res.name,
          dimension: dimensionValue,
          dimensionType,
          value: res.value,
          unit: res.unit || '',
          ticketCount: res.ticketKeys?.length ?? 0,
          alertStatus,
          ticketKeys: res.ticketKeys,
        });
      });
    });
    return rows;
  }, [results, settings, getPluginName]);

  // Unique plugin list for filter dropdown
  const pluginOptions = useMemo(() => {
    const seen = new Map<string, string>();
    data.forEach(r => seen.set(r.pluginId, r.pluginName));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Unique dimension types for filter dropdown
  const dimTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    data.forEach(r => seen.add(r.dimensionType));
    return Array.from(seen).sort();
  }, [data]);

  // Apply plugin + dimension type filters on top of global text filter
  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (pluginFilter !== 'all' && row.pluginId !== pluginFilter) return false;
      if (dimTypeFilter !== 'all' && row.dimensionType !== dimTypeFilter) return false;
      return true;
    });
  }, [data, pluginFilter, dimTypeFilter]);

  const columnHelper = createColumnHelper<KpiDataRow>();

  const columns = [
    columnHelper.accessor('pluginName', {
      id: 'pluginId',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold text-left whitespace-nowrap"
        >
          Plugin <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight">
              {info.getValue()}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider">
              {row.pluginId}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('metricName', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold whitespace-nowrap"
        >
          Metric <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        return (
          <span
            className={`text-sm font-medium ${row.ticketKeys?.length ? 'cursor-pointer hover:text-emerald-500 hover:underline' : 'text-slate-700 dark:text-slate-300'}`}
            onClick={() => row.ticketKeys?.length && onDrillDown(row.ticketKeys, row.metricName)}
          >
            {info.getValue()}
          </span>
        );
      },
    }),
    columnHelper.accessor('dimensionType', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold whitespace-nowrap"
        >
          Dim. Type <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const val = info.getValue();
        if (val === 'none') return <span className="text-slate-400 text-xs">—</span>;
        const colorMap: Record<string, string> = {
          status: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          priority: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
          assignee: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
          team: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
          bucket: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
        return (
          <Badge variant="outline" className={`text-[10px] h-5 font-semibold ${colorMap[val] || ''}`}>
            {DIMENSION_TYPE_LABELS[val] || val}
          </Badge>
        );
      },
    }),
    columnHelper.accessor('dimension', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold whitespace-nowrap"
        >
          Dimension Value <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const val = info.getValue();
        if (val === '—') return <span className="text-slate-400 text-xs">—</span>;
        return (
          <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{val}</span>
        );
      },
    }),
    columnHelper.accessor('value', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold whitespace-nowrap"
        >
          Value <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        const val = info.getValue();
        const formatted = typeof val === 'number'
          ? (Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2))
          : val;
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm tabular-nums">
              {formatted}
            </span>
            {row.unit && (
              <span className="text-[10px] text-slate-400 font-medium">{row.unit}</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('ticketCount', {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="hover:bg-transparent p-0 font-bold whitespace-nowrap"
        >
          Tickets <ArrowUpDown className="ml-1 h-3.5 w-3.5 inline" />
        </Button>
      ),
      cell: (info) => {
        const row = info.row.original;
        const count = info.getValue();
        if (!count) return <span className="text-slate-400 text-xs">—</span>;
        return (
          <button
            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold text-sm transition-colors"
            onClick={() => row.ticketKeys && onDrillDown(row.ticketKeys, row.metricName)}
          >
            <Ticket className="h-3.5 w-3.5" />
            {count}
          </button>
        );
      },
    }),
    columnHelper.accessor('alertStatus', {
      header: 'Health',
      cell: (info) => {
        const status = info.getValue();
        if (!status) return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] h-5">
            Healthy
          </Badge>
        );
        return (
          <Badge
            className={`h-5 text-[10px] gap-1 ${status === 'critical'
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
      header: '',
      enableSorting: false,
      cell: (info) => {
        const row = info.row.original;
        if (!row.ticketKeys?.length) return null;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDrillDown(row.ticketKeys!, row.metricName)}
            className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 whitespace-nowrap"
          >
            Drill Down
          </Button>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filteredData,
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

  const visibleCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Global text search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <Input
            placeholder="Search metrics..."
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 pl-9 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          />
        </div>

        {/* Plugin filter */}
        <Select value={pluginFilter} onValueChange={setPluginFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <Filter className="h-3 w-3 mr-1 text-slate-400" />
            <SelectValue placeholder="All Plugins" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Plugins</SelectItem>
            {pluginOptions.map(([id, name]) => (
              <SelectItem key={id} value={id} className="text-xs">{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dimension type filter */}
        <Select value={dimTypeFilter} onValueChange={setDimTypeFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <Tag className="h-3 w-3 mr-1 text-slate-400" />
            <SelectValue placeholder="All Dimensions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Dimensions</SelectItem>
            {dimTypeOptions.map((dt) => (
              <SelectItem key={dt} value={dt} className="text-xs capitalize">
                {DIMENSION_TYPE_LABELS[dt] || dt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Count badge */}
        <div className="text-xs text-slate-500 font-medium ml-auto">
          {visibleCount === totalCount
            ? `${totalCount} rows`
            : `${visibleCount} of ${totalCount} rows`}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/50 shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-slate-200 dark:border-slate-800">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-9 text-slate-500 dark:text-slate-400 text-xs px-3">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, i) => (
                <TableRow
                  key={row.id}
                  className={`border-slate-100 dark:border-slate-800 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/20'}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5 px-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500 text-sm">
                  No metrics match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
