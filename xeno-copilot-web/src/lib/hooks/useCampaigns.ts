'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listCampaigns, type ListCampaignsParams } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useCampaigns(filters: ListCampaignsParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.campaigns.list(filters),
    queryFn: ({ pageParam }) => listCampaigns({ ...filters, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
