'use client';

import { motion } from 'framer-motion';
import { useRotatingCopy } from '@/lib/hooks/useRotatingCopy';

interface AiThinkingStateProps {
  phrases: readonly string[];
  className?: string;
}

export function AiThinkingState({ phrases, className }: AiThinkingStateProps) {
  const copy = useRotatingCopy([...phrases]);
  return (
    <div className={className} role="status" aria-live="polite">
      <div className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-indigo-400"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-indigo-600 dark:text-indigo-400">{copy}</p>
    </div>
  );
}
