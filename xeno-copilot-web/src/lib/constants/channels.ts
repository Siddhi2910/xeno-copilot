import type { Channel } from '@/lib/types/customer';
import type { OrderChannel } from '@/lib/types/order';

export const COMM_CHANNELS: { value: Channel; label: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
];

export const ORDER_CHANNELS: { value: OrderChannel; label: string }[] = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'OFFLINE', label: 'Offline' },
];
