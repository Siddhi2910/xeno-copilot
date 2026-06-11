'use client';

import { MessageSquare, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Customer, Channel } from '@/lib/types/customer';
import { formatPercent } from '@/lib/utils/formatters';

const CHANNELS: { key: Channel; label: string; icon: typeof Phone; color: string }[] = [
  { key: 'WHATSAPP', label: 'WhatsApp', icon: Phone, color: 'bg-green-500' },
  { key: 'EMAIL', label: 'Email', icon: Mail, color: 'bg-blue-500' },
  { key: 'SMS', label: 'SMS', icon: MessageSquare, color: 'bg-orange-500' },
];

interface ChannelReachIndicatorProps {
  customers: Customer[];
  totalCount?: number;
  className?: string;
}

export function ChannelReachIndicator({ customers, totalCount, className }: ChannelReachIndicatorProps) {
  if (customers.length === 0) return null;

  const base = customers.length;
  const reach = CHANNELS.map((ch) => {
    const reachable = customers.filter((c) => !c.optOutChannels.includes(ch.key)).length;
    const pct = (reachable / base) * 100;
    return { ...ch, reachable, pct };
  });

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Channel Reach</p>
      <div className="space-y-2">
        {reach.map((ch) => {
          const Icon = ch.icon;
          return (
            <div key={ch.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Icon className="h-3.5 w-3.5 text-slate-400" />
                  {ch.label}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {formatPercent(ch.pct)} · {ch.reachable.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={cn('h-full rounded-full transition-all', ch.color)} style={{ width: `${ch.pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {customers.length < base ? (
        <p className="text-xs text-slate-400">Based on {customers.length} loaded of {base} customers</p>
      ) : null}
    </div>
  );
}
