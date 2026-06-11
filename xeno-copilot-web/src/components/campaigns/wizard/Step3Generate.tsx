'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AiThinkingState } from '@/components/ai/AiThinkingState';
import { THINKING_COPY } from '@/lib/constants/aiCopy';
import { useUiStore } from '@/lib/stores/uiStore';
import { Input } from '@/components/ui/input';
import { ClusterCard } from '@/components/campaigns/ClusterCard';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { generateCampaign } from '@/lib/api/ai';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { toast } from '@/lib/hooks/use-toast';
import type { IntentType } from '@/lib/types/ai';

export function Step3Generate() {
  const {
    goalText, intentResult, campaignName, setCampaignName, generatedResult, setGeneratedResult,
    setCampaignId, cacheCampaign, setStep,
  } = useCampaignWizardStore();
  const [loading, setLoading] = useState(!generatedResult);
  const setAiThinking = useUiStore((s) => s.setAiThinking);

  useEffect(() => {
    if (generatedResult || !intentResult?.intentType) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAiThinking(true);
      try {
        const res = await generateCampaign({
          name: campaignName || intentResult.suggestedName || 'New Campaign',
          goalText,
          intentType: intentResult.intentType as IntentType,
          intentParameters: intentResult.parameters,
        });
        if (!cancelled) {
          setGeneratedResult(res.data);
          setCampaignId(res.data.campaignId);
          cacheCampaign(res.data.campaignId, { clusterCards: res.data.clusterCards, clusters: res.data.clusters });
        }
      } catch (err) {
        toast({ title: 'Generation failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAiThinking(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [generatedResult, intentResult, goalText, campaignName, setGeneratedResult, setCampaignId, cacheCampaign, setAiThinking]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="space-y-6 rounded-lg p-6">
        <AiThinkingState phrases={THINKING_COPY.generate} />
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <motion.div className="h-full bg-indigo-600" initial={{ width: '10%' }} animate={{ width: ['30%', '60%', '90%'] }} transition={{ duration: 8, ease: 'easeInOut' }} />
        </div>
        <SkeletonCards count={2} />
      </motion.div>
    );
  }

  if (!generatedResult) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Campaign Generated</h2>
      <div>
        <label className="text-sm text-slate-500">Campaign Name</label>
        <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} className="mt-1" />
      </div>
      <div className="grid gap-4">
        {generatedResult.clusterCards.map((card, i) => (
          <ClusterCard key={card.label} card={card} message={generatedResult.clusters[i]} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
        <Button variant="outline" onClick={() => setStep(5)}>Skip Refinement →</Button>
        <Button onClick={() => setStep(4)}>Refine Messages →</Button>
      </div>
    </div>
  );
}
