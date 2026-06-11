import type { RevenueEstimate } from '@/lib/types/campaign';

export type IntentType =
  | 'WIN_BACK_DORMANT'
  | 'REWARD_TOP_SPENDERS'
  | 'RE_ENGAGE_SINGLE_PURCHASE'
  | 'UPSELL_CATEGORY'
  | 'VIP_LOYALTY';

export interface IntentExtractionResult {
  intentType: string | null;
  parameters: Record<string, unknown>;
  confirmationText: string;
  suggestedName: string | null;
  aiLogId: string | null;
}

export interface PersonaCard {
  name: string;
  ageRange: string;
  description: string;
}

export interface ClusterCard {
  label: string;
  count: number;
  rfmSegment: string;
  avgSpend: number;
  reachability: string;
  toneRecommendation: string;
  persona: PersonaCard | null;
}

export interface AudienceCluster {
  label: string;
  rfmSegment?: string;
  count?: number;
  avgSpend?: number;
  channels?: Record<string, number>;
}

export interface AudienceData {
  count: number;
  medianAOV: number;
  channelMix: Record<string, number>;
  narrative?: string;
  narrativeValid?: boolean;
  clusters?: AudienceCluster[];
}

export interface WhatsAppMessage {
  body: string;
  characterCount?: number;
  ctaUrl: string;
  subject?: null;
}

export interface EmailMessage {
  subject: string;
  preheader?: string;
  body: string;
  ctaUrl: string;
}

export interface GeneratedCluster {
  label: string;
  whatsappMessage: WhatsAppMessage;
  emailMessage: EmailMessage;
}

export interface AIPreviewResult {
  audience: AudienceData;
  clusterCards: ClusterCard[];
  clusters: GeneratedCluster[];
  messageWarnings?: string[];
  revenueEstimate: RevenueEstimate;
}

export interface GeneratedCampaignResult {
  campaignId: string;
  status: string;
  audience: AudienceData;
  clusterCards: ClusterCard[];
  clusters: GeneratedCluster[];
  messageWarnings?: string[];
  revenueEstimate: RevenueEstimate;
}

export interface CritiqueIssue {
  ruleId: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  cluster: string;
  channel: string;
}

export interface ChangeRecord {
  clusterLabel: string;
  channel: string;
  change: string;
  before: string;
  after: string;
}

export interface CritiqueResult {
  critiqueApplied: boolean;
  deterministicIssues: CritiqueIssue[];
  critiqueNotes: string;
  changesApplied: ChangeRecord[];
  refinedMessages: Record<string, { whatsappMessage: { body: string }; emailMessage: { subject: string; body: string } }>;
  aiLogId: string | null;
}
