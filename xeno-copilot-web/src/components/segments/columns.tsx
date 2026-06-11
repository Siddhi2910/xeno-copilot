'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { TimestampCell } from '@/components/shared/TimestampCell';
import type { Customer } from '@/lib/types/customer';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';

export const segmentCustomerColumns: ColumnDef<Customer, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <span className="font-medium text-slate-900 dark:text-slate-100">{row.original.name}</span>,
  },
  { accessorKey: 'phone', header: 'Phone' },
  {
    accessorKey: 'totalSpend',
    header: 'Total Spend',
    cell: ({ row }) => formatCurrency(row.original.totalSpend),
  },
  {
    accessorKey: 'totalOrders',
    header: 'Total Orders',
    cell: ({ row }) => formatNumber(row.original.totalOrders),
  },
  {
    accessorKey: 'lastOrderAt',
    header: 'Last Order',
    cell: ({ row }) => <TimestampCell iso={row.original.lastOrderAt} />,
  },
  {
    id: 'rfmScores',
    header: 'R/F/M',
    cell: ({ row }) => {
      const { rfmR, rfmF, rfmM } = row.original;
      if (rfmR == null) return <span className="text-slate-400">—</span>;
      return (
        <span className="tabular-nums text-slate-600 dark:text-slate-400">
          {rfmR}/{rfmF}/{rfmM}
        </span>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Link
        href={`/customers/${row.original._id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-indigo-400"
      >
        View Profile
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    ),
  },
];
