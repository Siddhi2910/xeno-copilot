'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listOrders, type ListOrdersParams } from '@/lib/api/orders';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useOrders(filters: ListOrdersParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: ({ pageParam }) => listOrders({ ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
  });
}
