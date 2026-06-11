'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ChannelBadge } from '@/components/shared/ChannelBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import type { Order } from '@/lib/types/order';
import { formatCurrency } from '@/lib/utils/formatters';

export const orderColumns: ColumnDef<Order, unknown>[] = [
  {
    accessorKey: 'orderId',
    header: 'Order ID',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.orderId}</span>,
  },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => (
      <Link
        href={`/customers/${row.original.customerId}`}
        className="text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {row.original.customerPhone}
      </Link>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => formatCurrency(row.original.amount),
  },
  {
    accessorKey: 'channel',
    header: 'Channel',
    cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
  },
  {
    accessorKey: 'orderDate',
    header: 'Order Date',
    cell: ({ row }) => <TimestampCell iso={row.original.orderDate} />,
  },
  {
    id: 'attribution',
    header: 'Attribution',
    cell: ({ row }) =>
      row.original.campaignAttributedTo ? (
        <span className="font-mono text-xs text-slate-600 dark:text-slate-400" title={row.original.campaignAttributedTo}>
          {row.original.campaignAttributedTo.slice(-8)}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    accessorKey: 'discountApplied',
    header: 'Discount',
    cell: ({ row }) => (row.original.discountApplied ? 'Yes' : 'No'),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Link
        href={`/customers/${row.original.customerId}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-indigo-400"
      >
        View Customer
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    ),
  },
];
