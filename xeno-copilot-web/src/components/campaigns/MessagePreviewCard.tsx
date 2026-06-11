import type { EmailMessage, WhatsAppMessage } from '@/lib/types/ai';
import { cn } from '@/lib/utils/cn';

interface MessagePreviewCardProps {
  channel: 'WHATSAPP' | 'EMAIL';
  whatsapp: WhatsAppMessage;
  email: EmailMessage;
  className?: string;
}

export function MessagePreviewCard({ channel, whatsapp, email, className }: MessagePreviewCardProps) {
  const isEmail = channel === 'EMAIL';
  const body = isEmail ? email.body : whatsapp.body;
  const limit = isEmail ? 50 : 160;
  const len = body.length;

  return (
    <div className={cn('rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50', className)}>
      {isEmail ? (
        <p className="text-xs font-medium text-slate-500">
          Subject: {email.subject} ({email.subject.length}/{limit})
        </p>
      ) : (
        <p className="text-xs font-medium text-slate-500">
          WhatsApp ({len}/{limit} {len <= limit ? '✓' : '!'})
        </p>
      )}
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{body}</p>
    </div>
  );
}
