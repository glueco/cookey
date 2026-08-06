"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";

// ============================================
// ADMIN LAYOUT (9.1)
// Sidebar: Overview, Grants, Connectors, Marketplace, Logs, Templates,
// Settings; ThemeToggle + notifications bell. Auth-guarded: shows the
// admin login when the session cookie is missing.
// ============================================

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/grants", label: "Grants" },
  { href: "/connectors", label: "Connectors" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/logs", label: "Logs" },
  { href: "/templates", label: "Templates" },
  { href: "/settings", label: "Settings" },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/login")
      .then((res) => setAuthed(res.ok))
      .catch(() => setAuthed(false));
  }, []);

  const login = async () => {
    setLoginError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (res.ok) {
      setAuthed(true);
      setSecret("");
    } else {
      setLoginError("Invalid admin secret");
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/");
  };

  if (authed === null) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-6 w-full max-w-sm space-y-4">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Gateway admin
          </h1>
          <input
            type="password"
            className="input w-full text-sm"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          {loginError && (
            <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
          )}
          <button className="btn-primary w-full" onClick={login}>
            Sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-1 sticky top-0 h-screen">
          <Link
            href="/overview"
            className="flex items-center gap-2 px-2 py-2 mb-3 font-bold text-slate-900 dark:text-white"
          >
            <span className="text-xl">🍪</span> Cookey
          </Link>
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  active
                    ? "bg-primary-600 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationsBell />
            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 ml-auto"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </QueryClientProvider>
  );
}
