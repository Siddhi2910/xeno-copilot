'use client';

import { create } from 'zustand';
import type { AIPreviewResult, CritiqueResult, GeneratedCampaignResult, IntentExtractionResult } from '@/lib/types/ai';
import type { GeneratedCluster, ClusterCard } from '@/lib/types/ai';

interface CampaignCache {
  clusterCards: ClusterCard[];
  clusters: GeneratedCluster[];
}

interface CampaignWizardState {
  step: number;
  goalText: string;
  intentResult: IntentExtractionResult | null;
  audiencePreview: AIPreviewResult | null;
  campaignId: string | null;
  campaignName: string;
  generatedResult: GeneratedCampaignResult | null;
  refineResult: CritiqueResult | null;
  campaignCache: Record<string, CampaignCache>;
  setStep: (step: number) => void;
  setGoalText: (text: string) => void;
  setIntentResult: (r: IntentExtractionResult | null) => void;
  setAudiencePreview: (r: AIPreviewResult | null) => void;
  setCampaignId: (id: string | null) => void;
  setCampaignName: (name: string) => void;
  setGeneratedResult: (r: GeneratedCampaignResult | null) => void;
  setRefineResult: (r: CritiqueResult | null) => void;
  cacheCampaign: (id: string, data: CampaignCache) => void;
  reset: () => void;
}

const initial = {
  step: 1,
  goalText: '',
  intentResult: null,
  audiencePreview: null,
  campaignId: null,
  campaignName: '',
  generatedResult: null,
  refineResult: null,
  campaignCache: {} as Record<string, CampaignCache>,
};

export const useCampaignWizardStore = create<CampaignWizardState>((set) => ({
  ...initial,
  setStep: (step) => set({ step }),
  setGoalText: (goalText) => set({ goalText }),
  setIntentResult: (intentResult) => set({ intentResult }),
  setAudiencePreview: (audiencePreview) => set({ audiencePreview }),
  setCampaignId: (campaignId) => set({ campaignId }),
  setCampaignName: (campaignName) => set({ campaignName }),
  setGeneratedResult: (generatedResult) => set({ generatedResult }),
  setRefineResult: (refineResult) => set({ refineResult }),
  cacheCampaign: (id, data) =>
    set((s) => ({ campaignCache: { ...s.campaignCache, [id]: data } })),
  reset: () => set(initial),
}));
