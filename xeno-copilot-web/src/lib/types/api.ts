export interface PaginationMeta {
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

export class ApiError extends Error {
  statusCode: number;
  code: string;
  field?: string;

  constructor(statusCode: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }
}
