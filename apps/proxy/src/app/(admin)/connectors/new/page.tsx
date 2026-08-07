"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import type { ConnectorDocShape } from "@/components/connectors/ConnectorReview";

// ============================================
// CUSTOM CONNECTOR BUILDER (9.5)
// Form → adapter picker → config → actions editor → models →
// allowedHosts (auto-suggested from baseUrl) → live JSON preview →
// save as CUSTOM → test call through the real enforcement/adapter path.
// ============================================

const ADAPTERS = [
  {
    id: "openai-compatible",
    label: "OpenAI-compatible LLM",
    hint: "Any /chat/completions API: OpenRouter, DeepSeek, Together, Mistral, Ollama…",
  },
  {
    id: "http-passthrough",
    label: "Any REST API",
    hint: "Forwards requests as-is with your key injected — no deep inspection",
  },
  {
    id: "anthropic-messages",
    label: "Anthropic Messages protocol",
    hint: "Anthropic-compatible /v1/messages APIs, translated to OpenAI shape",
  },
  {
    id: "gemini-generative",
    label: "Gemini GenerateContent protocol",
    hint: "Google AI Studio-style APIs, translated to OpenAI shape",
  },
  {
    id: "mail-send",
    label: "Transactional mail (Resend-style)",
    hint: "JSON send-email APIs with domain/recipient enforcement",
  },
];

interface ActionRow {
  id: string;
  method: string;
  path: string;
  streaming: boolean;
}

const LLM_ENFORCE = {
  model: { rule: "allowedValues", constraint: "allowedModels" },
  max_tokens: { rule: "clampMax", constraint: "maxOutputTokens", default: 4096 },
  stream: { rule: "allowFlag", constraint: "allowStreaming" },
  tools: { rule: "forbidField", constraint: "allowTools" },
};

const LLM_USAGE = {
  inputTokens: "usage.prompt_tokens",
  outputTokens: "usage.completion_tokens",
  totalTokens: "usage.total_tokens",
  model: "model",
};

