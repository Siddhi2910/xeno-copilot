import { apiFetch } from '@/lib/api/client';
import type { PaginatedResponse } from '@/lib/types/api';
import type { Campaign, CampaignStats, CampaignMessage, CampaignStatus } from '@/lib/types/campaign';

export interface ListCampaignsParams {
  status?: CampaignStatus;
  cursor?: string;
  limit?: number;
}

export function listCampaigns(params: ListCampaignsParams = {}): Promise<PaginatedResponse<Campaign>> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<PaginatedResponse<Campaign>>(`campaigns${q ? `?${q}` : ''}`);
}

export function getCampaign(id: string): Promise<{ data: Campaign }> {
  return apiFetch<{ data: Campaign }>(`campaigns/${id}`);
}

export function getCampaignStats(id: string): Promise<{ data: CampaignStats }> {
  return apiFetch<{ data: CampaignStats }>(`campaigns/${id}/stats`);
}

export function getCampaignMessages(
  id: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<{ data: CampaignMessage[]; pagination: { hasMore: boolean; nextCursor: string | null } }> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch(`campaigns/${id}/messages${q ? `?${q}` : ''}`);
}

export function markCampaignReady(id: string): Promise<{ data: { campaignId: string; status: string } }> {
  return apiFetch(`campaigns/${id}/ready`, { method: 'POST', body: '{}' });
}

export function launchCampaign(
  id: string,
  scheduledAt?: string,
): Promise<{ data: { campaignId: string; status: string; jobsEnqueued: number } }> {
  return apiFetch(`campaigns/${id}/launch`, {
    method: 'POST',
    body: JSON.stringify(scheduledAt ? { scheduledAt } : {}),
  });
}
