import { cn } from '@/lib/utils/cn';
import { CAMPAIGN_STATUS_META, IMPORT_STATUS_META, MESSAGE_STATUS_META } from '@/lib/constants/statuses';
import type { CampaignStatus, MessageStatus } from '@/lib/types/campaign';

interface StatusBadgeProps {
  status: CampaignStatus | MessageStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta =
    status in CAMPAIGN_STATUS_META
      ? CAMPAIGN_STATUS_META[status as CampaignStatus]
      : status in IMPORT_STATUS_META
        ? IMPORT_STATUS_META[status]
        : MESSAGE_STATUS_META[status as MessageStatus];
  if (!meta) return <span className="text-slate-400">{status}</span>;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', meta.className, className)}>
      {meta.label}
    </span>
  );
}
