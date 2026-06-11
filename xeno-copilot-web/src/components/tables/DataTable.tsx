'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { SkeletonTable } from '@/components/shared/SkeletonTable';
import { cn } from '@/lib/utils/cn';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  filterBar?: ReactNode;
  paginationSlot?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyState,
  filterBar,
  paginationSlot,
  className,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', className)}>
      {filterBar ? <div className="border-b border-slate-200 p-4 dark:border-slate-800">{filterBar}</div> : null}
      {isLoading ? (
        <SkeletonTable columns={Math.min(columns.length, 8)} />
      ) : data.length === 0 ? (
        emptyState
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-200 dark:border-slate-800">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-slate-100 transition-colors hover:bg-indigo-50/40 dark:border-slate-800/50 dark:hover:bg-indigo-950/20"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paginationSlot}
    </div>
  );
}
