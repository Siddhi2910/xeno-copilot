import { apiFetch } from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/types/api';
import type { Order, OrderChannel } from '@/lib/types/order';

export interface ListOrdersParams {
  customerId?: string;
  channel?: OrderChannel;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export function listOrders(params: ListOrdersParams = {}): Promise<PaginatedResponse<Order>> {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set('customerId', params.customerId);
  if (params.channel) qs.set('channel', params.channel);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<Order>>(`orders${q ? `?${q}` : ''}`);
}