function CustomConnectorBuilderInner() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [resourceType, setResourceType] = useState("llm");
  const [adapter, setAdapter] = useState("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState<"bearer" | "header" | "query">("bearer");
  const [authName, setAuthName] = useState("");
  const [models, setModels] = useState("");
  const [hosts, setHosts] = useState("");
  const [hostsTouched, setHostsTouched] = useState(false);
  const [actions, setActions] = useState<ActionRow[]>([
    { id: "chat.completions", method: "POST", path: "/chat/completions", streaming: true },
  ]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Array<{ path: string; message: string }>>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isPassthrough = adapter === "http-passthrough";
  const connectorId = `${resourceType}:${provider}`;

  // Edit mode — seed the entire form from the stored CUSTOM document
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{
          connectors: Array<{ connectorId: string; document: ConnectorDocShape }>;
        }>("/api/admin/connectors");
        if (cancelled) return;
        const row = data.connectors.find((c) => c.connectorId === editId);
        if (!row) {
          setError(`Connector "${editId}" not found`);
          return;
        }
        const doc = row.document;
        setName(doc.name ?? "");
        setProvider(doc.id.split(":").slice(1).join(":"));
        setResourceType(doc.resourceType);
        setAdapter(doc.adapter);
        setBaseUrl(typeof doc.config?.baseUrl === "string" ? doc.config.baseUrl : "");
        const auth = doc.config?.auth as { type?: string; name?: string } | undefined;
        if (auth?.type === "bearer" || auth?.type === "header" || auth?.type === "query") {
          setAuthType(auth.type);
        }
        setAuthName(auth?.name ?? "");
        setModels((doc.models ?? []).join("\n"));
        setHosts((doc.allowedHosts ?? []).join("\n"));
        setHostsTouched(true);
        setActions(
          Object.entries(doc.actions ?? {}).map(([id, action]) => ({
            id,
            method: action.method,
            path: action.pathPattern ?? action.path ?? "",
            streaming: action.streaming ?? false,
          })),
        );
        setEditMode(true);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load connector for editing",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const derivedHost = useMemo(() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return "";
    }
  }, [baseUrl]);

  const effectiveHosts = hostsTouched
    ? hosts.split(/[\n,]/).map((h) => h.trim()).filter(Boolean)
    : derivedHost
      ? [derivedHost]
      : [];

  const document = useMemo(() => {
    const actionEntries = Object.fromEntries(
      actions
        .filter((a) => a.id && a.path)
        .map((a) => [
          a.id,
          {
            method: a.method,
            ...(isPassthrough ? { pathPattern: a.path } : { path: a.path }),
            streaming: a.streaming,
            ...(!isPassthrough &&
              resourceType === "llm" && {
                enforce: LLM_ENFORCE,
                usage: LLM_USAGE,
              }),
          },
        ]),
    );

    return {
      specVersion: "1",
      id: connectorId,
      name: name || provider,
      version: "1.0.0",
      resourceType,
      adapter,
      config: {
        baseUrl,
        ...(adapter !== "gemini-generative" && {
          auth: { type: authType, ...(authName && { name: authName }) },
        }),
      },
      ...(effectiveHosts.length > 0 && { allowedHosts: effectiveHosts }),
      actions: actionEntries,
      ...(models.trim() && {
        models: models.split(/[\n,]/).map((m) => m.trim()).filter(Boolean),
      }),
      credentials: [
        { name: "apiKey", type: "secret", label: `${name || provider} API key`, required: true },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, provider, resourceType, adapter, baseUrl, authType, authName, models, actions, hostsTouched, hosts, derivedHost]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setDetails([]);
    try {
      const res = await fetch("/api/admin/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Replace in place when editing or re-saving after the first save
        body: JSON.stringify({ document, replace: editMode || saved }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetails(data.details ?? []);
        throw new Error(data.error ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const hasCompleteAction = actions.some((a) => a.id && a.path);

  const testCall = async () => {
    const firstAction = actions.find((a) => a.id && a.path);
    if (!firstAction) {
      setTestResult("Add at least one complete action row before test-calling.");
      return;
    }
    setTestResult("Running…");
    const input =
      resourceType === "llm" && !isPassthrough
        ? {
            model: models.split(/[\n,]/)[0]?.trim() || "test-model",
            messages: [{ role: "user", content: "Say hello in 5 words" }],
            max_tokens: 32,
          }
        : undefined;
    try {
      const res = await fetch("/api/admin/connectors/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId,
          action: firstAction.id,
          input,
          ...(isPassthrough && { subPath: firstAction.path }),
        }),
      });
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Test call failed");
    }
  };

  return (
    <main className="min-h-screen max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {editMode ? "Edit custom connector" : "Build a custom connector"}
        </h1>
        <Link href="/connectors" className="text-sm text-slate-400 underline">
          ← All connectors
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Display name
              <input className="input w-full mt-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenRouter" />
            </label>
            <label className="block text-sm">
              Provider id
              <input className="input w-full mt-1 text-sm font-mono" value={provider} onChange={(e) => setProvider(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="openrouter" />
            </label>
            <label className="block text-sm">
              Resource type
              <select className="input w-full mt-1 text-sm" value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                <option value="llm">llm</option>
                <option value="mail">mail</option>
                <option value="http">http</option>
              </select>
            </label>
            <label className="block text-sm">
              Adapter
              <select
                className="input w-full mt-1 text-sm"
                value={adapter}
                onChange={(e) => {
                  const next = e.target.value;
                  setAdapter(next);
                  if (next === "http-passthrough") {
                    setResourceType("http");
                    setActions([{ id: "request", method: "POST", path: "/v1/**", streaming: false }]);
                  }
                }}
              >
                {ADAPTERS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {ADAPTERS.find((a) => a.id === adapter)?.hint}
          </p>

          <label className="block text-sm">
            Base URL
            <input className="input w-full mt-1 text-sm font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" />
          </label>

          {adapter !== "gemini-generative" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Auth style
                <select className="input w-full mt-1 text-sm" value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)}>
                  <option value="bearer">Authorization: Bearer</option>
                  <option value="header">Custom header</option>
                  <option value="query">Query parameter</option>
                </select>
              </label>
              {authType !== "bearer" && (
                <label className="block text-sm">
                  {authType === "header" ? "Header name" : "Query param name"}
                  <input className="input w-full mt-1 text-sm font-mono" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder={authType === "header" ? "x-api-key" : "key"} />
                </label>
              )}
            </div>
          )}

          {/* Actions editor */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Actions {isPassthrough && <span className="font-normal text-xs text-slate-500">(path patterns: * within a segment, ** across)</span>}
            </p>
            {actions.map((action, index) => (
              <div key={index} className="flex gap-2 items-center">
                <input className="input text-sm font-mono w-36" value={action.id} placeholder="action.id" onChange={(e) => setActions((prev) => prev.map((a, i) => (i === index ? { ...a, id: e.target.value } : a)))} />
                <select className="input text-sm w-24" value={action.method} onChange={(e) => setActions((prev) => prev.map((a, i) => (i === index ? { ...a, method: e.target.value } : a)))}>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (<option key={m}>{m}</option>))}
                </select>
                <input className="input text-sm font-mono flex-1" value={action.path} placeholder={isPassthrough ? "/v1/images/*" : "/chat/completions"} onChange={(e) => setActions((prev) => prev.map((a, i) => (i === index ? { ...a, path: e.target.value } : a)))} />
                <label className="text-xs flex items-center gap-1">
                  <input type="checkbox" checked={action.streaming} onChange={(e) => setActions((prev) => prev.map((a, i) => (i === index ? { ...a, streaming: e.target.checked } : a)))} />
                  SSE
                </label>
                <button className="text-red-500 text-sm" onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}>✕</button>
              </div>
            ))}
            <button className="text-xs text-primary-600 underline" onClick={() => setActions((prev) => [...prev, { id: "", method: "POST", path: "", streaming: false }])}>
              + add action
            </button>
          </div>

          {resourceType === "llm" && !isPassthrough && (
            <label className="block text-sm">
              Models (one per line — drives pickers and the default allowlist)
              <textarea rows={3} className="input w-full mt-1 text-sm font-mono" value={models} onChange={(e) => setModels(e.target.value)} placeholder={"anthropic/claude-3.5-sonnet\nmeta-llama/llama-3.3-70b"} />
            </label>
          )}

          <label className="block text-sm">
            Allowed egress hosts
            <textarea
              rows={2}
              className="input w-full mt-1 text-sm font-mono"
              value={hostsTouched ? hosts : effectiveHosts.join("\n")}
              onChange={(e) => {
                setHostsTouched(true);
                setHosts(e.target.value);
              }}
            />
            <span className="text-xs text-slate-400">
              Auto-suggested from the base URL. Requests can ONLY go to these hosts.
            </span>
          </label>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              <p>{error}</p>
              {details.length > 0 && (
                <ul className="mt-1 text-xs list-disc pl-4">
                  {details.map((d, i) => (
                    <li key={i}>{d.path ? `${d.path}: ` : ""}{d.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2 items-center">
            <button className="btn-primary text-sm" disabled={saving || !provider || !baseUrl} onClick={save}>
              {saving ? "Saving…" : saved ? "Save again" : "Save connector"}
            </button>
            {saved && (
              <>
                <Link href={`/connectors/${encodeURIComponent(connectorId)}`} className="btn-secondary text-sm">
                  Add credentials →
                </Link>
                <button className="btn-secondary text-sm" disabled={!hasCompleteAction} onClick={testCall}>
                  Test call
                </button>
              </>
            )}
          </div>
          {saved && (
            <p className="text-xs text-emerald-600">
              Saved as a CUSTOM connector. Add credentials before test-calling —
              come back via Edit in builder to test-call.
            </p>
          )}
          {testResult && (
            <pre className="p-3 rounded-lg bg-slate-900 text-emerald-300 text-xs overflow-x-auto max-h-64">
              {testResult}
            </pre>
          )}
        </div>

        {/* Live JSON preview */}
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
            Document preview
          </p>
          <pre className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs overflow-x-auto text-slate-700 dark:text-slate-200 sticky top-6">
            {JSON.stringify(document, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}

export default function CustomConnectorBuilder() {
  return (
    <Suspense>
      <CustomConnectorBuilderInner />
    </Suspense>
  );
}
