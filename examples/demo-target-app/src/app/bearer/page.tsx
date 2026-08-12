"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DemoMark } from "@/components/DemoMark";

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
    if (!input.trim() || !grant || !selectedModel.trim()) return;
    // Match by model when the grant lists models; fall back to the first
    // LLM resource for free-text model names (grant exposed no model list)
    const resource =
      grant.resources.find((r) => r.models.includes(selectedModel)) ??
      grant.resources.find((r) => r.resourceId.startsWith("llm:"));
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
          model: selectedModel.trim(),
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
  const availableModels =
    llmResources?.flatMap((resource) => resource.models) ?? [];

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <DemoMark
            size={22}
            className="text-gray-900 dark:text-gray-100 shrink-0"
          />
          <span className="badge-brand">Cookey demo app</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
          Bearer connection
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A static <code className="code-inline">ck_</code> token plus the stock{" "}
          <code className="code-inline">openai</code> client — no Cookey SDK
          anywhere on this page.
        </p>
        <a
          href="/"
          className="inline-block text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline underline-offset-4 decoration-primary-300 dark:decoration-primary-700"
        >
          ← PoP connection demo
        </a>
      </div>

      {error && (
        <div className="alert-error animate-fade-in">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!grant ? (
        <div className="card p-6 space-y-4 animate-fade-in">
          <div>
            <h2 className="section-title mb-1">Connect to a gateway</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Paste your gateway URL and access token to open a session.
            </p>
          </div>
          <label className="block">
            <span className="label">Gateway URL</span>
            <input
              className="input text-sm"
              placeholder="http://localhost:3000"
              value={gatewayUrl}
              onChange={(e) => setGatewayUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Access token</span>
            <input
              className="input-mono"
              placeholder="ck_…"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button
            className="btn-primary w-full"
            disabled={busy || !gatewayUrl || !token}
            onClick={() => connect(gatewayUrl.trim(), token.trim())}
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      ) : (
        <>
          <div className="card p-5 text-sm space-y-3 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="status-dot-success flex-shrink-0" />
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  Connected to
                </span>{" "}
                <code className="code-inline text-xs truncate">{gatewayUrl}</code>
              </span>
              <button
                className="btn-ghost text-xs py-1 px-2 text-red-600 dark:text-red-400 flex-shrink-0"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              Grant{" "}
              <code className="code-inline text-xs">
                {grant.grantId.slice(0, 8)}…
              </code>{" "}
              · status {grant.status} · expires{" "}
              {grant.currentPeriodEnd ?? grant.expiresAt ?? "never"}
            </p>
            {llmResources && llmResources.length > 0 && (
              <label className="block pt-1">
                <span className="label">Model</span>
                {availableModels.length > 0 ? (
                  <select
                    className="input text-sm"
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
                ) : (
                  <input
                    className="input-mono"
                    placeholder="model name, e.g. llama-3.3-70b-versatile"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  />
                )}
              </label>
            )}
          </div>

          <div className="card overflow-hidden animate-fade-in">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Chat
              </h2>
              {selectedModel.trim() && (
                <span className="badge-neutral font-mono text-[11px]">
                  {selectedModel.trim()}
                </span>
              )}
            </div>
            <div className="p-5 space-y-3 max-h-80 overflow-y-auto bg-gray-50/60 dark:bg-gray-950/40">
              {messages.length === 0 && (
                <div className="py-10 text-center space-y-1">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    No messages yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Say something to test the gateway round-trip.
                  </p>
                </div>
              )}
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 text-sm rounded-2xl shadow-sm ${
                      message.role === "user"
                        ? "bg-gradient-to-b from-primary-500 to-primary-600 text-white rounded-br-md"
                        : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md"
                    }`}
                  >
                    <span
                      className={`block text-[11px] font-semibold mb-0.5 ${
                        message.role === "user"
                          ? "text-primary-100"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {message.role === "user" ? "You" : "Assistant"}
                    </span>
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Message…"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                />
                <button
                  className="btn-primary px-5"
                  disabled={busy || !input.trim() || !selectedModel.trim()}
                  onClick={send}
                >
                  {busy ? "…" : "Send"}
                </button>
              </div>
              {!selectedModel.trim() && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Pick a model first
                </p>
              )}
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
