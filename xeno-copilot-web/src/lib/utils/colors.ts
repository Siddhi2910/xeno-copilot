import type { RfmSegment } from '@/lib/types/customer';
import type { OrderChannel } from '@/lib/types/order';

export const SEGMENT_COLORS: Record<RfmSegment, string> = {
  CHAMPIONS: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  PROMISING: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  AT_RISK_LOYALISTS: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  DORMANT_VIPS: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  LAPSED_LOW_VALUE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  GENERAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  EMAIL: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  SMS: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  ONLINE: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  OFFLINE: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function channelColor(channel: string): string {
  return CHANNEL_COLORS[channel] ?? 'bg-slate-100 text-slate-600';
}

export function segmentColor(segment: RfmSegment): string {
  return SEGMENT_COLORS[segment];
}
