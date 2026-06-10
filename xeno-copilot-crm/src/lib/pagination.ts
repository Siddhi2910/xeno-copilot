// Cursor-based pagination helpers.
// Cursor = base64-encoded MongoDB ObjectId hex string (last _id of previous page).
// Callers never inspect cursor contents — treat as opaque.

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf8');
}

export interface PaginationMeta {
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
}

export function buildPaginationMeta(
  ids: string[],        // _id strings from the returned page (in order)
  pageSize: number,
  total: number
): PaginationMeta {
  const hasMore = ids.length === pageSize;
  const lastId = ids.at(-1);

  return {
    hasMore,
    nextCursor: hasMore && lastId ? encodeCursor(lastId) : null,
    total,
  };
}
