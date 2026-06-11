import type { RfmSegment } from '@/lib/types/customer';

export const RFM_SEGMENTS: { value: RfmSegment; label: string }[] = [
  { value: 'CHAMPIONS', label: 'Champions' },
  { value: 'PROMISING', label: 'Promising' },
  { value: 'AT_RISK_LOYALISTS', label: 'At Risk Loyalists' },
  { value: 'DORMANT_VIPS', label: 'Dormant VIPs' },
  { value: 'LAPSED_LOW_VALUE', label: 'Lapsed Low Value' },
  { value: 'GENERAL', label: 'General' },
];
