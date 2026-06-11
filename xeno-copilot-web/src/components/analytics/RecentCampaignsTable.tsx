'use client';

import Link from 'next/link';
import { CampaignStatusBadge } from '@/components/campaigns/CampaignStatusBadge';
import { ChannelBadge } from '@/components/shared/ChannelBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import type { Campaign } from '@/lib/types/campaign';
import { formatNumber } from '@/lib/utils/formatters';

export function RecentCampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  if (!campaigns.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No campaigns yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {['Name', 'Status', 'Audience', 'Channels', 'Launched'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c._id} className="border-b border-slate-100 hover:bg-indigo-50/40 dark:border-slate-800/50">
              <td className="px-3 py-2">
                <Link href={`/campaigns/${c._id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  {c.name}
                </Link>
              </td>
              <td className="px-3 py-2"><CampaignStatusBadge status={c.status} /></td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(c.totalRecipients ?? 0)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {Object.keys(c.audienceSnapshot?.channelMix ?? {}).slice(0, 3).map((ch) => (
                    <ChannelBadge key={ch} channel={ch} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2"><TimestampCell iso={c.launchedAt ?? c.createdAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
