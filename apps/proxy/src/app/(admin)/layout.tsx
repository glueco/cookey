"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CookeyMark, getBrandInitial } from "@/components/CookeyLogo";
import { ToastProvider } from "@/components/ui";

// ============================================
// ADMIN LAYOUT
// Sidebar grouped by intent — Monitor / Access / Providers / Configure —
// because a flat seven-item list gives no clue which page answers which
// question. Auth-guarded: shows the owner login when the session cookie
// is missing.
// ============================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Renders the pending-grants count when > 0 */
  badge?: "pendingGrants";
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Monitor",
    items: [
      {
        href: "/overview",
        label: "Overview",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
        ),
      },
      {
        href: "/logs",
        label: "Logs",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        ),
      },
    ],
  },
  {
    group: "Access",
    items: [
      {
        href: "/grants",
        label: "Grants",
        badge: "pendingGrants",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        ),
      },
      {
        href: "/templates",
        label: "Templates",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
        ),
      },
    ],
  },
  {
    group: "Providers",
    items: [
      {
        href: "/connectors",
        label: "Connectors",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        ),
      },
      {
        href: "/marketplace",
        label: "Marketplace",
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
        ),
      },
    ],
  },
  {
    group: "Configure",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: (
          <>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </>
        ),
      },
    ],
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [gatewayName, setGatewayName] = useState("Cookey");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/login")
      .then((res) => res.json())
      .then((data) => {
        setAuthed(Boolean(data.authenticated));
        if (typeof data.gatewayName === "string" && data.gatewayName) {
          setGatewayName(data.gatewayName);
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  const login = async () => {
    setBusy(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) throw new Error("Invalid admin secret");
      setAuthed(true);
      setSecret("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    queryClient.clear();
    setAuthed(false);
    router.push("/overview");
  };

  if (authed === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <CookeyMark
          initial={getBrandInitial(gatewayName)}
          size={36}
          className="animate-pulse-soft"
        />
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pattern-dots opacity-60 pointer-events-none" />
        <div className="aura -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem]" />
        <div className="card p-7 w-full max-w-sm space-y-5 relative shadow-lg animate-fade-in-up">
          <div className="flex flex-col items-center gap-3 text-center">
            <CookeyMark initial={getBrandInitial(gatewayName)} size={44} />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                {gatewayName}
              </h1>
              <p className="field-hint mt-1">
                Sign in with your admin secret to manage keys and grants.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <input
              type="password"
              className={`input ${loginError ? "input-error" : ""}`}
              placeholder="Admin secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && secret && login()}
              autoFocus
            />
            {loginError && <p className="field-error">{loginError}</p>}
          </div>
          <button
            className="btn-primary w-full"
            disabled={busy || !secret}
            onClick={login}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className="min-h-screen flex">
          <Sidebar gatewayName={gatewayName} onLogout={logout} />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function Sidebar({
  gatewayName,
  onLogout,
}: {
  gatewayName: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  // Cheap enough to share with the Overview page's own query cache.
  const { data: stats } = useQuery<{ pendingGrants?: number }>({
    queryKey: ["stats"],
    queryFn: () => fetch("/api/admin/stats").then((res) => res.json()),
    refetchInterval: 60_000,
  });

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 p-3 flex flex-col sticky top-0 h-screen bg-white/60 dark:bg-slate-900/40">
      <Link
        href="/overview"
        className="flex items-center gap-2.5 px-2 py-2 mb-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
      >
        <CookeyMark initial={getBrandInitial(gatewayName)} size={26} />
        <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
          {gatewayName === "Cookey Gateway" ? "Cookey" : gatewayName}
        </span>
      </Link>

      <nav className="flex-1 space-y-4 overflow-y-auto scrollbar-hide">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="eyebrow px-3 mb-1">{section.group}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const badge =
                  item.badge === "pendingGrants"
                    ? (stats?.pendingGrants ?? 0)
                    : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors duration-150 ${
                      active
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {active && (
                      <span className="accent-fill absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full" />
                    )}
                    <svg
                      className={`w-[17px] h-[17px] shrink-0 ${
                        active
                          ? "accent-text"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      {item.icon}
                    </svg>
                    {item.label}
                    {badge > 0 && (
                      <span className="accent-fill ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1">
        <ThemeToggle />
        <NotificationsBell />
        <button
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
          className="btn-icon ml-auto"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
