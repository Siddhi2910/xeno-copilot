'use client';

import { useQuery } from '@tanstack/react-query';
import { listSegments } from '@/lib/api/segments';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useSegments() {
  return useQuery({
    queryKey: queryKeys.segments.list(),
    queryFn: async () => {
      const res = await listSegments();
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}
