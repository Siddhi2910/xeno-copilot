import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface FilterBarProps {
  children: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}

export function FilterBar({ children, activeCount = 0, onClear, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {children}
      {activeCount > 0 && onClear ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-slate-500">
          <X className="h-3.5 w-3.5" />
          Clear filters
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {activeCount}
            </span>
          ) : null}
        </Button>
      ) : null}
    </div>
  );
}
