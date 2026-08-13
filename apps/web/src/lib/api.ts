/**
 * Minimal typed API client. Attaches the access token, sends cookies for refresh,
 * and normalizes the uniform error envelope from the API.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('crm_at', token);
    else localStorage.removeItem('crm_at');
  }
}

/** Restore the in-memory access token from localStorage (client bootstrap). */
export function initAccessToken(): void {
  if (typeof window !== 'undefined' && !accessToken) {
    accessToken = localStorage.getItem('crm_at');
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  initAccessToken();

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(err.code ?? 'INTERNAL', err.message ?? 'שגיאה', res.status, err.details);
  }
  return body as T;
}

/** Fetch a non-JSON (e.g. text/html) endpoint with auth; returns the raw text. */
export async function apiFetchText(path: string): Promise<string> {
  initAccessToken();

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) throw new ApiError('INTERNAL', 'שגיאה בטעינת המסמך', res.status);
  return res.text();
}
