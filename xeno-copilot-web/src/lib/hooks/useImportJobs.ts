'use client';

import { useQuery } from '@tanstack/react-query';
import { listImportJobs } from '@/lib/api/importJobs';
import { queryKeys } from '@/lib/utils/queryKeys';

export function useImportJobs(limit = 5) {
  return useQuery({
    queryKey: queryKeys.importJobs.list(limit),
    queryFn: () => listImportJobs({ limit }),
    staleTime: 30_000,
  });
}
