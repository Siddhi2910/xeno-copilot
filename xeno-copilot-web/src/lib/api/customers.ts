import { apiFetch } from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/types/api';
import type { Channel, Customer, RfmSegment } from '@/lib/types/customer';

export interface ListCustomersParams {
  rfmSegment?: RfmSegment;
  tag?: string;
  channel?: Channel;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function listCustomers(params: ListCustomersParams = {}): Promise<PaginatedResponse<Customer>> {
  const qs = new URLSearchParams();
  if (params.rfmSegment) qs.set('rfmSegment', params.rfmSegment);
  if (params.tag) qs.set('tag', params.tag);
  if (params.channel) qs.set('channel', params.channel);
  if (params.search) qs.set('search', params.search);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<Customer>>(`customers${q ? `?${q}` : ''}`);
}
