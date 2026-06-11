'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { listCustomers, type ListCustomersParams } from '@/lib/api/customers';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useCustomers(filters: ListCustomersParams) {
  return useInfiniteQuery({
    queryKey: queryKeys.customers.list(filters),
    queryFn: ({ pageParam }) => listCustomers({ ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
