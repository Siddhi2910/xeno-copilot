'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { launchCampaign, markCampaignReady } from '@/lib/api/campaigns';
import { queryKeys } from '@/lib/utils/queryKeys';
import { toast } from '@/lib/hooks/use-toast';

export function useMarkCampaignReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markCampaignReady(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      toast({ title: 'Campaign marked ready for review' });
    },
    onError: (err: Error) => toast({ title: 'Failed to mark ready', description: err.message, variant: 'destructive' }),
  });
}

export function useLaunchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string }) => launchCampaign(id, scheduledAt),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.campaigns.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.campaigns.stats(id) });
      qc.invalidateQueries({ queryKey: queryKeys.campaigns.all });
      toast({ title: 'Campaign launched' });
    },
    onError: (err: Error) => toast({ title: 'Launch failed', description: err.message, variant: 'destructive' }),
  });
}
