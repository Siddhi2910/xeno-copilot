'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getSegmentCustomers } from '@/lib/api/segments';
import type { RfmSegment } from '@/lib/types/customer';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useSegmentCustomers(segmentName: RfmSegment) {
  return useInfiniteQuery({
    queryKey: queryKeys.segments.customers(segmentName),
    queryFn: ({ pageParam }) => getSegmentCustomers(segmentName, { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
