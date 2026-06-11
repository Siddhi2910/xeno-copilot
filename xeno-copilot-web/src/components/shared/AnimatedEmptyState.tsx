'use client';

import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ComponentProps } from 'react';

export function AnimatedEmptyState(props: ComponentProps<typeof EmptyState>) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
      <EmptyState {...props} />
    </motion.div>
  );
}
