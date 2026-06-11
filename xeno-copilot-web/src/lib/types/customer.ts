export type RfmSegment =
  | 'CHAMPIONS'
  | 'PROMISING'
  | 'AT_RISK_LOYALISTS'
  | 'DORMANT_VIPS'
  | 'LAPSED_LOW_VALUE'
  | 'GENERAL';

export type Channel = 'WHATSAPP' | 'EMAIL' | 'SMS';

export interface Customer {
  _id: string;
  brandId?: string | null;
  phone: string;
  name: string;
  email: string | null;
  source: 'CSV' | 'API';
  tags: string[];
  optOutChannels: Channel[];
  lastOrderAt: string | null;
  totalOrders: number;
  totalSpend: number;
  rfmR: number | null;
  rfmF: number | null;
  rfmM: number | null;
  rfmSegment: RfmSegment | null;
  createdAt: string;
  updatedAt: string;
}
