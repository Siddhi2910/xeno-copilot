import { formatDate } from '@/lib/utils/formatters';

interface TimestampCellProps {
  iso: string | null | undefined;
}

export function TimestampCell({ iso }: TimestampCellProps) {
  if (!iso) return <span className="text-slate-400">—</span>;
  return (
    <time dateTime={iso} title={iso} className="text-sm text-slate-700 dark:text-slate-300">
      {formatDate(iso)}
    </time>
  );
}
