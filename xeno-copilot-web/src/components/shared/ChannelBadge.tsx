import { cn } from '@/lib/utils/cn';
import { channelColor } from '@/lib/utils/colors';

interface ChannelBadgeProps {
  channel: string;
  className?: string;
}

const LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
};

export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        channelColor(channel),
        className,
      )}
    >
      {LABELS[channel] ?? channel}
    </span>
  );
}
