'use client';

import { ChannelBadge } from '@/components/shared/ChannelBadge';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { MessagePreviewCard } from '@/components/campaigns/MessagePreviewCard';
import type { ClusterCard as ClusterCardType, GeneratedCluster } from '@/lib/types/ai';
import type { RfmSegment } from '@/lib/types/customer';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';

interface ClusterCardProps {
  card: ClusterCardType;
  message?: GeneratedCluster;
  assignedChannel?: string;
  preview?: boolean;
}

export function ClusterCard({ card, message, assignedChannel, preview }: ClusterCardProps) {
  const ch = assignedChannel ?? 'WHATSAPP';
  const isEmail = ch === 'EMAIL';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RfmSegmentBadge segment={card.rfmSegment as RfmSegment} />
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{card.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <ChannelBadge channel={ch} />
          <span className="text-sm text-slate-500">{formatNumber(card.count)} people</span>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
        {card.toneRecommendation ? <p>Tone: {card.toneRecommendation}</p> : null}
        <p>Avg spend: {formatCurrency(card.avgSpend)}</p>
        {card.reachability ? <p>{card.reachability}</p> : null}
        {card.persona ? (
          <p className="italic text-slate-500">
            Persona: {card.persona.description ?? `${card.persona.name}, ${card.persona.ageRange}`}
          </p>
        ) : null}
      </div>
      {!preview && message ? (
        <div className="mt-4">
          <MessagePreviewCard
            channel={isEmail ? 'EMAIL' : 'WHATSAPP'}
            whatsapp={message.whatsappMessage}
            email={message.emailMessage}
          />
        </div>
      ) : null}
    </div>
  );
}
