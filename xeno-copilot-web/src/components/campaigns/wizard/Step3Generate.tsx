'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    if (generatedResult || !intentResult?.intentType) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [generatedResult, intentResult, goalText, campaignName, setGeneratedResult, setCampaignId, cacheCampaign]);

  if (loading) {
    return (
      <div className="space-y-6">
        <p className="flex items-center gap-2 text-sm text-indigo-600"><Loader2 className="h-4 w-4 animate-spin" /> Generating campaign messages…</p>
        <SkeletonCards count={2} />
      </div>
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
