import type { RfmSegment } from '@/lib/types/customer';

export interface SegmentAggregate {
  segment: RfmSegment;
  count: number;
  percentOfTotal: number;
  avgSpend: number;
  avgOrderFrequency: number;
  avgDaysSinceLastOrder: number;
}

export interface SegmentsResponse {
  computedAt: string;
  totalCustomers: number;
  segments: SegmentAggregate[];
}
