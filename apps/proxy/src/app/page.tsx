"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ============================================
// LANDING — the new story:
// problem → connect-your-key-safely → connectors marketplace → grants.
// Doubles as the owner login.
// ============================================

const FEATURES = [
  {
    icon: "🔑",
    title: "Your keys never leave home",
    body: "Store OpenAI, Groq, Anthropic, Gemini, Resend — any key — once, envelope-encrypted on your own deployment. Apps get access, never the key.",
  },
  {
    icon: "📜",
    title: "Grants, not blind trust",
    body: "Apps ask in writing: which resources, why, how much. You approve with budgets, expiry, renewal, and IP pinning — and revoke with one click.",
  },
  {
    icon: "🔌",
    title: "Providers are just data",
    body: "Connectors are reviewed JSON documents — install from the marketplace or wrap any REST API yourself. No redeploys, no plugins, no code.",
  },
  {
    icon: "🪶",
    title: "Zero-SDK for apps",
    body: "A static token works with any HTTP client or an unmodified OpenAI SDK. PoP signing keys are there when you want more for long-lived access.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/login")
      .then((res) => {
        if (res.ok) {
          router.push("/overview");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) throw new Error("Invalid admin secret");
      router.push("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }, [secret, router]);

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-30 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <p className="text-4xl">🍪</p>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Connect your key safely —{" "}
              <span className="text-primary-600 dark:text-primary-400">
                instead of trusting apps with it
              </span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Cookey is your self-hosted API gateway. Every BYOK app that asks
              you to paste an API key gets a scoped, budget-capped,
              time-limited grant instead — on your infrastructure, under your
              rules.
            </p>
            <div className="flex gap-3 text-sm">
              <Link href="/builder" className="btn-secondary">
                I'm an app developer →
              </Link>
              <a
                href="https://github.com/glueco/cookey"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Login card */}
          <div className="card glass p-6 space-y-4 max-w-sm w-full lg:justify-self-end">
            <h2 className="font-bold text-slate-900 dark:text-white">
              Gateway admin
            </h2>
            {checking ? (
              <p className="text-sm text-slate-500">Checking session…</p>
            ) : (
              <>
                <label className="block text-sm text-slate-600 dark:text-slate-300">
                  Admin secret
                  <input
                    id="secret"
                    type="password"
                    className="input w-full mt-1"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && login()}
                    autoFocus
                  />
                </label>
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
                <button
                  className="btn-primary w-full"
                  disabled={busy || !secret}
                  onClick={login}
                >
                  {busy ? "Signing in…" : "Open dashboard"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card p-5">
              <p className="text-2xl">{feature.icon}</p>
              <h3 className="font-semibold text-slate-900 dark:text-white mt-2">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {feature.body}
              </p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            How a connection happens
          </h3>
          <ol className="grid sm:grid-cols-4 gap-4 text-sm">
            {[
              ["1", "App asks", "The app publishes a grant document: what it wants, why, and under what limits."],
              ["2", "You review", "One screen shows every request, reason, and cost projection. Tighten anything."],
              ["3", "Token issued", "The app gets a ck_ token (or PoP keys) — never your provider key."],
              ["4", "You stay in control", "Budgets enforce themselves; grants expire by default; revoke instantly."],
            ].map(([step, title, body]) => (
              <li key={step} className="space-y-1">
                <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold">
                  {step}
                </span>
                <p className="font-medium text-slate-900 dark:text-white">{title}</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs">{body}</p>
              </li>
            ))}
          </ol>
        </div>

        <footer className="text-center text-xs text-slate-400">
          Cookey · self-hosted personal API gateway ·{" "}
          <a
            href="https://github.com/glueco/cookey/blob/main/docs/OWNER_GUIDE.md"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Owner guide
          </a>{" "}
          ·{" "}
          <Link href="/builder" className="underline">
            Grant builder
          </Link>
        </footer>
      </div>
    </main>
  );
}
