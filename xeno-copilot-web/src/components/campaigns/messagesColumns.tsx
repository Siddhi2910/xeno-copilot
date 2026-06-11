'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChannelBadge } from '@/components/shared/ChannelBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import type { CampaignMessage } from '@/lib/types/campaign';

export const messageColumns: ColumnDef<CampaignMessage, unknown>[] = [
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => row.original.customerName ?? row.original.customerPhone ?? '—',
  },
  { accessorKey: 'recipient', header: 'Phone/Email' },
  {
    accessorKey: 'channel',
    header: 'Channel',
    cell: ({ row }) => <ChannelBadge channel={row.original.channel} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'sentAt',
    header: 'Sent At',
    cell: ({ row }) => <TimestampCell iso={row.original.sentAt} />,
  },
  {
    accessorKey: 'deliveredAt',
    header: 'Delivered',
    cell: ({ row }) => <TimestampCell iso={row.original.deliveredAt} />,
  },
  {
    accessorKey: 'openedAt',
    header: 'Opened',
    cell: ({ row }) => <TimestampCell iso={row.original.openedAt} />,
  },
  {
    accessorKey: 'clickedAt',
    header: 'Clicked',
    cell: ({ row }) => <TimestampCell iso={row.original.clickedAt} />,
  },
  {
    accessorKey: 'failureReason',
    header: 'Failed Reason',
    cell: ({ row }) => row.original.failureReason ?? '—',
  },
];
