import { PageHeader } from '@/components/layout/PageHeader';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonTable } from '@/components/shared/SkeletonTable';

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8">
      <PageHeader title="Analytics" subtitle="Executive performance overview" />
      <SkeletonCards count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
      <SkeletonTable columns={5} rows={5} />
    </div>
  );
}
