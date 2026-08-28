"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PRESETS, type Preset } from "@/lib/presets";
import {
  fetchDiscovery,
  type DiscoveryResponse,
} from "@/lib/discovery";
import { DemoMark } from "@/components/DemoMark";

// ============================================
// CONNECTION STORAGE (localStorage)
// ============================================

interface Connection {
  gatewayUrl: string;
  appId: string;
  handle: string;
  createdAt: string;
}

const CONNECTIONS_KEY = "gateway:connections";
const HANDLE_TTL_MS = 60 * 60 * 1000; // 1 hour

function loadConnections(): Connection[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(CONNECTIONS_KEY);
    if (!stored) return [];
    const connections = JSON.parse(stored) as Connection[];
    // Filter out expired connections
    const now = Date.now();
    return connections.filter(
      (c) => new Date(c.createdAt).getTime() + HANDLE_TTL_MS > now
    );
  } catch {
    return [];
  }
}

function saveConnections(connections: Connection[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
}

function removeConnection(gatewayUrl: string): void {
  const connections = loadConnections();
  saveConnections(connections.filter((c) => c.gatewayUrl !== gatewayUrl));
}

function getTimeRemaining(createdAt: string): number {
  const expiry = new Date(createdAt).getTime() + HANDLE_TTL_MS;
  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

// ============================================
// TYPES
// ============================================

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

// ============================================
// ICONS
// ============================================

const HomeIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
);

const PlayIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const LogoutIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const LoadingSpinner = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// ============================================
// MAIN COMPONENT
// ============================================

export default function DashboardPage() {
  const router = useRouter();

  // Session state
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Discovery state
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Request/Response state
  const [response, setResponse] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [requestBody, setRequestBody] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Rotation state
  const [rotating, setRotating] = useState(false);
  const [rotateMessage, setRotateMessage] = useState<string | null>(null);

  // Load connections and fetch discovery on mount
  useEffect(() => {
    const initialize = async () => {
      const conns = loadConnections();
      setConnections(conns);
      
      if (conns.length === 0) {
        router.push("/");
        return;
      }

      const conn = conns[0];
      setActiveConnection(conn);

      try {
        setDiscoveryLoading(true);
        const discoveryData = await fetchDiscovery(conn.gatewayUrl);
        setDiscovery(discoveryData);
      } catch (err) {
        console.error("Discovery failed:", err);
        setDiscoveryError(err instanceof Error ? err.message : "Failed to fetch discovery");
      } finally {
        setDiscoveryLoading(false);
        setInitialized(true);
      }
    };

    initialize();
  }, [router]);

  // Update time remaining
  useEffect(() => {
    if (!activeConnection) return;

    const updateTime = () => {
      const remaining = getTimeRemaining(activeConnection.createdAt);
      
      if (remaining <= 0) {
        // Connection expired
        removeConnection(activeConnection.gatewayUrl);
        router.push("/");
      } else {
        setTimeRemaining(remaining);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [activeConnection, router]);

  // Select preset and load its body for editing
  const handlePresetSelect = useCallback((preset: Preset) => {
    setSelectedPreset(preset);
    setRequestBody(preset.body || "{}");
    setJsonError(null);
    setError(null);
    setResponse(null);
  }, []);

  // Validate JSON as user types
  const handleRequestBodyChange = useCallback((value: string) => {
    setRequestBody(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  }, []);

  // Execute request with current body
  const executeRequest = useCallback(async () => {
    if (!activeConnection || !selectedPreset) return;

    // Validate JSON
    let payload;
    try {
      payload = JSON.parse(requestBody);
    } catch {
      setJsonError("Invalid JSON - cannot execute");
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    const startTime = performance.now();

    try {
      const resourceId = `${selectedPreset.resourceType}:${selectedPreset.provider}`;
      // Convert path to action: /v1/chat/completions -> chat.completions, /emails/send -> emails.send
      const action = selectedPreset.path
        .replace(/^\/v1\//, "")  // Remove /v1/ prefix if present
        .replace(/^\//, "")      // Remove leading slash
        .replace(/\//g, ".");    // Replace all remaining slashes with dots

      const res = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: activeConnection.handle,
          resourceId,
          action,
          payload,
        }),
      });

      const data = await res.json();
      const duration = Math.round(performance.now() - startTime);

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setResponse({
        status: data.status || res.status,
        statusText: data.status >= 200 && data.status < 300 ? "OK" : "Error",
        headers: data.headers || {},
        body: JSON.stringify(data.data, null, 2),
        duration,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Request failed";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [activeConnection, selectedPreset, requestBody]);

  // Reset to preset default
  const resetToDefault = useCallback(() => {
    if (selectedPreset) {
      setRequestBody(selectedPreset.body || "{}");
      setJsonError(null);
    }
  }, [selectedPreset]);

  // Rotate key
  const handleRotate = useCallback(async () => {
    if (!activeConnection) return;

    setRotating(true);
    setRotateMessage(null);

    try {
      const res = await fetch("/api/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: activeConnection.handle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Rotation failed");
      }

      // Update connection with new handle (keep createdAt - rotating the
      // key does not extend the original session lifetime)
      if (data.newHandle) {
        const updated: Connection = {
          ...activeConnection,
          handle: data.newHandle,
        };
        const conns = loadConnections();
        const filtered = conns.filter(c => c.gatewayUrl !== activeConnection.gatewayUrl);
        filtered.push(updated);
        saveConnections(filtered);
        setConnections(filtered);
        setActiveConnection(updated);
      }

      setRotateMessage(data.message || "Key rotated successfully");
    } catch (err) {
      setRotateMessage(`Error: ${err instanceof Error ? err.message : "Rotation failed"}`);
    } finally {
      setRotating(false);
    }
  }, [activeConnection]);

  const handleDisconnect = useCallback(() => {
    if (!activeConnection) return;
    removeConnection(activeConnection.gatewayUrl);
    router.push("/");
  }, [activeConnection, router]);

  if (!initialized) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoadingSpinner className="h-8 w-8" />
      </main>
    );
  }

  const availablePresets = discovery
    ? PRESETS.filter((preset) =>
        discovery.resources.some(
          (r) => r.resourceId === `${preset.resourceType}:${preset.provider}`,
        ),
      )
    : PRESETS;

  const isExpiringSoon = timeRemaining !== null && timeRemaining < 300;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <DemoMark
                size={22}
                className="text-gray-900 dark:text-gray-100 shrink-0"
              />
              <h1 className="font-bold text-lg tracking-tight text-gray-900 dark:text-gray-50">
                Dashboard
              </h1>
              <span className="badge-brand hidden md:inline-flex">
                Cookey demo app
              </span>
            </div>
            {activeConnection && (
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <span className="status-dot-success" />
                <code className="code-inline text-xs">{activeConnection.gatewayUrl}</code>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {timeRemaining !== null && (
              <span
                className={`text-sm font-mono tabular-nums ${isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-gray-500"}`}
              >
                {formatTimeRemaining(timeRemaining)}
              </span>
            )}
            <button
              onClick={() => router.push("/")}
              className="btn-ghost py-1.5"
            >
              <HomeIcon />
              <span className="hidden sm:inline">Home</span>
            </button>
            <button onClick={handleDisconnect} className="btn-secondary py-1.5">
              <LogoutIcon />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Presets */}
          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="section-title">Test Presets</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a preset to test the server-side SDK integration.
              </p>

              {discoveryLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <LoadingSpinner className="h-4 w-4" />
                  Loading resources...
                </div>
              ) : discoveryError ? (
                <div className="alert-warning">
                  <p className="text-sm">{discoveryError}</p>
                </div>
              ) : discovery ? (
                <div className="alert-success mb-3">
                  <p className="text-sm">
                    <strong>{discovery.gateway.name}</strong> v
                    {discovery.gateway.version} • {discovery.resources.length} resource(s)
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    disabled={loading}
                    className={`card-hover w-full p-4 text-left flex items-start gap-3 group ${
                      selectedPreset?.id === preset.id ? "ring-2 ring-primary-500" : ""
                    }`}
                  >
                    <span
                      className={
                        preset.method === "GET" ? "method-get" : "method-post"
                      }
                    >
                      {preset.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                        {preset.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {preset.resourceType}:{preset.provider}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {preset.description}
                      </div>
                    </div>
                    {loading && selectedPreset?.id === preset.id && (
                      <LoadingSpinner className="h-4 w-4" />
                    )}
                  </button>
                ))}
              </div>

              {availablePresets.length === 0 && (
                <p className="text-sm text-gray-500">
                  No available presets for discovered resources.
                </p>
              )}
            </div>

            {/* Key Rotation */}
            <div className="card p-5">
              <h3 className="section-title">Key Rotation</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Rotate the signing key for this gateway connection.
              </p>
              <button
                onClick={handleRotate}
                disabled={rotating}
                className="btn-secondary w-full"
              >
                {rotating ? (
                  <>
                    <LoadingSpinner className="h-4 w-4" />
                    Rotating...
                  </>
                ) : (
                  <>
                    <RefreshIcon />
                    Rotate Key
                  </>
                )}
              </button>
              {rotateMessage && (
                <p className={`text-xs mt-2 ${rotateMessage.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                  {rotateMessage}
                </p>
              )}
            </div>

            {/* SDK Info */}
            <div className="card p-5">
              <h3 className="section-title">SDK Integration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                All requests are signed server-side using:
              </p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• <code className="code-inline">@glueco/sdk</code> - PoP signing</li>
                <li>• <code className="code-inline">lib/presets.ts</code> - Typed request bodies</li>
              </ul>
              <div className="alert-warning mt-3">
                <p className="text-xs">
                  Private key never leaves the server.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Request Editor + Response */}
          <div className="space-y-4">
            {/* Request Editor */}
            {selectedPreset && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="section-title">
                    Request: {selectedPreset.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={resetToDefault}
                      className="btn-ghost text-xs py-1 px-2"
                      disabled={loading}
                    >
                      Reset
                    </button>
                    <span
                      className={
                        selectedPreset.method === "GET" ? "method-get" : "method-post"
                      }
                    >
                      {selectedPreset.method}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-gray-500">Request Body (JSON)</p>
                    {jsonError && (
                      <span className="text-xs text-red-500">{jsonError}</span>
                    )}
                  </div>
                  <textarea
                    value={requestBody}
                    onChange={(e) => handleRequestBodyChange(e.target.value)}
                    className={`w-full h-48 font-mono text-xs p-3 border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y ${
                      jsonError ? "border-red-500" : ""
                    }`}
                    disabled={loading}
                    spellCheck={false}
                  />
                </div>

                <button
                  onClick={executeRequest}
                  disabled={loading || !!jsonError}
                  className="btn-primary w-full"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner className="h-4 w-4" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <PlayIcon />
                      Execute Request
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Response */}
            <div className="card p-5 min-h-[400px]">
              <h3 className="section-title">Response</h3>

              {error && (
                <div className="alert-error animate-fade-in">
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <LoadingSpinner className="h-8 w-8 text-primary-600" />
                  <p className="text-sm text-gray-500">Executing request...</p>
                </div>
              )}

              {!loading && !error && !response && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
                    <PlayIcon />
                  </span>
                  <p className="text-sm font-medium">No response yet</p>
                  <p className="text-xs mt-1">Select a preset to run a test</p>
                </div>
              )}

              {response && !loading && (
                <div className="space-y-4 animate-fade-in">
                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        response.status >= 200 && response.status < 300
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {response.status} {response.statusText}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {response.duration}ms
                    </span>
                  </div>

                  {/* Body */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Response Body</p>
                    <pre className="code-block text-xs overflow-x-auto max-h-96">
                      {response.body}
                    </pre>
                  </div>

                  {/* Headers */}
                  {Object.keys(response.headers).length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">Headers</p>
                      <div className="code-block text-xs space-y-1 max-h-32 overflow-y-auto">
                        {Object.entries(response.headers).map(([key, value]) => (
                          <div key={key}>
                            <span className="text-primary-700 dark:text-primary-400">
                              {key}:
                            </span>{" "}
                            <span className="text-gray-600 dark:text-gray-400">
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
