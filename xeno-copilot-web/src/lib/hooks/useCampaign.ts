'use client';

import { useQuery } from '@tanstack/react-query';
import { getCampaign } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useCampaign(id: string) {
  return useQuery({
    queryKey: queryKeys.campaigns.detail(id),
    queryFn: async () => {
      const res = await getCampaign(id);
      return res.data;
    },
    staleTime: 30_000,
  });
}
