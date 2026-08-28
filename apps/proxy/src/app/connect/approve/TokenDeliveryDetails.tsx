"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui";

// ============================================
// TOKEN DELIVERY DETAILS
// The copy-paste half of the grant delivery panel (GrantDeliveryPanel):
// the raw token, a live verify check, and per-language drop-in
// snippets. Used both as the ONLY delivery option (no redirectUri on
// the document) and as the "other ways to deliver this" fallback
// alongside a redirect.
// ============================================

interface Props {
  token: string;
  boundResources: string[];
}

interface VerifyState {
  status: "idle" | "checking" | "done" | "failed";
  message?: string;
}

export function TokenDeliveryDetails({ token, boundResources }: Props) {
  const gateway =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-gateway";
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });

  // Side-effect-free credential check — /v1/token/verify deliberately
  // does not count as the token's first use, so the copy-paste window
  // stays open after testing.
  const testToken = async () => {
    setVerify({ status: "checking" });
    try {
      const res = await fetch("/v1/token/verify", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.valid) {
        setVerify({
          status: "done",
          message: `Valid — ${data.operations} operation${
            data.operations === 1 ? "" : "s"
          } across ${data.services.join(", ")}`,
        });
      } else {
        setVerify({
          status: "failed",
          message: data.reason ?? "The token did not validate",
        });
      }
    } catch {
      setVerify({ status: "failed", message: "Could not reach the gateway" });
    }
  };
  const llmResource = boundResources.find((r) => r.startsWith("llm:"));
  const providerPath = llmResource
    ? `/r/llm/${llmResource.split(":")[1]}`
    : "/r/llm/<provider>";

  const snippets: Array<{ label: string; code: string }> = [
    {
      label: "curl",
      code: `curl ${gateway}${providerPath}/v1/chat/completions \\
  -H "Authorization: Bearer $COOKEY_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "<model>", "messages": [{"role": "user", "content": "Hi"}]}'`,
    },
    {
      label: "Python (openai client)",
      code: `import os

from openai import OpenAI

client = OpenAI(
    base_url="${gateway}${providerPath}/v1",
    api_key=os.environ["COOKEY_TOKEN"],
)
resp = client.chat.completions.create(
    model="<model>", messages=[{"role": "user", "content": "Hi"}]
)`,
    },
    {
      label: "JavaScript (fetch)",
      code: `const res = await fetch("${gateway}${providerPath}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.COOKEY_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "<model>",
    messages: [{ role: "user", content: "Hi" }],
  }),
});`,
    },
  ];

  const [openSnippet, setOpenSnippet] = useState(snippets[0].label);

  return (
    <div className="space-y-6">
      <div>
        <p className="callout-warning mb-2">
          This is the only convenient moment to copy it. Store it in the app's
          secret manager, not in source control.
        </p>
        <div className="code-block flex items-center gap-3">
          <code className="flex-1 text-sm text-emerald-300 break-all select-all">
            {token}
          </code>
          <CopyButton
            value={token}
            label="Copy token"
            className="btn-secondary btn-sm shrink-0"
          />
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <button
            className="btn-secondary btn-sm"
            onClick={testToken}
            disabled={verify.status === "checking"}
          >
            {verify.status === "checking" ? "Checking…" : "Test this token"}
          </button>
          {verify.message && (
            <p
              className={`text-xs ${
                verify.status === "done"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {verify.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Drop it straight in</p>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-hide">
            {snippets.map((snippet) => (
              <button
                key={snippet.label}
                onClick={() => setOpenSnippet(snippet.label)}
                className={`px-3.5 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  openSnippet === snippet.label
                    ? "border-primary-600 dark:border-primary-500 text-slate-900 dark:text-white"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {snippet.label}
              </button>
            ))}
          </div>
          {snippets
            .filter((snippet) => snippet.label === openSnippet)
            .map((snippet) => (
              <div key={snippet.label} className="relative">
                <pre className="p-4 text-xs font-mono overflow-x-auto text-slate-600 dark:text-slate-300 leading-relaxed">
                  {snippet.code}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton value={snippet.code} />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
