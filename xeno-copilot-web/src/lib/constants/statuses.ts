import type { CampaignStatus, MessageStatus } from '@/lib/types/campaign';

export const CAMPAIGN_STATUS_META: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  READY_FOR_REVIEW: { label: 'Ready', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
  LAUNCHING: { label: 'Launching', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  COMPLETED: { label: 'Completed', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  FAILED: { label: 'Failed', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
};

export const MESSAGE_STATUS_META: Record<MessageStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'bg-slate-100 text-slate-600' },
  SENT: { label: 'Sent', className: 'bg-blue-100 text-blue-800' },
  DELIVERED: { label: 'Delivered', className: 'bg-emerald-100 text-emerald-800' },
  FAILED: { label: 'Failed', className: 'bg-rose-100 text-rose-800' },
  OPENED: { label: 'Opened', className: 'bg-indigo-100 text-indigo-800' },
  CLICKED: { label: 'Clicked', className: 'bg-violet-100 text-violet-800' },
  CONVERTED: { label: 'Converted', className: 'bg-amber-100 text-amber-800' },
};
