import type { ChangeRecord } from '@/lib/types/ai';

export function CritiqueDiff({ changes }: { changes: ChangeRecord[] }) {
  if (!changes.length) return null;
  return (
    <div className="space-y-3" role="region" aria-label="Applied changes">
      {changes.map((c) => (
        <div key={`${c.clusterLabel}-${c.channel}`} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
          <p className="font-medium text-slate-900 dark:text-slate-100">{c.clusterLabel} / {c.channel}</p>
          <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-rose-800 line-through dark:bg-rose-950/40 dark:text-rose-300">{c.before}</p>
          <p className="mt-1 rounded bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{c.after}</p>
        </div>
      ))}
    </div>
  );
}
