import type { ListCampaignsParams } from '@/lib/api/campaigns';
import type { ListCustomersParams } from '@/lib/api/customers';
import type { ListOrdersParams } from '@/lib/api/orders';

export const queryKeys = {
  campaigns: {
    all: ['campaigns'] as const,
    list: (filters: ListCampaignsParams) => ['campaigns', 'list', filters] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
    stats: (id: string) => ['campaigns', 'detail', id, 'stats'] as const,
    messages: (id: string, cursor?: string) => ['campaigns', 'detail', id, 'messages', cursor] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (filters: ListCustomersParams) => ['customers', 'list', filters] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (filters: ListOrdersParams) => ['orders', 'list', filters] as const,
  },
  segments: {
    all: ['segments'] as const,
    list: () => ['segments', 'list'] as const,
    customers: (name: string, cursor?: string) => ['segments', name, 'customers', cursor] as const,
  },
};
