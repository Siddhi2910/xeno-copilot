import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface ErrorStateProps {
  heading?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  heading = 'Failed to load',
  description = 'Something went wrong. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}>
      <AlertCircle className="h-10 w-10 text-rose-500" />
      <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{heading}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      {onRetry ? (
        <Button type="button" className="mt-4" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
