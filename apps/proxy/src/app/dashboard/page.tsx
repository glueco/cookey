"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { NotificationsBell } from "@/components/NotificationsBell";

// Models are now fetched from /api/admin/models
type ResourceModel = { id: string; name: string; description?: string };

interface ModelUsage {
  model: string;
  requestCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

interface UsageStat {
  resourceId: string;
  date: string;
  models: ModelUsage[];
}

interface App {
  id: string;
  name: string;
  description: string | null;
  homepage: string | null;
  status: string;
  createdAt: string;
  permissions: Array<{
    id: string;
    resourceId: string;
    action: string;
    constraints: Record<string, unknown> | null;
    validFrom: string | null;
    expiresAt: string | null;
    timeWindow: Record<string, unknown> | null;
    rateLimitRequests: number | null;
    rateLimitWindowSecs: number | null;
    burstLimit: number | null;
    burstWindowSecs: number | null;
    dailyQuota: number | null;
    monthlyQuota: number | null;
    dailyTokenBudget: number | null;
    monthlyTokenBudget: number | null;
    status: string;
    createdAt: string;
  }>;
  dailyUsage: number;
  usageStats?: UsageStat[];
  usageSummary?: {
    totalRequests: number;
    totalTokens: number;
    modelBreakdown: ModelUsage[];
  };
}

interface Resource {
  id: string;
  resourceId: string;
  name: string;
  resourceType: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"apps" | "resources" | "pairing">(
    "apps",
  );
  const [apps, setApps] = useState<App[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  
  // Dynamic model lists from API
  const [resourceModels, setResourceModels] = useState<Record<string, ResourceModel[]>>({});
  
  // Actions menu state
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Fetch models from API on mount
  useEffect(() => {
    fetch("/api/admin/models")
      .then(res => res.json())
      .then((data: Record<string, string[]>) => {
        // Convert string[] to ResourceModel[]
        const models: Record<string, ResourceModel[]> = {};
        for (const [resourceId, modelIds] of Object.entries(data)) {
          models[resourceId] = modelIds.map(id => ({
            id,
            name: id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
            description: undefined,
          }));
        }
        setResourceModels(models);
      })
      .catch(err => console.error("Failed to fetch models:", err));
  }, []);

  // Cookie-based auth - no need for token in headers
  const authHeaders = {
    "Content-Type": "application/json",
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [appsRes, resourcesRes] = await Promise.all([
        fetch("/api/admin/apps", { headers: authHeaders }),
        fetch("/api/admin/resources", { headers: authHeaders }),
      ]);

      if (appsRes.status === 401 || resourcesRes.status === 401) {
        // Not authenticated, redirect to login
        router.push("/");
        return;
      }

      if (!appsRes.ok || !resourcesRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const appsData = await appsRes.json();
      const resourcesData = await resourcesRes.json();

      setApps(appsData.apps);
      setResources(resourcesData.resources);
      setIsAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Check auth on mount
  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/");
  };

  const handleRemoveExpiredApps = async () => {
    if (!confirm("Run the housekeeping sweep now? This expires past-due grants and permissions and prunes stale codes.")) {
      return;
    }
    setActionLoading("removeExpired");
    setActionsMenuOpen(false);
    try {
      const res = await fetch("/api/admin/sweep", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sweep failed");
      // Refresh apps list
      const appsRes = await fetch("/api/admin/apps");
      const appsData = await appsRes.json();
      setApps(appsData.apps || []);
      setError(null);
      alert(`Sweep complete: ${data.results.grantsExpired ?? 0} grant(s) and ${data.results.permissionsExpired ?? 0} permission(s) expired`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner w-8 h-8 text-primary-600"></div>
          <p className="text-slate-500 dark:text-slate-400 animate-pulse-soft">
            Loading dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center card p-8 max-w-md animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Session Expired
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            Your session has expired or you&apos;re not authenticated.
          </p>
          <button onClick={() => router.push("/")} className="btn-primary">
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-500/20">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Gateway Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Actions Menu */}
              <div className="relative">
                <button
                  onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
                  className="btn-ghost text-slate-600 hover:text-primary-600 dark:hover:text-primary-400 relative group"
                  disabled={actionLoading !== null}
                  title="Admin Actions"
                >
                  {actionLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  )}
                  <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 text-xs bg-slate-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Admin Actions
                  </span>
                </button>
                {actionsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setActionsMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 animate-scale-in origin-top-right">
                      <div className="p-2">
                        <button
                          onClick={handleRemoveExpiredApps}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Remove Expired Apps
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Notifications */}
              <NotificationsBell />
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="btn-ghost text-slate-600 hover:text-red-600 dark:hover:text-red-400 relative group"
                title="Logout"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 animate-scale-in">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="tab-list mb-8">
          <button
            onClick={() => setActiveTab("apps")}
            className={activeTab === "apps" ? "tab-active" : "tab"}
          >
            <span className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              Apps
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700">
                {apps.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab("resources")}
            className={activeTab === "resources" ? "tab-active" : "tab"}
          >
            <span className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
              Resources
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700">
                {resources.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab("pairing")}
            className={activeTab === "pairing" ? "tab-active" : "tab"}
          >
            <span className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              Generate Pairing
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {/* Apps Tab */}
          {activeTab === "apps" && (
            <AppsTab
              apps={apps}
              authHeaders={authHeaders}
              onRefresh={fetchData}
              resourceModels={resourceModels}
            />
          )}

          {/* Resources Tab */}
          {activeTab === "resources" && (
            <ResourcesTab
              resources={resources}
              authHeaders={authHeaders}
              onRefresh={fetchData}
            />
          )}

          {/* Pairing Tab */}
          {activeTab === "pairing" && <PairingTab authHeaders={authHeaders} />}
        </div>
      </div>
    </main>
  );
}

// ============================================
// APPS TAB
// ============================================

function AppsTab({
  apps,
  authHeaders,
  onRefresh,
  resourceModels,
}: {
  apps: App[];
  authHeaders: Record<string, string>;
  onRefresh: () => void;
  resourceModels: Record<string, ResourceModel[]>;
}) {
  const [selectedApp, setSelectedApp] = useState<App | null>(null);

  const handleStatusChange = async (appId: string, status: string) => {
    await fetch("/api/admin/apps", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ appId, status }),
    });
    onRefresh();
  };

  const handleDelete = async (appId: string) => {
    if (!confirm("Are you sure you want to delete this app?")) return;
    await fetch(`/api/admin/apps?appId=${appId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    setSelectedApp(null);
    onRefresh();
  };

  if (apps.length === 0) {
    return (
      <div className="empty-state">
        <svg
          className="empty-state-icon"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
        <h3 className="empty-state-title">No apps connected yet</h3>
        <p className="empty-state-description">
          Generate a pairing string to connect your first application and start
          granting access.
        </p>
      </div>
    );
  }

  // Show details panel if an app is selected
  if (selectedApp) {
    return (
      <AppDetailsPanel
        app={selectedApp}
        authHeaders={authHeaders}
        onBack={() => setSelectedApp(null)}
        onRefresh={() => {
          onRefresh();
          // Update selected app with refreshed data
          const updated = apps.find((a) => a.id === selectedApp.id);
          if (updated) setSelectedApp(updated);
        }}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        resourceModels={resourceModels}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {apps.map((app, index) => (
        <div
          key={app.id}
          onClick={() => setSelectedApp(app)}
          className="card-interactive p-5 animate-fade-in-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-primary-500/20 flex-shrink-0">
                {app.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {app.name}
                </h3>
                {app.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate-2">
                    {app.description}
                  </p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{app.id.slice(0, 8)}...</span>
                  <span>•</span>
                  <span>
                    Created {new Date(app.createdAt).toLocaleString()}
                  </span>
                  {(() => {
                    const expiryDates = app.permissions
                      .map((p) => p.expiresAt)
                      .filter((d): d is string => d !== null)
                      .map((d) => new Date(d));
                    if (expiryDates.length === 0) return null;
                    const earliest = new Date(Math.min(...expiryDates.map((d) => d.getTime())));
                    const now = new Date();
                    const isExpired = earliest < now;
                    return (
                      <>
                        <span>•</span>
                        <span className={isExpired ? "text-red-500" : ""}>
                          {isExpired ? "Expired" : `Expires ${earliest.toLocaleString()}`}
                        </span>
                      </>
                    );
                  })()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={
                  app.status === "ACTIVE"
                    ? "badge-success"
                    : app.status === "SUSPENDED"
                      ? "badge-warning"
                      : "badge-danger"
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    app.status === "ACTIVE"
                      ? "bg-emerald-500"
                      : app.status === "SUSPENDED"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                ></span>
                {app.status}
              </span>
              <svg
                className="w-5 h-5 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-white">
                  {app.permissions.length}
                </span>{" "}
                permission(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-900 dark:text-white">
                  {app.dailyUsage}
                </span>{" "}
                requests today
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// APP DETAILS PANEL
// ============================================

function AppDetailsPanel({
  app,
  authHeaders,
  onBack,
  onRefresh,
  onStatusChange,
  onDelete,
  resourceModels,
}: {
  app: App;
  authHeaders: Record<string, string>;
  onBack: () => void;
  onRefresh: () => void;
  onStatusChange: (appId: string, status: string) => Promise<void>;
  onDelete: (appId: string) => Promise<void>;
  resourceModels: Record<string, ResourceModel[]>;
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appName, setAppName] = useState(app.name);
  const [appDescription, setAppDescription] = useState(app.description || "");
  const [editedPermissions, setEditedPermissions] = useState(app.permissions);

  // Reset form when app changes
  useEffect(() => {
    setAppName(app.name);
    setAppDescription(app.description || "");
    setEditedPermissions(app.permissions);
  }, [app]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const changedPermissions = editedPermissions.filter((ep, idx) => {
        const original = app.permissions[idx];
        return (
          ep.expiresAt !== original.expiresAt ||
          ep.rateLimitRequests !== original.rateLimitRequests ||
          ep.rateLimitWindowSecs !== original.rateLimitWindowSecs ||
          ep.dailyQuota !== original.dailyQuota ||
          ep.monthlyQuota !== original.monthlyQuota ||
          ep.dailyTokenBudget !== original.dailyTokenBudget ||
          ep.monthlyTokenBudget !== original.monthlyTokenBudget
        );
      });

      await fetch("/api/admin/apps", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          appId: app.id,
          name: appName !== app.name ? appName : undefined,
          description:
            appDescription !== (app.description || "")
              ? appDescription
              : undefined,
          permissions:
            changedPermissions.length > 0
              ? changedPermissions.map((p) => ({
                  id: p.id,
                  expiresAt: p.expiresAt,
                  rateLimitRequests: p.rateLimitRequests,
                  rateLimitWindowSecs: p.rateLimitWindowSecs,
                  dailyQuota: p.dailyQuota,
                  monthlyQuota: p.monthlyQuota,
                  dailyTokenBudget: p.dailyTokenBudget,
                  monthlyTokenBudget: p.monthlyTokenBudget,
                }))
              : undefined,
        }),
      });

      setEditMode(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!confirm("Revoke this permission? This cannot be undone.")) return;

    await fetch("/api/admin/apps", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        appId: app.id,
        permissions: [{ id: permissionId, status: "REVOKED" }],
      }),
    });
    onRefresh();
  };

  const updatePermission = (idx: number, field: string, value: unknown) => {
    setEditedPermissions((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  const formatExpiry = (dateStr: string | null) => {
    if (!dateStr) return "Never expires";
    const date = new Date(dateStr);
    const now = new Date();
    if (date < now) return "Expired";
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days} day(s) remaining`;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours} hour(s) remaining`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="btn-ghost gap-2 text-slate-600 dark:text-slate-400"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span>Back to Apps</span>
        </button>
        <div className="flex items-center gap-2">
          {!editMode ? (
            <button onClick={() => setEditMode(true)} className="btn-primary">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditMode(false);
                  setAppName(app.name);
                  setAppDescription(app.description || "");
                  setEditedPermissions(app.permissions);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-success"
              >
                {saving ? (
                  <>
                    <div className="loading-spinner w-4 h-4"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* App Info Card */}
      <div className="card p-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary-500/25 flex-shrink-0">
              {app.name.charAt(0).toUpperCase()}
            </div>
            {editMode ? (
              <div className="space-y-4 flex-1">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    App Name
                  </label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={appDescription}
                    onChange={(e) => setAppDescription(e.target.value)}
                    className="input min-h-[80px] resize-none"
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {app.name}
                </h2>
                {app.description && (
                  <p className="text-slate-500 dark:text-slate-400 mt-1">
                    {app.description}
                  </p>
                )}
              </div>
            )}
          </div>
          <span
            className={
              app.status === "ACTIVE"
                ? "badge-success"
                : app.status === "SUSPENDED"
                  ? "badge-warning"
                  : "badge-danger"
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                app.status === "ACTIVE"
                  ? "bg-emerald-500"
                  : app.status === "SUSPENDED"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
            ></span>
            {app.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              App ID
            </span>
            <code className="text-xs font-mono text-slate-700 dark:text-slate-300">
              {app.id}
            </code>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Created
            </span>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {new Date(app.createdAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Expires
            </span>
            {(() => {
              const expiryDates = app.permissions
                .map((p) => p.expiresAt)
                .filter((d): d is string => d !== null)
                .map((d) => new Date(d));
              if (expiryDates.length === 0) {
                return <span className="text-sm text-slate-700 dark:text-slate-300">Never</span>;
              }
              const earliest = new Date(Math.min(...expiryDates.map((d) => d.getTime())));
              const now = new Date();
              const isExpired = earliest < now;
              return (
                <span className={`text-sm ${isExpired ? "text-red-500 font-medium" : "text-slate-700 dark:text-slate-300"}`}>
                  {isExpired ? "Expired" : earliest.toLocaleString()}
                </span>
              );
            })()}
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
              Daily Usage
            </span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {app.dailyUsage} requests
            </span>
          </div>
          {app.homepage && (
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                Homepage
              </span>
              <a
                href={app.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 truncate block"
              >
                {app.homepage}
              </a>
            </div>
          )}
        </div>

        {/* Status Controls */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Status:
            </span>
            <select
              value={app.status}
              onChange={(e) => onStatusChange(app.id, e.target.value)}
              className="select py-1.5 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          <button
            onClick={() => onDelete(app.id)}
            className="ml-auto btn-ghost text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete App
          </button>
        </div>
      </div>

      {/* Permissions Section */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary-600 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Permissions
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {app.permissions.length} resource access grant(s)
            </p>
          </div>
        </div>

        {app.permissions.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            No active permissions.
          </div>
        ) : (
          <div className="space-y-4">
            {editedPermissions.map((perm, idx) => (
              <div
                key={perm.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-medium flex items-center gap-2">
                      <span className="font-mono text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 rounded">
                        {perm.resourceId}
                      </span>
                      <svg
                        className="w-4 h-4 text-slate-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14 5l7 7m0 0l-7 7m7-7H3"
                        />
                      </svg>
                      <span className="font-mono text-sm text-slate-600 dark:text-slate-400">
                        {perm.action}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2">
                      <span>Created: {formatDate(perm.createdAt)}</span>
                      <span>•</span>
                      <span
                        className={
                          perm.expiresAt &&
                          new Date(perm.expiresAt) < new Date()
                            ? "text-red-500"
                            : ""
                        }
                      >
                        {formatExpiry(perm.expiresAt)}
                      </span>
                    </p>
                  </div>
                  {!editMode && (
                    <button
                      onClick={() => handleRevokePermission(perm.id)}
                      className="btn-ghost text-xs text-red-600 hover:text-red-700 dark:text-red-400 py-1.5 px-2.5"
                    >
                      Revoke
                    </button>
                  )}
                </div>

                {editMode ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        Expires At
                      </label>
                      <input
                        type="datetime-local"
                        value={
                          perm.expiresAt
                            ? new Date(perm.expiresAt)
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          updatePermission(
                            idx,
                            "expiresAt",
                            e.target.value
                              ? new Date(e.target.value).toISOString()
                              : null,
                          )
                        }
                        className="input py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                        Rate Limit (req/window)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="Requests"
                          value={perm.rateLimitRequests || ""}
                          onChange={(e) =>
                            updatePermission(
                              idx,
                              "rateLimitRequests",
                              e.target.value ? parseInt(e.target.value) : null,
                            )
                          }
                          className="input py-2 text-sm flex-1"
                        />
                        <input
                          type="number"
                          placeholder="Seconds"
                          value={perm.rateLimitWindowSecs || ""}
                          onChange={(e) =>
                            updatePermission(
                              idx,
                              "rateLimitWindowSecs",
                              e.target.value ? parseInt(e.target.value) : null,
                            )
                          }
                          className="input py-2 text-sm flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Daily Quota
                      </label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        value={perm.dailyQuota || ""}
                        onChange={(e) =>
                          updatePermission(
                            idx,
                            "dailyQuota",
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Monthly Quota
                      </label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        value={perm.monthlyQuota || ""}
                        onChange={(e) =>
                          updatePermission(
                            idx,
                            "monthlyQuota",
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Daily Token Budget
                      </label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        value={perm.dailyTokenBudget || ""}
                        onChange={(e) =>
                          updatePermission(
                            idx,
                            "dailyTokenBudget",
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Monthly Token Budget
                      </label>
                      <input
                        type="number"
                        placeholder="Unlimited"
                        value={perm.monthlyTokenBudget || ""}
                        onChange={(e) =>
                          updatePermission(
                            idx,
                            "monthlyTokenBudget",
                            e.target.value ? parseInt(e.target.value) : null,
                          )
                        }
                        className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700"
                      />
                    </div>

                    {/* Model Access Control */}
                    {resourceModels[perm.resourceId] && (
                      <div className="col-span-full">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-medium">
                            Allowed Models
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allModels =
                                  resourceModels[perm.resourceId]?.map(
                                    (m) => m.id,
                                  ) || [];
                                const newConstraints = {
                                  ...(perm.constraints || {}),
                                  allowedModels: allModels,
                                };
                                updatePermission(
                                  idx,
                                  "constraints",
                                  newConstraints,
                                );
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Select All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newConstraints = {
                                  ...(perm.constraints || {}),
                                };
                                delete (
                                  newConstraints as Record<string, unknown>
                                ).allowedModels;
                                updatePermission(
                                  idx,
                                  "constraints",
                                  Object.keys(newConstraints).length > 0
                                    ? newConstraints
                                    : null,
                                );
                              }}
                              className="text-xs text-gray-600 hover:text-gray-800"
                            >
                              Clear (Allow All)
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {resourceModels[perm.resourceId]?.map((model) => {
                            const allowedModels =
                              (perm.constraints?.allowedModels as
                                | string[]
                                | undefined) || [];
                            const isAllowed =
                              allowedModels.length === 0 ||
                              allowedModels.includes(model.id);
                            const isExplicitlySet = allowedModels.length > 0;

                            return (
                              <label
                                key={model.id}
                                className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${
                                  isExplicitlySet && isAllowed
                                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                    : isExplicitlySet && !isAllowed
                                      ? "border-gray-200 bg-gray-50 dark:bg-gray-800/50 opacity-60"
                                      : "border-gray-200 bg-white dark:bg-gray-800 hover:border-blue-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAllowed}
                                  onChange={(e) => {
                                    let newAllowed: string[];
                                    if (allowedModels.length === 0) {
                                      // Currently "all allowed", switching to explicit list
                                      const allModels =
                                        resourceModels[perm.resourceId]?.map(
                                          (m) => m.id,
                                        ) || [];
                                      newAllowed = e.target.checked
                                        ? allModels
                                        : allModels.filter(
                                            (m) => m !== model.id,
                                          );
                                    } else {
                                      newAllowed = e.target.checked
                                        ? [...allowedModels, model.id]
                                        : allowedModels.filter(
                                            (m) => m !== model.id,
                                          );
                                    }

                                    const newConstraints = {
                                      ...(perm.constraints || {}),
                                      allowedModels:
                                        newAllowed.length > 0
                                          ? newAllowed
                                          : undefined,
                                    };
                                    if (!newConstraints.allowedModels) {
                                      delete (
                                        newConstraints as Record<
                                          string,
                                          unknown
                                        >
                                      ).allowedModels;
                                    }
                                    updatePermission(
                                      idx,
                                      "constraints",
                                      Object.keys(newConstraints).length > 0
                                        ? newConstraints
                                        : null,
                                    );
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-xs truncate">
                                    {model.name}
                                  </div>
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {model.id}
                                  </div>
                                </div>
                                {isExplicitlySet && isAllowed && (
                                  <span className="text-green-600 text-xs">
                                    ✓
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {(
                            perm.constraints?.allowedModels as
                              | string[]
                              | undefined
                          )?.length
                            ? `${(perm.constraints?.allowedModels as string[]).length} model(s) selected`
                            : "All models allowed (no restrictions)"}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs block">
                        Rate Limit
                      </span>
                      <span>
                        {perm.rateLimitRequests
                          ? `${perm.rateLimitRequests} / ${perm.rateLimitWindowSecs}s`
                          : "Unlimited"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block">
                        Daily Quota
                      </span>
                      <span>{perm.dailyQuota || "Unlimited"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block">
                        Monthly Quota
                      </span>
                      <span>{perm.monthlyQuota || "Unlimited"}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs block">
                        Token Budget
                      </span>
                      <span>
                        {perm.dailyTokenBudget || perm.monthlyTokenBudget
                          ? `${perm.dailyTokenBudget || "∞"}/day, ${perm.monthlyTokenBudget || "∞"}/mo`
                          : "Unlimited"}
                      </span>
                    </div>
                    {perm.constraints &&
                      Object.keys(perm.constraints).filter(
                        (k) => k !== "allowedModels",
                      ).length > 0 && (
                        <div className="col-span-full">
                          <span className="text-gray-500 text-xs block mb-1">
                            Other Constraints
                          </span>
                          <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                            {JSON.stringify(
                              Object.fromEntries(
                                Object.entries(perm.constraints).filter(
                                  ([k]) => k !== "allowedModels",
                                ),
                              ),
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      )}
                    {/* Model Scope - Visual Display */}
                    {resourceModels[perm.resourceId] && (
                      <div className="col-span-full">
                        <span className="text-gray-500 text-xs block mb-2">
                          Allowed Models
                        </span>
                        {(
                          perm.constraints?.allowedModels as
                            | string[]
                            | undefined
                        )?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {resourceModels[perm.resourceId]?.map((model) => {
                              const isAllowed = (
                                perm.constraints?.allowedModels as string[]
                              ).includes(model.id);
                              return (
                                <span
                                  key={model.id}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                    isAllowed
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 line-through"
                                  }`}
                                >
                                  {isAllowed && (
                                    <span className="text-green-600">✓</span>
                                  )}
                                  {model.name}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            <span>✓</span> All models allowed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Statistics Section */}
      {app.usageSummary && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Usage Statistics
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Last 7 days activity
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="stat-card-blue">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {app.usageSummary.totalRequests.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Total Requests
              </div>
            </div>
            <div className="stat-card-green">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {app.usageSummary.totalTokens.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Total Tokens
              </div>
            </div>
            <div className="stat-card-purple">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {app.usageSummary.modelBreakdown.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Models Used
              </div>
            </div>
            <div className="stat-card-orange">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {app.dailyUsage}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Today&apos;s Requests
              </div>
            </div>
          </div>

          {/* Model Breakdown Table */}
          {app.usageSummary.modelBreakdown.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Model Breakdown
              </h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="text-right">Requests</th>
                      <th className="text-right">Input Tokens</th>
                      <th className="text-right">Output Tokens</th>
                      <th className="text-right">Total Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {app.usageSummary.modelBreakdown.map((model) => (
                      <tr key={model.model}>
                        <td className="font-mono text-xs text-primary-600 dark:text-primary-400">
                          {model.model}
                        </td>
                        <td className="text-right font-medium">
                          {model.requestCount.toLocaleString()}
                        </td>
                        <td className="text-right">
                          {model.inputTokens.toLocaleString()}
                        </td>
                        <td className="text-right">
                          {model.outputTokens.toLocaleString()}
                        </td>
                        <td className="text-right font-semibold text-slate-900 dark:text-white">
                          {model.totalTokens.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily Usage */}
          {app.usageStats && app.usageStats.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Daily Usage
              </h4>
              <div className="space-y-2">
                {Array.from(
                  new Map(
                    app.usageStats.map((s) => [
                      s.date,
                      {
                        date: s.date,
                        requests: app
                          .usageStats!.filter((u) => u.date === s.date)
                          .reduce(
                            (sum, u) =>
                              sum +
                              u.models.reduce(
                                (m, mod) => m + mod.requestCount,
                                0,
                              ),
                            0,
                          ),
                        models: new Set(
                          app
                            .usageStats!.filter((u) => u.date === s.date)
                            .flatMap((u) => u.models.map((m) => m.model)),
                        ).size,
                      },
                    ]),
                  ).values(),
                )
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 7)
                  .map((day) => (
                    <div
                      key={day.date}
                      className="flex justify-between items-center text-sm p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <span className="font-mono text-slate-600 dark:text-slate-400">
                        {day.date}
                      </span>
                      <div className="flex gap-4">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {day.requests} requests
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {day.models} model(s)
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {app.usageSummary.totalRequests === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No usage data for the last 7 days.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// RESOURCES TAB
// ============================================

// Plugin type for the dropdown
interface AvailablePlugin {
  id: string;
  name: string;
  resourceType: string;
  provider: string;
}

function ResourcesTab({
  resources,
  authHeaders,
  onRefresh,
}: {
  resources: Resource[];
  authHeaders: Record<string, string>;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [availablePlugins, setAvailablePlugins] = useState<AvailablePlugin[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(true);
  const [formData, setFormData] = useState({
    resourceId: "",
    name: "",
    resourceType: "",
    secret: "",
  });

  // Fetch available plugins on mount
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        const res = await fetch("/api/admin/plugins", {
          headers: authHeaders,
        });
        if (res.ok) {
          const data = await res.json();
          setAvailablePlugins(data.plugins || []);
          // Set initial form data to first available plugin
          if (data.plugins && data.plugins.length > 0) {
            const firstPlugin = data.plugins[0];
            setFormData({
              resourceId: firstPlugin.id,
              name: firstPlugin.name,
              resourceType: firstPlugin.resourceType,
              secret: "",
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch plugins:", err);
      } finally {
        setLoadingPlugins(false);
      }
    };
    fetchPlugins();
  }, [authHeaders]);

  // Filter out plugins that are already added as resources
  const existingResourceIds = new Set(resources.map((r) => r.resourceId));
  const unaddedPlugins = availablePlugins.filter(
    (plugin) => !existingResourceIds.has(plugin.id)
  );

  // Update form data when unaddedPlugins changes (e.g., after a resource is added/deleted)
  useEffect(() => {
    if (unaddedPlugins.length > 0 && !unaddedPlugins.find((p) => p.id === formData.resourceId)) {
      const firstPlugin = unaddedPlugins[0];
      setFormData({
        resourceId: firstPlugin.id,
        name: firstPlugin.name,
        resourceType: firstPlugin.resourceType,
        secret: "",
      });
    } else if (unaddedPlugins.length === 0) {
      setFormData({
        resourceId: "",
        name: "",
        resourceType: "",
        secret: "",
      });
    }
  }, [unaddedPlugins, formData.resourceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await fetch("/api/admin/resources", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(formData),
    });

    setShowForm(false);
    // Form data will be automatically updated by the useEffect above after onRefresh
    onRefresh();
  };

  const handleDelete = async (resourceId: string) => {
    if (
      !confirm(
        `Are you sure you want to delete resource '${resourceId}'? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setDeleting(resourceId);
    try {
      const res = await fetch(
        `/api/admin/resources?resourceId=${encodeURIComponent(resourceId)}`,
        {
          method: "DELETE",
          headers: authHeaders,
        },
      );

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete resource");
        return;
      }

      onRefresh();
    } catch (err) {
      alert("Failed to delete resource");
    } finally {
      setDeleting(null);
    }
  };

  const getResourceIcon = (type: string) => {
    if (type === "llm") {
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      );
    }
    if (type === "mail") {
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      );
    }
    return (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
        />
      </svg>
    );
  };

  return (
    <div>
      <button
        onClick={() => setShowForm(!showForm)}
        className={showForm ? "btn-secondary mb-6" : "btn-primary mb-6"}
      >
        {showForm ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cancel
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Resource
          </>
        )}
      </button>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="card p-6 mb-6 animate-scale-in"
        >
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Add New Resource
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Resource ID
              </label>
              <select
                value={formData.resourceId}
                onChange={(e) => {
                  const id = e.target.value;
                  const selectedPlugin = unaddedPlugins.find((p) => p.id === id);
                  if (selectedPlugin) {
                    setFormData({
                      ...formData,
                      resourceId: id,
                      name: selectedPlugin.name,
                      resourceType: selectedPlugin.resourceType,
                    });
                  }
                }}
                className="select"
                disabled={loadingPlugins || unaddedPlugins.length === 0}
              >
                {loadingPlugins ? (
                  <option value="">Loading plugins...</option>
                ) : unaddedPlugins.length === 0 ? (
                  <option value="">All plugins configured</option>
                ) : (
                  unaddedPlugins.map((plugin) => (
                    <option key={plugin.id} value={plugin.id}>
                      {plugin.id}
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Format: resourceType:provider
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="input"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              API Key (Secret)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg
                  className="w-5 h-5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <input
                type="password"
                value={formData.secret}
                onChange={(e) =>
                  setFormData({ ...formData, secret: e.target.value })
                }
                placeholder="Enter your API key"
                className="input pl-12"
                required
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button type="submit" className="btn-success">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Save Resource
            </button>
          </div>
        </form>
      )}

      {resources.length === 0 ? (
        <div className="empty-state">
          <svg
            className="empty-state-icon"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
            />
          </svg>
          <h3 className="empty-state-title">No resources configured</h3>
          <p className="empty-state-description">
            Add a resource with your API keys to start granting access to
            connected apps.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {resources.map((resource, index) => (
            <div
              key={resource.id}
              className="card p-5 animate-fade-in-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      resource.resourceType === "llm"
                        ? "bg-gradient-to-br from-purple-500 to-purple-700 shadow-md shadow-purple-500/20"
                        : "bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md shadow-emerald-500/20"
                    } text-white`}
                  >
                    {getResourceIcon(resource.resourceType)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {resource.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {resource.resourceId}
                      </span>
                      <span>•</span>
                      <span className="capitalize">
                        {resource.resourceType}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      resource.status === "ACTIVE"
                        ? "badge-success"
                        : "badge-danger"
                    }
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        resource.status === "ACTIVE"
                          ? "bg-emerald-500"
                          : "bg-red-500"
                      }`}
                    ></span>
                    {resource.status}
                  </span>
                  <button
                    onClick={() => handleDelete(resource.resourceId)}
                    disabled={deleting === resource.resourceId}
                    className="btn-ghost text-red-600 hover:text-red-700 dark:text-red-400 py-1.5 px-2.5 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    {deleting === resource.resourceId ? (
                      <div className="loading-spinner w-4 h-4"></div>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PAIRING TAB
// ============================================

function PairingTab({ authHeaders }: { authHeaders: Record<string, string> }) {
  const [pairingString, setPairingString] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePairing = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pairing/generate", {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json();
      setPairingString(data.pairingString);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (pairingString) {
      navigator.clipboard.writeText(pairingString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Generate Pairing String
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Create a one-time pairing string to share with apps you want to
              grant access to your resources.
            </p>
          </div>
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Important
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                The pairing string is valid for <strong>10 minutes</strong> and
                can only be used <strong>once</strong>.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={generatePairing}
          disabled={loading}
          className="btn-primary w-full py-3"
        >
          {loading ? (
            <>
              <div className="loading-spinner w-5 h-5"></div>
              <span>Generating...</span>
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <span>Generate Pairing String</span>
            </>
          )}
        </button>
      </div>

      {pairingString && (
        <div className="card p-6 animate-scale-in">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Pairing String Generated
              </span>
            </div>
            <button
              onClick={copyToClipboard}
              className={`btn-ghost py-1.5 px-3 text-sm ${copied ? "text-emerald-600" : "text-primary-600"}`}
            >
              {copied ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="relative">
            <code className="block text-sm break-all bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-slate-700 dark:text-slate-300 pr-12">
              {pairingString}
            </code>
          </div>
          {expiresAt && (
            <div className="flex items-center gap-2 mt-4 text-sm text-slate-500 dark:text-slate-400">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Expires: {new Date(expiresAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
          How it works
        </h3>
        <div className="grid gap-4">
          {[
            {
              step: 1,
              title: "Generate",
              desc: "Create a unique pairing string above",
            },
            {
              step: 2,
              title: "Share",
              desc: "Provide the string to the app you want to connect",
            },
            {
              step: 3,
              title: "Approve",
              desc: "Review and approve the access request",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-sm font-bold text-primary-600 dark:text-primary-400 flex-shrink-0">
                {item.step}
              </div>
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white">
                  {item.title}
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
