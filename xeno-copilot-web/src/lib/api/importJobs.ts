import { apiFetch } from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/types/api';
import type { ImportJob } from '@/lib/types/importJob';

export function listImportJobs(params: { cursor?: string; limit?: number } = {}): Promise<PaginatedResponse<ImportJob>> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<ImportJob>>(`import${q ? `?${q}` : ''}`);
}
