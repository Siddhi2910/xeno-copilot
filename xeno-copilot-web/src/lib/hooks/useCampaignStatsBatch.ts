'use client';

import { useQueries } from '@tanstack/react-query';
import { getCampaignStats } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useCampaignStatsBatch(campaignIds: string[]) {
  return useQueries({
    queries: campaignIds.map((id) => ({
      queryKey: queryKeys.campaigns.stats(id),
      queryFn: async () => (await getCampaignStats(id)).data,
      staleTime: 60_000,
    })),
  });
}
