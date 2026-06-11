import { StatusBadge } from '@/components/shared/StatusBadge';
import type { CampaignStatus } from '@/lib/types/campaign';

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <StatusBadge status={status} />;
}
