import { ApiError, type ApiErrorBody } from '@/lib/types/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `/api/proxy/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* empty */
    }
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? `Request failed (${res.status})`,
      err?.field,
    );
  }

  return res.json() as Promise<T>;
}
