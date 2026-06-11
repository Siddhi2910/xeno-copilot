import { cn } from '@/lib/utils/cn';
import { segmentColor } from '@/lib/utils/colors';
import type { RfmSegment } from '@/lib/types/customer';
import { RFM_SEGMENTS } from '@/lib/constants/segments';

interface RfmSegmentBadgeProps {
  segment: RfmSegment | null;
  className?: string;
}

export function RfmSegmentBadge({ segment, className }: RfmSegmentBadgeProps) {
  if (!segment) return <span className="text-slate-400">—</span>;
  const label = RFM_SEGMENTS.find((s) => s.value === segment)?.label ?? segment;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        segmentColor(segment),
        className,
      )}
    >
      {label}
    </span>
  );
}
