'use client';

import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle="Your CRM at a glance"
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Customers" value="—" />
        <MetricCard label="Active Campaigns" value="—" variant="featured" />
        <MetricCard label="Completed Campaigns" value="—" />
        <MetricCard label="Drafts in Progress" value="—" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <EmptyState
          icon={Megaphone}
          heading="Your first campaign is one prompt away"
          description="Describe your marketing goal in plain language and the AI will build your audience, messages, and strategy."
          action={{ label: 'Create Campaign', href: '/campaigns/new' }}
        />
      </div>
    </div>
  );
}
