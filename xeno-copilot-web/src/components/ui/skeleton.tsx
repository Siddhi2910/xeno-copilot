import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md bg-slate-200/80 dark:bg-slate-700/50', className)}
      {...props}
    />
  );
}

export { Skeleton };
