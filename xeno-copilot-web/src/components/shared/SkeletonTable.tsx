import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  className?: string;
}

export function SkeletonTable({ columns = 6, rows = 8, className }: SkeletonTableProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${60 + (i % 3) * 20}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-100 px-4 py-4 dark:border-slate-800/50">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4" style={{ width: `${50 + ((r + c) % 4) * 25}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
