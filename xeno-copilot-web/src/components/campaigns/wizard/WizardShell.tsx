'use client';

import { cn } from '@/lib/utils/cn';

const STEPS = ['Goal', 'Preview', 'Generate', 'Refine', 'Launch'];

export function WizardShell({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 ? <span className="text-slate-300">→</span> : null}
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                  active && 'bg-indigo-600 text-white',
                  done && 'bg-indigo-100 text-indigo-700',
                  !active && !done && 'bg-slate-100 text-slate-400',
                )}
              >
                {n}
              </span>
              <span className={cn(active ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-500')}>
                {label}
              </span>
            </div>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
