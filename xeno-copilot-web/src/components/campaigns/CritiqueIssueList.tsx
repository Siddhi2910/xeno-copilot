import type { CritiqueIssue } from '@/lib/types/ai';
import { cn } from '@/lib/utils/cn';

export function CritiqueIssueList({ issues }: { issues: CritiqueIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-2">
      {issues.map((issue) => (
        <li
          key={`${issue.ruleId}-${issue.cluster}`}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            issue.severity === 'HIGH'
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30',
          )}
        >
          <span className="font-mono text-xs">{issue.ruleId}</span> · {issue.message}
        </li>
      ))}
    </ul>
  );
}
