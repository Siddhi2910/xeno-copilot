'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { CampaignStatusBadge } from '@/components/campaigns/CampaignStatusBadge';
import { ChannelMixBar } from '@/components/campaigns/ChannelMixBar';
import { RevenueEstimatePanel } from '@/components/campaigns/RevenueEstimatePanel';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { ClusterCard } from '@/components/campaigns/ClusterCard';
import { AiReportViewer } from '@/components/ai/AiReportViewer';
import { AiRecommendations } from '@/components/ai/AiRecommendations';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { Button } from '@/components/ui/button';
import { useCampaign } from '@/lib/hooks/useCampaign';
import { useCampaignStats } from '@/lib/hooks/useCampaignStats';
import { useLaunchCampaign, useMarkCampaignReady } from '@/lib/hooks/useCampaignMutations';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { formatDate, formatNumber } from '@/lib/utils/formatters';

export default function CampaignDetailPage({ params }: { params: { campaignId: string } }) {
  const { campaignId } = params;
  const router = useRouter();
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const { data: stats, isLoading: statsLoading } = useCampaignStats(campaignId, campaign?.status);
  const cache = useCampaignWizardStore((s) => s.campaignCache[campaignId]);
  const markReady = useMarkCampaignReady();
  const launch = useLaunchCampaign();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) return <SkeletonCards count={4} />;
  if (!campaign) return <p className="text-slate-500">Campaign not found.</p>;

  const snap = campaign.audienceSnapshot;
  const canReady = campaign.status === 'DRAFT';
  const canLaunch = campaign.status === 'READY_FOR_REVIEW';

  async function handleLaunch() {
    await launch.mutateAsync({ id: campaignId });
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.goalText} · Created ${formatDate(campaign.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <Button asChild variant="outline" size="sm">
              <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
          </div>
        }
      />

      <AiRecommendations campaign={campaign} />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Audience Size" value={formatNumber(campaign.totalRecipients ?? snap?.count ?? 0)} variant="featured" />
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Revenue Estimate</p>
          <div className="mt-3">
            {campaign.revenueEstimate ? <RevenueEstimatePanel estimate={campaign.revenueEstimate} /> : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel Mix</p>
          <div className="mt-3">{snap ? <ChannelMixBar channelMix={snap.channelMix} /> : '—'}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-slate-900 dark:text-slate-100">Funnel Performance</h2>
            {campaign.status === 'ACTIVE' ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live</span>
            ) : null}
          </div>
          {stats ? (
            <FunnelChart stats={stats.stats} rates={stats.rates} isLoading={statsLoading} />
          ) : (
            <p className="text-sm text-slate-500">Stats available after launch.</p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 font-medium">Metadata</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Goal</dt><dd>{campaign.goalType}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><CampaignStatusBadge status={campaign.status} /></dd></div>
            {campaign.launchedAt ? <div className="flex justify-between"><dt className="text-slate-500">Launched</dt><dd>{formatDate(campaign.launchedAt)}</dd></div> : null}
            {campaign.scheduledAt ? <div className="flex justify-between"><dt className="text-slate-500">Scheduled</dt><dd>{formatDate(campaign.scheduledAt)}</dd></div> : null}
          </dl>
        </div>
      </div>

      {cache ? (
        <div className="space-y-4">
          <h2 className="font-medium">Clusters</h2>
          <div className="grid gap-4">
            {cache.clusterCards.map((card, i) => (
              <ClusterCard key={card.label} card={card} message={cache.clusters[i]} />
            ))}
          </div>
        </div>
      ) : null}

      {campaign.aiReport ? <AiReportViewer report={campaign.aiReport} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/campaigns/${campaignId}/messages`}>View All Messages →</Link>
        </Button>
        {canReady ? (
          <Button onClick={() => markReady.mutate(campaignId)} disabled={markReady.isPending}>
            {markReady.isPending ? <Loader2 className="animate-spin" /> : null}
            Mark as Ready
          </Button>
        ) : null}
        {canLaunch ? (
          <Button onClick={() => setConfirmOpen(true)}>Launch Now</Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Launch campaign?"
        description="This will dispatch messages to all recipients."
        confirmLabel="Launch"
        onConfirm={handleLaunch}
        onCancel={() => setConfirmOpen(false)}
        loading={launch.isPending}
      />
    </div>
  );
}
