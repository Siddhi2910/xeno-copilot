'use client';

import Link from 'next/link';
import { Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignStatusBadge } from '@/components/campaigns/CampaignStatusBadge';
import { ChannelBadge } from '@/components/shared/ChannelBadge';
import type { Campaign } from '@/lib/types/campaign';
import { formatDate, formatNumber } from '@/lib/utils/formatters';
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const mix = campaign.audienceSnapshot?.channelMix ?? {};
  const channels = Object.keys(mix).slice(0, 3);
  const date = campaign.launchedAt ?? campaign.createdAt;

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <CampaignStatusBadge status={campaign.status} />
        {channels.map((ch) => (
          <ChannelBadge key={ch} channel={ch} />
        ))}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">{campaign.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{campaign.goalText}</p>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {formatNumber(campaign.totalRecipients ?? 0)} recipients
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          {formatDate(date)}
        </span>
      </div>
      <div className="mt-4 flex gap-2">
        <Button asChild size="sm" className="flex-1">
          <Link href={`/campaigns/${campaign._id}`}>View Details</Link>
        </Button>
      </div>
    </div>
  );
}
