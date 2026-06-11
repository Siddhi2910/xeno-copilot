'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useUiStore } from '@/lib/stores/uiStore';
import { cn } from '@/lib/utils/cn';

interface AiCopilotPanelProps {
  step: number;
  totalSteps?: number;
}

export function AiCopilotPanel({ step, totalSteps = 4 }: AiCopilotPanelProps) {
  const thinking = useUiStore((s) => s.aiThinking);
  if (step > 5) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed right-4 top-20 z-40 hidden rounded-lg border border-indigo-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur sm:block dark:border-indigo-900 dark:bg-slate-900/95 md:right-8"
      aria-label="AI Copilot status"
    >
      <div className="flex items-center gap-2 text-xs">
        <motion.span animate={thinking ? { scale: [1, 1.2, 1] } : {}} transition={{ repeat: thinking ? Infinity : 0, duration: 1 }}>
          <Sparkles className={cn('h-3.5 w-3.5', thinking ? 'text-indigo-500' : 'text-indigo-400')} aria-hidden />
        </motion.span>
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">Copilot Active</p>
          <p className="text-slate-500">Call {Math.min(step, totalSteps)}/{totalSteps} complete</p>
        </div>
      </div>
    </motion.aside>
  );
}
