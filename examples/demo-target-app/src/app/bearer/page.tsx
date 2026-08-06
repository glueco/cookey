"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// ============================================
// BEARER TAB — zero-Cookey-dependency connection
// Paste gateway URL + token (or arrive via claim-code callback) →
// /v1/grant → model picker → chat via the stock openai client
// (server-side, through this app's own API routes).
// ============================================

interface GrantResource {
  resourceId: string;
  actions: string[];
  models: string[];
  remaining: Record<string, number>;
}

interface GrantInfo {
  grantId: string;
  status: string;
  expiresAt: string | null;
  currentPeriodEnd: string | null;
  resources: GrantResource[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "cookey:bearer-connection";

function BearerPageInner() {
  const searchParams = useSearchParams();
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [token, setToken] = useState("");
  const [grant, setGrant] = useState<GrantInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Claim-code callback (?code=…&gateway=…) or stored connection
  useEffect(() => {
    const code = searchParams.get("code");
    const gateway = searchParams.get("gateway");
    if (code && gateway) {
      (async () => {
        try {
          const response = await fetch(
            `${gateway.replace(/\/$/, "")}/v1/token/claim`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            },
          );
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error?.message ?? "Claim failed");
          }
          window.history.replaceState({}, "", "/bearer");
          await connect(gateway, data.token);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Claim failed");
        }
      })();
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { url: string; token: string };
        connect(parsed.url, parsed.token);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(url: string, tokenValue: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/bearer/grant", {
        headers: {
          "x-gateway-url": url,
          "x-gateway-token": tokenValue,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? data.error ?? "Connection failed");
      }
      setGatewayUrl(url);
      setToken(tokenValue);
      setGrant(data);
      const firstLlm = (data.resources as GrantResource[]).find((r) =>
        r.resourceId.startsWith("llm:"),
      );
      setSelectedModel(firstLlm?.models[0] ?? "");
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ url, token: tokenValue }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY);
    setGrant(null);
    setToken("");
    setMessages([]);
  }

  async function send() {
    if (!input.trim() || !grant || !selectedModel) return;
    const resource = grant.resources.find((r) =>
      r.models.includes(selectedModel),
    );
    if (!resource) return;
    const provider = resource.resourceId.split(":")[1];

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/bearer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl,
          token,
          provider,
          model: selectedModel,
          messages: nextMessages,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.content },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const llmResources = grant?.resources.filter((r) =>
    r.resourceId.startsWith("llm:"),
  );

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bearer connection</h1>
        <p className="text-sm text-gray-500 mt-1">
          Static <code>ck_</code> token + the stock <code>openai</code> client.
          No Cookey SDK anywhere on this page.
        </p>
        <a href="/" className="text-sm text-blue-600 underline">
          ← PoP connection demo
        </a>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {!grant ? (
        <div className="space-y-3 border rounded-lg p-4">
          <label className="block text-sm">
            Gateway URL
            <input
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              placeholder="http://localhost:3000"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Access token
            <input
              className="mt-1 w-full border rounded px-3 py-2 text-sm font-mono"
              placeholder="ck_…"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
            disabled={busy || !gatewayUrl || !token}
            onClick={() => connect(gatewayUrl.trim(), token.trim())}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      ) : (
        <>
          <div className="border rounded-lg p-4 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span>
                🟢 Connected to <code>{gatewayUrl}</code>
              </span>
              <button className="text-red-600 underline" onClick={disconnect}>
                Disconnect
              </button>
            </div>
            <p className="text-gray-500">
              Grant {grant.grantId.slice(0, 8)}… · status {grant.status} ·
              expires{" "}
              {grant.currentPeriodEnd ?? grant.expiresAt ?? "never"}
            </p>
            {llmResources && llmResources.length > 0 && (
              <label className="block pt-2">
                Model
                <select
                  className="mt-1 w-full border rounded px-2 py-1.5"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {llmResources.flatMap((resource) =>
                    resource.models.map((model) => (
                      <option key={`${resource.resourceId}:${model}`} value={model}>
                        {model} ({resource.resourceId})
                      </option>
                    )),
                  )}
                </select>
              </label>
            )}
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-sm text-gray-400">
                  Say something to test the gateway round-trip.
                </p>
              )}
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`text-sm p-2 rounded ${
                    message.role === "user"
                      ? "bg-blue-50 text-blue-900"
                      : "bg-gray-50 text-gray-800"
                  }`}
                >
                  <span className="font-semibold">
                    {message.role === "user" ? "You" : "Assistant"}:
                  </span>{" "}
                  {message.content}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder="Message…"
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                disabled={busy || !input.trim()}
                onClick={send}
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function BearerPage() {
  return (
    <Suspense>
      <BearerPageInner />
    </Suspense>
  );
}
