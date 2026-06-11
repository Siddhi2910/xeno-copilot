import { apiFetch } from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/types/api';
import type { Customer, RfmSegment } from '@/lib/types/customer';
import type { SegmentsResponse } from '@/lib/types/segment';

export function listSegments(): Promise<{ data: SegmentsResponse }> {
  return apiFetch<{ data: SegmentsResponse }>('segments');
}

export function getSegmentCustomers(
  segmentName: RfmSegment,
  params: { cursor?: string; limit?: number } = {},
): Promise<PaginatedResponse<Customer>> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<Customer>>(`segments/${segmentName}/customers${q ? `?${q}` : ''}`);
}
