'use client';

import { notFound } from 'next/navigation';
import { AudienceExplorer } from '@/components/segments/AudienceExplorer';
import { SegmentsPageSkeleton } from '@/components/segments/SegmentsPageSkeleton';
import { useSegments } from '@/lib/hooks/useSegments';
import { RFM_SEGMENTS } from '@/lib/constants/segments';
import type { RfmSegment } from '@/lib/types/customer';

const VALID = new Set(RFM_SEGMENTS.map((s) => s.value));

export default function SegmentDetailPage({ params }: { params: { segmentName: string } }) {
  const segmentName = params.segmentName as RfmSegment;
  const { data, isLoading } = useSegments();

  if (!VALID.has(segmentName)) {
    notFound();
  }

  const stats = data?.segments.find((s) => s.segment === segmentName);

  if (isLoading && !stats) {
    return <SegmentsPageSkeleton />;
  }

  return <AudienceExplorer segmentName={segmentName} stats={stats} statsLoading={isLoading} />;
}
