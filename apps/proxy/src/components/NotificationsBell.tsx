"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RelativeTime } from "@/components/ui";

// ============================================
// NOTIFICATIONS BELL
// Unread badge + dropdown feed from /api/admin/notifications.
// Clicking an item marks it read and deep-links to its subject
// (grant detail / connectors) when the payload identifies one.
// ============================================

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { grantId?: string; connectorId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

function linkFor(item: NotificationItem): string | null {
  if (item.payload?.grantId) return `/grants/${item.payload.grantId}`;
  if (item.payload?.connectorId) return "/connectors";
  return null;
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Non-fatal — bell just stays empty
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/admin/notifications/all", { method: "PATCH" });
    load();
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.readAt) {
      await fetch(`/api/admin/notifications/${item.id}`, { method: "PATCH" });
      load();
    }
    const href = linkFor(item);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        title="Notifications"
        className="btn-icon relative"
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // The bell lives at the BOTTOM of the sidebar — the panel opens
        // upward and to the right so it never clips off-screen.
        <div className="absolute bottom-full mb-2 left-0 w-[22rem] max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 animate-scale-in origin-bottom-left">
          <div className="section-header sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl">
            <span className="section-title">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline underline-offset-2"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-5 field-hint text-center">
              Nothing to report. Grant requests and budget warnings land here.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openItem(item)}
                onKeyDown={(e) => e.key === "Enter" && openItem(item)}
                className={`relative px-4 py-3 border-b border-slate-100 dark:border-slate-800/70 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                  item.readAt ? "opacity-55" : ""
                }`}
              >
                {!item.readAt && (
                  <span className="absolute left-1.5 top-4 w-1.5 h-1.5 rounded-full bg-primary-600 dark:bg-primary-500" />
                )}
                <p className="text-[13px] font-medium text-slate-900 dark:text-white">
                  {item.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {item.body}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  <RelativeTime value={item.createdAt} />
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
