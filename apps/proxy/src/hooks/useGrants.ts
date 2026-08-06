"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

// ============================================
// GRANT HOOKS
// ============================================

export interface GrantSummary {
  id: string;
  status: string;
  authType: "BEARER" | "POP";
  runtime: string;
  expiresAt: string | null;
  currentPeriodEnd: string | null;
  renewalPeriodDays: number | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  approvedAt: string | null;
  createdAt: string;
  document: {
    app?: { name?: string; description?: string };
  };
  app: { id: string; name: string };
  tokens: Array<{
    id: string;
    displayPrefix: string;
    expiresAt: string;
    revokedAt: string | null;
    firstUsedAt: string | null;
    lastUsedAt: string | null;
    lastUsedIp: string | null;
  }>;
  _count: { permissions: number };
}

export function useGrants(status?: string) {
  return useQuery({
    queryKey: ["grants", status ?? "all"],
    queryFn: () =>
      api.get<{ grants: GrantSummary[] }>(
        `/api/admin/grants${status ? `?status=${status}` : ""}`,
      ),
  });
}

export function useGrantDetail(id: string) {
  return useQuery({
    queryKey: ["grant", id],
    queryFn: () => api.get<{ grant: never; auditTail: never[] }>(`/api/admin/grants/${id}`),
  });
}

export function useGrantAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string; decisions?: unknown }) =>
      api.patch<{ grant?: unknown; token?: string }>(`/api/admin/grants/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants"] });
      queryClient.invalidateQueries({ queryKey: ["grant", id] });
    },
  });
}
