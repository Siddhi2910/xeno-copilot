'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CritiqueIssueList } from '@/components/campaigns/CritiqueIssueList';
import { refineCampaign } from '@/lib/api/ai';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { toast } from '@/lib/hooks/use-toast';

export function Step4Refine() {
  const { campaignId, refineResult, setRefineResult, setStep } = useCampaignWizardStore();
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRefine() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const res = await refineCampaign(campaignId, feedback || undefined);
      setRefineResult(res.data);
    } catch (err) {
      toast({ title: 'Refinement failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Refine Your Messages</h2>
      <p className="text-sm text-slate-500">Optional — describe any changes you want.</p>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Make the WhatsApp messages more casual…"
        className="w-full rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <Button onClick={handleRefine} disabled={loading}>
        {loading ? <><Loader2 className="animate-spin" /> Reviewing…</> : 'Run Refinement →'}
      </Button>
      {refineResult ? (
        <div className="space-y-4">
          <CritiqueIssueList issues={refineResult.deterministicIssues} />
          {refineResult.critiqueNotes ? <p className="text-sm text-slate-600">{refineResult.critiqueNotes}</p> : null}
          {refineResult.changesApplied.map((c) => (
            <div key={`${c.clusterLabel}-${c.channel}`} className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
              <p className="font-medium">{c.clusterLabel} / {c.channel}</p>
              <p className="mt-1 text-slate-500 line-through">{c.before.slice(0, 80)}…</p>
              <p className="text-slate-700 dark:text-slate-300">{c.after.slice(0, 80)}…</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
        <Button onClick={() => setStep(5)}>Continue to Launch →</Button>
      </div>
    </div>
  );
}
