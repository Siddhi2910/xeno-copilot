'use client';

import { useState } from 'react';
import type { CritiqueIssue } from '@/lib/types/ai';
import { cn } from '@/lib/utils/cn';

function IssueCard({ issue, defaultOpen }: { issue: CritiqueIssue; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const styles =
    issue.severity === 'HIGH'
      ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30'
      : issue.severity === 'MEDIUM'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50';

  return (
    <li className={cn('rounded-md border px-3 py-2 text-sm', styles)}>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left font-medium"
        onClick={() => issue.severity !== 'HIGH' && setOpen(!open)}
        aria-expanded={open}
      >
        <span><span className="font-mono text-xs">{issue.ruleId}</span> · {issue.message}</span>
        {issue.severity !== 'HIGH' ? <span className="text-xs">{open ? '−' : '+'}</span> : null}
      </button>
      {open ? <p className="mt-1 text-xs opacity-80">{issue.cluster} / {issue.channel}</p> : null}
    </li>
  );
}

export function CritiqueIssueList({ issues }: { issues: CritiqueIssue[] }) {
  if (!issues.length) return null;
  const mediumCount = issues.filter((i) => i.severity === 'MEDIUM').length;
  return (
    <ul className="space-y-2" role="list" aria-label="Critique issues">
      {issues.map((issue) => (
        <IssueCard
          key={`${issue.ruleId}-${issue.cluster}`}
          issue={issue}
          defaultOpen={issue.severity === 'HIGH' || (issue.severity === 'MEDIUM' && mediumCount <= 2)}
        />
      ))}
    </ul>
  );
}
