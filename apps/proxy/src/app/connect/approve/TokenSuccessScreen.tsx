"use client";

import { useState } from "react";

// ============================================
// TOKEN COPY-PASTE SCREEN
// Shown once at approval (and mirrored on the grant detail page until
// first data-plane use). Per-language snippets for zero-SDK usage.
// ============================================

interface Props {
  token: string;
  appName: string;
  boundResources: string[];
}

export function TokenSuccessScreen({ token, appName, boundResources }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const gateway =
    typeof window !== "undefined" ? window.location.origin : "https://your-gateway";
  const llmResource = boundResources.find((r) => r.startsWith("llm:"));
  const providerPath = llmResource
    ? `/r/llm/${llmResource.split(":")[1]}`
    : "/r/llm/<provider>";

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

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
      code: `from openai import OpenAI

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

  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-900 dark:text-white">
          Access granted to {appName}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Copy this token into the app's configuration. It stays viewable on
          the grant page until its first request, then it can only be revoked
          or regenerated.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-slate-900 dark:bg-slate-800 flex items-center gap-3">
        <code className="flex-1 text-sm text-emerald-300 font-mono break-all select-all">
          {token}
        </code>
        <button
          className="btn-secondary text-xs whitespace-nowrap"
          onClick={() => copy("token", token)}
        >
          {copied === "token" ? "Copied!" : "Copy token"}
        </button>
      </div>

      <div className="space-y-3">
        {snippets.map((snippet) => (
          <details
            key={snippet.label}
            className="rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <summary className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none flex items-center justify-between">
              {snippet.label}
            </summary>
            <div className="relative">
              <pre className="p-4 pt-2 text-xs overflow-x-auto text-slate-600 dark:text-slate-300">
                {snippet.code}
              </pre>
              <button
                className="absolute top-1 right-2 text-xs text-primary-600 dark:text-primary-400"
                onClick={() => copy(snippet.label, snippet.code)}
              >
                {copied === snippet.label ? "Copied!" : "Copy"}
              </button>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
