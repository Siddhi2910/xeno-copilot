import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface CursorPaginationProps {
  loadedCount: number;
  total?: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  className?: string;
}

export function CursorPagination({
  loadedCount,
  total,
  hasMore,
  isLoadingMore,
  onLoadMore,
  className,
}: CursorPaginationProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800', className)}>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing {loadedCount}
        {total != null ? ` of ${total}` : ''}
      </p>
      {hasMore ? (
        <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
          {isLoadingMore ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </>
          ) : (
            'Load More'
          )}
        </Button>
      ) : null}
    </div>
  );
}
