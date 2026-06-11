'use client';

import { useQuery } from '@tanstack/react-query';
import { listOrders } from '@/lib/api/orders';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useAnalyticsOrders(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.analytics.orders(startDate, endDate),
    queryFn: () => listOrders({ startDate, endDate, limit: 200 }),
    enabled: Boolean(startDate && endDate),
    staleTime: 5 * 60_000,
  });
}
