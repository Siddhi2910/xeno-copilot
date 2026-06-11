'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AiThinkingState } from '@/components/ai/AiThinkingState';
import { CritiqueDiff } from '@/components/ai/CritiqueDiff';
import { CritiqueIssueList } from '@/components/campaigns/CritiqueIssueList';
import { refineCampaign } from '@/lib/api/ai';
import { REFINE_PLACEHOLDERS, THINKING_COPY } from '@/lib/constants/aiCopy';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { useUiStore } from '@/lib/stores/uiStore';
import { toast } from '@/lib/hooks/use-toast';

export function Step4Refine() {
  const { campaignId, intentResult, refineResult, setRefineResult, setStep } = useCampaignWizardStore();
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const setAiThinking = useUiStore((s) => s.setAiThinking);
  const placeholder =
    REFINE_PLACEHOLDERS[intentResult?.intentType ?? ''] ?? 'Make the WhatsApp messages more casual…';

  async function handleRefine() {
    if (!campaignId) return;
    setLoading(true);
    setAiThinking(true);
    try {
      const res = await refineCampaign(campaignId, feedback || undefined);
      setRefineResult(res.data);
    } catch (err) {
      toast({ title: 'Refinement failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
      setAiThinking(false);
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
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <Button onClick={handleRefine} disabled={loading}>
        {loading ? 'Stop thinking ×' : 'Run Refinement →'}
      </Button>
      {loading ? <AiThinkingState phrases={THINKING_COPY.critique} /> : null}
      {refineResult ? (
        <div className="space-y-4">
          <CritiqueIssueList issues={refineResult.deterministicIssues} />
          {refineResult.critiqueNotes ? <p className="text-sm text-slate-600 dark:text-slate-400">{refineResult.critiqueNotes}</p> : null}
          <CritiqueDiff changes={refineResult.changesApplied} />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
        <Button onClick={() => setStep(5)}>Continue to Launch →</Button>
      </div>
    </div>
  );
}
