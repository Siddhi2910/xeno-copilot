'use client';

import { motion } from 'framer-motion';
import { Lightbulb, Sparkles } from 'lucide-react';
import type { Campaign } from '@/lib/types/campaign';

const TIPS: Record<string, string> = {
  DRAFT: 'Mark as ready after reviewing messages, then launch when your audience is primed.',
  READY_FOR_REVIEW: 'Your campaign is ready — launch now or schedule for peak engagement hours.',
  ACTIVE: 'Monitor funnel metrics; conversion data updates every 15 seconds.',
  COMPLETED: 'Review the AI post-campaign report for segment-level insights.',
};

export function AiRecommendations({ campaign }: { campaign: Campaign }) {
  const tip = TIPS[campaign.status] ?? 'Create a new campaign to reach more customers.';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"
      role="region"
      aria-label="AI recommendations"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
        <div className="flex-1">
          <p className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden />
            AI Recommendation
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{tip}</p>
        </div>
      </div>
    </motion.div>
  );
}
