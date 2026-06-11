import type { RfmSegment } from '@/lib/types/customer';

export const RFM_SEGMENTS: { value: RfmSegment; label: string }[] = [
  { value: 'CHAMPIONS', label: 'Champions' },
  { value: 'PROMISING', label: 'Promising' },
  { value: 'AT_RISK_LOYALISTS', label: 'At Risk Loyalists' },
  { value: 'DORMANT_VIPS', label: 'Dormant VIPs' },
  { value: 'LAPSED_LOW_VALUE', label: 'Lapsed Low Value' },
  { value: 'GENERAL', label: 'General' },
];

export const SEGMENT_DESCRIPTIONS: Record<RfmSegment, string> = {
  CHAMPIONS: 'Highest-value, most active. They order frequently and spend above average. Treat them as VIPs.',
  PROMISING: 'Strong potential. Recent buyers with growing order frequency. Prime for loyalty programs.',
  AT_RISK_LOYALISTS: 'Previously loyal, now slowing down. A well-timed campaign can win them back.',
  DORMANT_VIPS: 'High-value customers who have gone quiet. High re-engagement ROI.',
  LAPSED_LOW_VALUE: 'Low engagement and spend. Focus on reactivation for a subset, not the full group.',
  GENERAL: 'Mixed profile. Good for broad announcements and discovery campaigns.',
};

export const SEGMENT_CHART_COLORS: Record<RfmSegment, string> = {
  CHAMPIONS: '#10b981',
  PROMISING: '#0ea5e9',
  AT_RISK_LOYALISTS: '#f59e0b',
  DORMANT_VIPS: '#8b5cf6',
  LAPSED_LOW_VALUE: '#94a3b8',
  GENERAL: '#64748b',
};

export const SEGMENT_HERO_BG: Record<RfmSegment, string> = {
  CHAMPIONS: 'bg-emerald-500/5',
  PROMISING: 'bg-sky-500/5',
  AT_RISK_LOYALISTS: 'bg-amber-500/5',
  DORMANT_VIPS: 'bg-violet-500/5',
  LAPSED_LOW_VALUE: 'bg-slate-500/5',
  GENERAL: 'bg-slate-500/5',
};

export const CAMPAIGN_SUGGESTIONS: Record<RfmSegment, string> = {
  CHAMPIONS: 'CHAMPIONS respond well to early access and VIP loyalty rewards.',
  PROMISING: 'PROMISING customers are ideal for loyalty programs and cross-sell offers.',
  AT_RISK_LOYALISTS: 'AT RISK LOYALISTS need a timely win-back message before they lapse fully.',
  DORMANT_VIPS: 'DORMANT VIPs have high re-engagement ROI — lead with a compelling offer.',
  LAPSED_LOW_VALUE: 'LAPSED LOW VALUE segments benefit from selective reactivation, not broad blasts.',
  GENERAL: 'GENERAL segments work well for broad announcements and discovery campaigns.',
};
