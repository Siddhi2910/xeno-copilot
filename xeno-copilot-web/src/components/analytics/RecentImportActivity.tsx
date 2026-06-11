import Link from 'next/link';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import type { ImportJob } from '@/lib/types/importJob';
import { formatNumber } from '@/lib/utils/formatters';

export function RecentImportActivity({ jobs }: { jobs: ImportJob[] }) {
  if (!jobs.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No imports yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {jobs.map((job) => (
        <li key={job._id} className="flex items-center justify-between gap-2 py-3">
          <div>
            <Link href={`/import/${job._id}`} className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              {job.filename}
            </Link>
            <p className="text-xs text-slate-500">
              {job.type} · {formatNumber(job.imported)} imported
            </p>
          </div>
          <div className="text-right">
            <StatusBadge status={job.status} />
            <div className="mt-1 text-xs"><TimestampCell iso={job.createdAt} /></div>
          </div>
        </li>
      ))}
    </ul>
  );
}
