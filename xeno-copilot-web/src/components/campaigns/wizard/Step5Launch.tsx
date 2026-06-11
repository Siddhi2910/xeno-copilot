'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ChannelMixBar } from '@/components/campaigns/ChannelMixBar';
import { RevenueEstimatePanel } from '@/components/campaigns/RevenueEstimatePanel';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { useLaunchCampaign, useMarkCampaignReady } from '@/lib/hooks/useCampaignMutations';
import { formatNumber } from '@/lib/utils/formatters';

export function Step5Launch() {
  const router = useRouter();
  const { campaignId, campaignName, generatedResult, audiencePreview, setStep } = useCampaignWizardStore();
  const preview = generatedResult ?? audiencePreview;
  const markReady = useMarkCampaignReady();
  const launch = useLaunchCampaign();
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ready, setReady] = useState(false);

  async function handleReady() {
    if (!campaignId) return;
    await markReady.mutateAsync(campaignId);
    setReady(true);
  }

  async function handleLaunch() {
    if (!campaignId) return;
    const at = schedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
    await launch.mutateAsync({ id: campaignId, scheduledAt: at });
    setConfirmOpen(false);
    router.push(`/campaigns/${campaignId}`);
  }

  if (!campaignId || !preview) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Ready to Launch</h2>
      <div className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Name</dt><dd>{campaignName}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Audience</dt><dd>{formatNumber(preview.audience.count)} customers</dd></div>
          <div><dt className="text-slate-500">Channel Mix</dt><dd className="mt-1"><ChannelMixBar channelMix={preview.audience.channelMix} /></dd></div>
          <div><dt className="text-slate-500">Revenue Est.</dt><dd className="mt-1"><RevenueEstimatePanel estimate={preview.revenueEstimate} /></dd></div>
        </dl>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={!schedule} onChange={() => setSchedule(false)} /> Launch immediately
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={schedule} onChange={() => setSchedule(true)} /> Schedule for later
        </label>
        {schedule ? (
          <div>
            <Label htmlFor="sched">Schedule</Label>
            <Input id="sched" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 max-w-xs" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setStep(4)}>← Back</Button>
        {!ready ? (
          <Button onClick={handleReady} disabled={markReady.isPending}>
            {markReady.isPending ? <Loader2 className="animate-spin" /> : null}
            Mark as Ready
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} disabled={launch.isPending}>
            Launch Campaign
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Launch campaign?"
        description={`This will dispatch messages to ${formatNumber(preview.audience.count)} recipients.`}
        confirmLabel="Launch"
        onConfirm={handleLaunch}
        onCancel={() => setConfirmOpen(false)}
        loading={launch.isPending}
      />
    </div>
  );
}
