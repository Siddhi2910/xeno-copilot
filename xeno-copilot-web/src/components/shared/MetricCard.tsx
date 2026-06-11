import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

type MetricVariant = 'default' | 'success' | 'warning' | 'danger' | 'featured';

interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaLabel?: string;
  icon?: LucideIcon;
  variant?: MetricVariant;
  className?: string;
}

const variantStyles: Record<MetricVariant, string> = {
  default: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  success: 'border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900',
  warning: 'border-amber-200 bg-white dark:border-amber-900 dark:bg-slate-900',
  danger: 'border-rose-200 bg-white dark:border-rose-900 dark:bg-slate-900',
  featured:
    'border-transparent bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg',
};

export function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  variant = 'default',
  className,
}: MetricCardProps) {
  const featured = variant === 'featured';

  return (
    <div
      className={cn(
        'rounded-lg border p-6 shadow-sm transition-shadow hover:shadow-md',
        variantStyles[variant],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-xs font-medium uppercase tracking-wide',
            featured ? 'text-indigo-200' : 'text-slate-400',
          )}
        >
          {label}
        </p>
        {Icon ? (
          <Icon
            className={cn('h-4 w-4 shrink-0', featured ? 'text-indigo-200' : 'text-slate-400')}
            aria-hidden
          />
        ) : null}
      </div>
      <p
        className={cn(
          'mt-3 text-3xl font-bold tabular-nums',
          featured ? 'text-white' : 'text-slate-900 dark:text-slate-100',
        )}
      >
        {value}
      </p>
      {delta || deltaLabel ? (
        <p
          className={cn(
            'mt-2 text-xs',
            featured ? 'text-indigo-200' : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {delta}
          {delta && deltaLabel ? ' ' : ''}
          {deltaLabel}
        </p>
      ) : null}
    </div>
  );
}
