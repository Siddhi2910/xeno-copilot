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
};
