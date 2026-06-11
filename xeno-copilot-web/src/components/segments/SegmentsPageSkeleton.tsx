import { PageHeader } from '@/components/layout/PageHeader';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonTable } from '@/components/shared/SkeletonTable';

export function SegmentsPageSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeader title="Customer Segments" subtitle="RFM-based audience intelligence" />
      <SkeletonCards count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <SkeletonTable columns={6} rows={6} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
