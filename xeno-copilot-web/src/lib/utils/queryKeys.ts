import type { ListCustomersParams } from '@/lib/api/customers';
import type { ListOrdersParams } from '@/lib/api/orders';

export const queryKeys = {
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
