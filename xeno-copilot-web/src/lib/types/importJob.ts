export type ImportJobStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ImportJob {
  _id: string;
  status: ImportJobStatus;
  type: 'CUSTOMERS' | 'ORDERS';
  filename: string;
  totalRows: number;
  imported: number;
  skipped: number;
  failed: number;
  createdAt: string;
  completedAt?: string | null;
}
