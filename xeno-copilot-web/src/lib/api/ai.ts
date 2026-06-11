import { apiFetch } from '@/lib/api/client';
import type {
  AIPreviewResult,
  CritiqueResult,
  GeneratedCampaignResult,
  IntentExtractionResult,
  IntentType,
} from '@/lib/types/ai';

export function extractIntent(goalText: string): Promise<{ data: IntentExtractionResult }> {
  return apiFetch('ai/intent-extract', { method: 'POST', body: JSON.stringify({ goalText }) });
}

export function previewAudienceWithAI(body: {
  goalText: string;
  intentType: IntentType;
  intentParameters: Record<string, unknown>;
}): Promise<{ data: AIPreviewResult }> {
  return apiFetch('ai/audience-preview', { method: 'POST', body: JSON.stringify(body) });
}

export function generateCampaign(body: {
  name: string;
  goalText: string;
  intentType: IntentType;
  intentParameters: Record<string, unknown>;
}): Promise<{ data: GeneratedCampaignResult }> {
  return apiFetch('ai/generate-campaign', { method: 'POST', body: JSON.stringify(body) });
}

export function refineCampaign(
  campaignId: string,
  userFeedback?: string,
): Promise<{ data: CritiqueResult }> {
  return apiFetch('ai/refine-campaign', {
    method: 'POST',
    body: JSON.stringify({ campaignId, userFeedback }),
  });
}
