export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  initAccessToken(); // ← הוסף את הקו הזה!
  
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
