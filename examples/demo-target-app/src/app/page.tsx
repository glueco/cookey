"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchDiscovery, type DiscoveryResource } from "@/lib/discovery";
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

function addConnection(connection: Connection): void {
  const connections = loadConnections();
  // Replace if same gatewayUrl exists
  const filtered = connections.filter(
    (c) => c.gatewayUrl !== connection.gatewayUrl
  );
  filtered.push(connection);
  saveConnections(filtered);
}

function removeConnection(gatewayUrl: string): void {
  const connections = loadConnections();
  saveConnections(connections.filter((c) => c.gatewayUrl !== gatewayUrl));
}

// Pending session storage for same-tab approval redirect
const PENDING_SESSION_KEY = "gateway:pending_session";

interface PendingSession {
  sessionToken: string;
  gatewayUrl: string;
}

function savePendingSession(session: PendingSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(session));
}

function loadPendingSession(): PendingSession | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PENDING_SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PendingSession;
  } catch {
    return null;
  }
}

function clearPendingSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_SESSION_KEY);
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
// ICONS
// ============================================

const CheckCircleIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ArrowRightIcon = () => (
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
      d="M13 7l5 5m0 0l-5 5m5-5H6"
    />
  </svg>
);

const ClockIcon = () => (
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
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const LinkIcon = () => (
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
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
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

const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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

function HomePageContent() {
  const router = useRouter();

  // Connection state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Form state
  const [pairingString, setPairingString] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Polling state for connect flow
  const [polling, setPolling] = useState(false);
  const [pollingSession, setPollingSession] = useState<{
    sessionToken: string;
    gatewayUrl: string;
  } | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load connections on mount and handle callback
  useEffect(() => {
    const init = async () => {
      const conns = loadConnections();
      setConnections(conns);
      if (conns.length > 0) {
        setActiveConnection(conns[0]);
      }
      
      // Check for callback params (status=approved)
      const urlParams = new URLSearchParams(window.location.search);
      const status = urlParams.get("status");
      const appId = urlParams.get("app_id");
      const grantId = urlParams.get("grant_id");
      const gatewayFromUrl = urlParams.get("gateway");

      if (status === "approved" && appId) {
        // We returned from approval - confirm with one status poll and
        // complete the connection. Prefer the grant id carried on THIS
        // redirect over the single "pending session" slot in
        // localStorage: that slot is shared across every connect
        // attempt in this browser, so a second/concurrent attempt (a
        // retry, another tab) can overwrite it before this redirect
        // lands. Trusting it blindly would poll a different — possibly
        // never-approved — grant forever while this one sits approved
        // and unnoticed.
        const pending = loadPendingSession();
        const session =
          grantId && gatewayFromUrl
            ? { sessionToken: grantId, gatewayUrl: gatewayFromUrl }
            : pending;
        // Only the pending-session entry that actually belongs to this
        // grant should be cleared or reused for the retry queue below —
        // clearing someone else's in-flight attempt would strand it.
        const pendingMatchesThisGrant = pending?.sessionToken === session?.sessionToken;

        if (session) {
          try {
            const response = await fetch(
              `/api/connect/status?session=${encodeURIComponent(session.sessionToken)}&gatewayUrl=${encodeURIComponent(session.gatewayUrl)}`
            );
            const data = response.ok ? await response.json() : null;

            if (data?.status === "approved" && data.handle) {
              const connection: Connection = {
                gatewayUrl: data.gatewayUrl,
                appId: data.appId,
                handle: data.handle,
                createdAt: new Date().toISOString(),
              };
              addConnection(connection);
              setConnections(loadConnections());
              setActiveConnection(connection);
              if (pendingMatchesThisGrant) clearPendingSession();
            } else if (data?.status === "rejected" || data?.status === "expired") {
              setError(`Connection ${data.status}. Please try again.`);
              if (pendingMatchesThisGrant) clearPendingSession();
            } else {
              // Gateway hasn't settled yet (or the status check itself
              // failed) - resume polling against THIS grant, not
              // whatever else might be sitting in the pending slot.
              setPolling(true);
              setPollingSession(session);
            }
          } catch (err) {
            console.error("Failed to complete connection:", err);
            // Transient error - resume polling against this grant rather
            // than dropping it.
            setPolling(true);
            setPollingSession(session);
          }
        }
        // Clear URL params
        window.history.replaceState({}, "", window.location.pathname);
      } else if (status === "rejected") {
        setError("Connection was rejected.");
        clearPendingSession();
        window.history.replaceState({}, "", window.location.pathname);
      } else if (conns.length === 0) {
        // No callback params and not connected - resume polling if a
        // pending session was left behind before navigating to approval
        const pending = loadPendingSession();
        if (pending) {
          setPolling(true);
          setPollingSession(pending);
        }
      }

      setInitialized(true);
    };
    
    init();
  }, []);

  // Update time remaining for active connection
  useEffect(() => {
    if (!activeConnection) {
      setTimeRemaining(null);
      return;
    }

    const updateTime = () => {
      const remaining = getTimeRemaining(activeConnection.createdAt);
      if (remaining <= 0) {
        // Connection expired, remove it
        removeConnection(activeConnection.gatewayUrl);
        setConnections(loadConnections());
        setActiveConnection(null);
      } else {
        setTimeRemaining(remaining);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [activeConnection]);

  // Poll for approval status
  useEffect(() => {
    if (!pollingSession) return;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/connect/status?session=${encodeURIComponent(pollingSession.sessionToken)}&gatewayUrl=${encodeURIComponent(pollingSession.gatewayUrl)}`
        );
        if (!response.ok) {
          // Transient server error - keep polling rather than treating
          // this the same as "still pending" forever silently; a
          // non-OK response was previously indistinguishable from a
          // genuine pending grant, so it never surfaced.
          console.error(`Status check failed: ${response.status}`);
          return;
        }
        const data = await response.json();

        // Only clear the shared pending-session slot if it still points
        // at the grant we're polling — a concurrent connect attempt may
        // have overwritten it with a different, still-in-flight grant.
        const stillOwnsPendingSlot =
          loadPendingSession()?.sessionToken === pollingSession.sessionToken;

        if (data.status === "approved" && data.handle) {
          // Success! Store connection and stop polling
          const connection: Connection = {
            gatewayUrl: data.gatewayUrl,
            appId: data.appId,
            handle: data.handle,
            createdAt: new Date().toISOString(),
          };
          addConnection(connection);
          setConnections(loadConnections());
          setActiveConnection(connection);
          if (stillOwnsPendingSlot) clearPendingSession();
          setPolling(false);
          setPollingSession(null);
          setLoading(false);
        } else if (data.status === "rejected" || data.status === "expired") {
          setError(`Connection ${data.status}. Please try again.`);
          if (stillOwnsPendingSlot) clearPendingSession();
          setPolling(false);
          setPollingSession(null);
          setLoading(false);
        }
        // Keep polling if pending
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    pollingRef.current = setInterval(poll, 2000);
    poll(); // Initial poll

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [pollingSession]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!pairingString.trim()) {
        throw new Error("Please enter a pairing string");
      }

      // Parse pairing string to get proxy URL for discovery
      const parts = pairingString.trim().split("::");
      if (parts.length !== 3 || parts[0] !== "pair") {
        throw new Error('Invalid pairing string format');
      }
      const discoveredProxyUrl = parts[1];

      // Fetch available resources from the proxy
      const discovery = await fetchDiscovery(discoveredProxyUrl);

      // Request all actions for all available resources with 1hr recommended expiry
      const requestedPermissions = discovery.resources.map(
        (resource: DiscoveryResource) => ({
          resourceId: resource.resourceId,
          actions: resource.actions,
          requestedDuration: { type: "preset", preset: "1_hour" },
        })
      );

      if (requestedPermissions.length === 0) {
        throw new Error(
          "No resources available on the gateway. Add resources in the admin dashboard first."
        );
      }

      // Call server-side connect endpoint
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingString: pairingString.trim(),
          app: {
            name: "Demo Target App",
            description: "Reference implementation for PRG integration",
            homepage: window.location.origin,
          },
          requestedPermissions,
          redirectUri: window.location.origin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect");
      }

      // Store pending session for callback completion
      savePendingSession({
        sessionToken: data.sessionToken,
        gatewayUrl: data.gatewayUrl,
      });

      // Arm polling before navigating away so approval in another tab (or
      // a return to this page) completes the connection
      setPolling(true);
      setPollingSession({
        sessionToken: data.sessionToken,
        gatewayUrl: data.gatewayUrl,
      });

      // Redirect to approval URL in same tab
      window.location.href = data.approvalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setLoading(false);
    }
  }, [pairingString]);

  const handleDisconnect = useCallback(
    (gatewayUrl: string) => {
      removeConnection(gatewayUrl);
      const remaining = loadConnections();
      setConnections(remaining);
      if (activeConnection?.gatewayUrl === gatewayUrl) {
        setActiveConnection(remaining.length > 0 ? remaining[0] : null);
      }
    },
    [activeConnection]
  );

  const handleCancelPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    clearPendingSession();
    setPolling(false);
    setPollingSession(null);
    setLoading(false);
  }, []);

  const handleGoToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  if (!initialized) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </main>
    );
  }

  const isConnected = activeConnection !== null;
  const isExpiringSoon = timeRemaining !== null && timeRemaining < 300;

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header — the parametric bracket mark ([d▪]) is this app's
            own identity in the Cookey system: every consumer wears its
            initial. currentColor, so it re-tones with the theme. */}
        <div className="text-center space-y-3">
          <DemoMark
            size={56}
            className="inline-block text-gray-900 dark:text-gray-100 mb-2"
          />
          <div>
            <span className="badge-brand">Cookey demo app</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            Demo Target App
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Reference implementation for integrating with Personal Resource Gateway
            using server-side PoP signing.
          </p>
          <a
            href="/bearer"
            className="inline-block text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline underline-offset-4 decoration-primary-300 dark:decoration-primary-700"
          >
            Try the bearer-token connection instead (no SDK) →
          </a>
        </div>

        {/* Connection Status Card */}
        <div className="card p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Connection Status</h2>
            {isConnected && (
              <span
                className={`badge ${isExpiringSoon ? "badge-warning" : "badge-success"}`}
              >
                {isExpiringSoon ? "Expiring Soon" : "Active"}
              </span>
            )}
          </div>

          {isConnected && activeConnection ? (
            <div className="space-y-5">
              {/* Status indicator */}
              <div className="flex items-center gap-3">
                <span
                  className={
                    isExpiringSoon ? "status-dot-warning" : "status-dot-success"
                  }
                />
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  Connected
                </span>
              </div>

              {/* Connection details */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <LinkIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Gateway URL
                    </p>
                    <code className="code-inline text-xs break-all">
                      {activeConnection.gatewayUrl}
                    </code>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ShieldCheckIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      App ID
                    </p>
                    <code className="code-inline text-xs break-all">
                      {activeConnection.appId}
                    </code>
                  </div>
                </div>

                {timeRemaining !== null && (
                  <div className="flex items-start gap-3">
                    <ClockIcon />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Session Expires In
                      </p>
                      <span
                        className={`font-mono text-sm font-medium tabular-nums ${isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-gray-900 dark:text-gray-100"}`}
                      >
                        {formatTimeRemaining(timeRemaining)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleGoToDashboard}
                  className="btn-primary flex-1"
                >
                  Open Dashboard
                  <ArrowRightIcon />
                </button>
                <button
                  onClick={() => handleDisconnect(activeConnection.gatewayUrl)}
                  className="btn-secondary"
                >
                  <LogoutIcon />
                  <span className="sr-only sm:not-sr-only">Disconnect</span>
                </button>
              </div>

              {/* Multiple connections indicator */}
              {connections.length > 1 && (
                <p className="text-xs text-gray-500 text-center">
                  {connections.length} gateway connections active
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <span className="status-dot-neutral" />
              <span>Not connected</span>
            </div>
          )}
        </div>

        {/* Connect Form / Polling Status */}
        {!isConnected && (
          <div className="card p-6 animate-fade-in">
            <h2 className="section-title">Connect to Gateway</h2>

            {polling ? (
              <div className="text-center py-8 space-y-4">
                <LoadingSpinner />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Waiting for approval...
                </p>
                <p className="text-xs text-gray-500">
                  Approve the connection in the gateway admin tab
                </p>
                <button
                  onClick={handleCancelPolling}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Get a pairing string from your proxy&apos;s admin dashboard and
                  paste it below.
                </p>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="pairing-string" className="label">
                      Pairing String
                    </label>
                    <textarea
                      id="pairing-string"
                      value={pairingString}
                      onChange={(e) => setPairingString(e.target.value)}
                      placeholder="pair::https://your-proxy.vercel.app::abc123..."
                      className="input-mono resize-none"
                      rows={3}
                    />
                  </div>

                  {error && (
                    <div className="alert-error animate-fade-in">
                      <p className="text-sm whitespace-pre-wrap">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleConnect}
                    disabled={loading || !pairingString.trim()}
                    className="btn-primary w-full"
                  >
                    {loading ? (
                      <>
                        <LoadingSpinner />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect &amp; Request Approval
                        <ArrowRightIcon />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="card p-6">
          <h3 className="section-title">How it works</h3>

          <ol className="space-y-3">
            {[
              "Get a pairing string from your proxy's dashboard",
              'Paste it above and click "Connect"',
              "Approve the connection in the new tab",
              "Return here - you'll be connected automatically",
              "Test endpoints in the Dashboard",
            ].map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="text-gray-600 dark:text-gray-400 pt-0.5">
                  {step}
                </span>
              </li>
            ))}
          </ol>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Cookey · Personal Resource Gateway · Demo Target App
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </main>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
