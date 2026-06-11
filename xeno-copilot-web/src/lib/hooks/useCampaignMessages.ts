'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getCampaignMessages } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useCampaignMessages(campaignId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.campaigns.messages(campaignId),
    queryFn: ({ pageParam }) => getCampaignMessages(campaignId, { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
