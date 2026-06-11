export type CampaignStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'LAUNCHING'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'FAILED';

export type MessageStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'OPENED'
  | 'CLICKED'
  | 'CONVERTED';

export interface AudienceSnapshot {
  count: number;
  medianAOV: number;
  channelMix: Record<string, number>;
  savedAt: string;
}

export interface RevenueEstimate {
  min: number;
  max: number;
  conversionRate: number;
  source: string;
}

export interface Campaign {
  _id: string;
  name: string;
  goalText: string;
  goalType: string;
  status: CampaignStatus;
  intentType?: string | null;
  intentParameters?: Record<string, unknown> | null;
  audienceSnapshot?: AudienceSnapshot | null;
  totalRecipients?: number | null;
  scheduledAt?: string | null;
  launchedAt?: string | null;
  completedAt?: string | null;
  revenueEstimate?: RevenueEstimate | null;
  aiReport?: string | null;
  aiReportGeneratedAt?: string | null;
  createdAt: string;
  draftSavedAt?: string | null;
}

export interface CampaignStats {
  campaignId: string;
  status: CampaignStatus;
  totalRecipients: number | null;
  stats: {
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
    converted: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  };
}

export interface CampaignMessage {
  _id: string;
  campaignId: string;
  clusterId: string;
  customerId: string;
  channel: string;
  recipient: string;
  status: MessageStatus;
  customerName?: string | null;
  customerPhone?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
}

export interface ClusterMessage {
  subject: string | null;
  body: string;
  ctaText: string | null;
  ctaUrl: string | null;
}

export interface CampaignCluster {
  _id: string;
  clusterLabel: string;
  clusterDescription: string | null;
  memberCount: number;
  assignedChannel: string;
  message: ClusterMessage;
  stats?: {
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    opened: number;
    clicked: number;
    converted: number;
  };
}
