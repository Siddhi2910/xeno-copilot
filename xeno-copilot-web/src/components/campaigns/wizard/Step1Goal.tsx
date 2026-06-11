'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractIntent } from '@/lib/api/ai';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';
import { toast } from '@/lib/hooks/use-toast';
const PROMPTS = [
  'Re-engage dormant VIP customers',
  'Reward my top spenders this month',
  'Reach customers who only ordered once',
];

export function Step1Goal() {
  const { goalText, intentResult, setGoalText, setIntentResult, setCampaignName, setStep } = useCampaignWizardStore();
  const [loading, setLoading] = useState(false);

  async function handleExtract() {
    setLoading(true);
    try {
      const res = await extractIntent(goalText);
      setIntentResult(res.data);
      if (res.data.suggestedName) setCampaignName(res.data.suggestedName);
    } catch (err) {
      toast({ title: 'Intent extraction failed', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">What do you want to achieve?</h2>
        <p className="mt-1 text-sm text-slate-500">Describe your marketing goal in plain language.</p>
      </div>
      <textarea
        value={goalText}
        onChange={(e) => setGoalText(e.target.value)}
        rows={5}
        maxLength={500}
        placeholder="Win back customers who haven't ordered in 90 days…"
        className="w-full rounded-lg border border-slate-200 bg-white p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setGoalText(p)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700"
          >
            {p}
          </button>
        ))}
      </div>
      <p className="text-right text-xs text-slate-400">{goalText.length}/500</p>
      <Button onClick={handleExtract} disabled={goalText.length < 5 || loading}>
        {loading ? <><Loader2 className="animate-spin" /> Analyzing your goal…</> : 'Extract Intent →'}
      </Button>
      {intentResult?.intentType ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="flex items-center gap-2 font-medium text-indigo-700 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" /> {intentResult.intentType.replace(/_/g, ' ')}
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{intentResult.confirmationText}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setIntentResult(null)}>← Edit Goal</Button>
            <Button onClick={() => setStep(2)}>Continue to Preview →</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
