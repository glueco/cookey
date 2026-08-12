"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CookeyMonogram } from "@/components/CookeyLogo";

// ============================================
// LANDING — the new story:
// problem → connect-your-key-safely → connectors marketplace → grants.
// Doubles as the owner login.
// ============================================

// Line icons, not emoji: emoji render differently on every platform and
// drag the whole page down to "weekend project" the moment they appear.
const FEATURES = [
  {
    path: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
    title: "Your keys never leave home",
    body: "Store OpenAI, Groq, Anthropic, Gemini, Resend — any key — once, envelope-encrypted on your own deployment. Apps get access, never the key.",
  },
  {
    path: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    title: "Grants, not blind trust",
    body: "Apps ask in writing: which resources, why, how much. You approve with budgets, expiry, renewal and IP pinning — and revoke with one click.",
  },
  {
    path: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244",
    title: "Providers are just data",
    body: "Connectors are reviewed JSON documents — install from the marketplace or wrap any REST API yourself. No redeploys, no plugins, no code.",
  },
  {
    path: "M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z",
    title: "Zero-SDK for apps",
    body: "A static token works with any HTTP client or an unmodified OpenAI SDK. PoP signing keys are there when you want more for long-lived access.",
  },
];

/**
 * Where to land after sign-in. Approval links pass `?next=` so the
 * owner returns to the request they were reviewing instead of the
 * dashboard. Local paths only — anything with a host or scheme is
 * ignored, so the login can never redirect off-site.
 */
function nextPath(): string {
  if (typeof window !== "undefined") {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  }
  return "/overview";
}

export default function LandingPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // GET /api/admin/login always returns 200; the answer is in the body.
    fetch("/api/admin/login")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          router.push(nextPath());
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
      router.push(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }, [secret, router]);

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-60 pointer-events-none" />
      <div className="aura top-[-8rem] right-[15%] w-[32rem] h-[32rem]" />
      <div className="aura bottom-[-10rem] left-[10%] w-[28rem] h-[28rem] opacity-70" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 space-y-16">
        {/* Hero */}
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-5 animate-fade-in-up">
            <div className="flex items-center gap-3">
              <CookeyMonogram size={48} />
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Cookey
              </span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
              Connect your key safely —{" "}
              <span className="text-gradient">
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
                  <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
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
            <div key={feature.title} className="card card-hover p-5">
              <span className="w-10 h-10 inline-flex items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={feature.path} />
                </svg>
              </span>
              <h3 className="font-semibold tracking-tight text-slate-900 dark:text-white mt-3">
                {feature.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
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
