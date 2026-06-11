'use client';

import { useQuery } from '@tanstack/react-query';
import { getCampaignStats } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';
import type { CampaignStatus } from '@/lib/types/campaign';

export function useCampaignStats(id: string, status?: CampaignStatus) {
  return useQuery({
    queryKey: queryKeys.campaigns.stats(id),
    queryFn: async () => {
      const res = await getCampaignStats(id);
      return res.data;
    },
    staleTime: status === 'ACTIVE' ? 15_000 : 10 * 60_000,
    refetchInterval: status === 'ACTIVE' ? 15_000 : false,
  });
}
