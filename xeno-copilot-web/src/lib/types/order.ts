export type OrderChannel = 'ONLINE' | 'OFFLINE';

export interface Order {
  _id: string;
  brandId?: string | null;
  orderId: string;
  customerId: string;
  customerPhone: string;
  amount: number;
  productCategory: string | null;
  orderDate: string;
  channel: OrderChannel;
  discountApplied: boolean;
  campaignAttributedTo: string | null;
  createdAt: string;
}
