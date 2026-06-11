'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AiThinkingState } from '@/components/ai/AiThinkingState';
import { THINKING_COPY } from '@/lib/constants/aiCopy';
import { useUiStore } from '@/lib/stores/uiStore';
import { MetricCard } from '@/components/shared/MetricCard';
import { ChannelMixBar } from '@/components/campaigns/ChannelMixBar';
import { ClusterCard } from '@/components/campaigns/ClusterCard';
import { RevenueEstimatePanel } from '@/components/campaigns/RevenueEstimatePanel';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { previewAudienceWithAI } from '@/lib/api/ai';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { toast } from '@/lib/hooks/use-toast';
import { formatNumber } from '@/lib/utils/formatters';
import type { IntentType } from '@/lib/types/ai';

export function Step2Preview() {
  const { goalText, intentResult, audiencePreview, setAudiencePreview, setStep } = useCampaignWizardStore();
  const [loading, setLoading] = useState(!audiencePreview);
  const setAiThinking = useUiStore((s) => s.setAiThinking);

  useEffect(() => {
    if (audiencePreview || !intentResult?.intentType) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAiThinking(true);
      try {
        const res = await previewAudienceWithAI({
          goalText,
          intentType: intentResult.intentType as IntentType,
          intentParameters: intentResult.parameters,
        });
        if (!cancelled) setAudiencePreview(res.data);
      } catch (err) {
        toast({ title: 'Audience preview failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAiThinking(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [audiencePreview, intentResult, goalText, setAudiencePreview, setAiThinking]);

  if (loading) {
    return (
      <div className="space-y-6">
        <AiThinkingState phrases={THINKING_COPY.preview} />
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (!audiencePreview) return null;

  const { audience, clusterCards, revenueEstimate } = audiencePreview;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Your audience</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <MetricCard label="Audience Size" value={formatNumber(audience.count)} variant="featured" />
        </motion.div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Revenue Estimate</p>
          <div className="mt-3"><RevenueEstimatePanel estimate={revenueEstimate} /></div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel Mix</p>
          <div className="mt-3"><ChannelMixBar channelMix={audience.channelMix} /></div>
        </div>
      </div>
      {audience.narrative ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          {audience.narrative}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {clusterCards.map((card) => (
          <ClusterCard key={card.label} card={card} preview />
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
        <Button onClick={() => setStep(3)}>Generate Campaign →</Button>
      </div>
    </div>
  );
}
