import { cn } from '@/lib/utils/cn';
import { CHANNEL_COLORS } from '@/lib/utils/colors';
import { formatPercent } from '@/lib/utils/formatters';

interface ChannelMixBarProps {
  channelMix: Record<string, number>;
  className?: string;
}

const LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
};

export function ChannelMixBar({ channelMix, className }: ChannelMixBarProps) {
  const total = Object.values(channelMix).reduce((s, n) => s + n, 0);
  if (total === 0) return <p className="text-sm text-slate-400">No channel data</p>;

  const entries = Object.entries(channelMix).sort(([, a], [, b]) => b - a);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {entries.map(([ch, count]) => (
          <div
            key={ch}
            className={cn('h-full', CHANNEL_COLORS[ch]?.split(' ')[0] ?? 'bg-slate-400')}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>
      {entries.map(([ch, count]) => (
        <div key={ch} className="flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">{LABELS[ch] ?? ch}</span>
          <span className="tabular-nums text-slate-700 dark:text-slate-300">
            {formatPercent((count / total) * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}
