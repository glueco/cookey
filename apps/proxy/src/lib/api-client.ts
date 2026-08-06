// ============================================
// TYPED ADMIN API CLIENT
// Thin wrapper over the admin REST surface; all hooks go through this.
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      (data as { error?: string }).error ?? `Request failed (${response.status})`,
      response.status,
      (data as { details?: unknown }).details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body: unknown) =>
    call<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    call<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => call<T>(path, { method: "DELETE" }),
};
