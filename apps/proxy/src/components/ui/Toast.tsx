"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ============================================
// TOASTS
// Replaces the inline "message" <div> every admin page grew its own
// copy of. Transient confirmation belongs out of the document flow —
// inline banners push content around and get missed after a scroll.
// ============================================

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  toast: (tone: ToastTone, title: string, body?: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS: Record<ToastTone, number> = {
  success: 3200,
  info: 4000,
  // Errors stay noticeably longer — they usually carry text worth reading.
  error: 7000,
};

const TONE_STYLES: Record<ToastTone, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: "ring-emerald-600/20 dark:ring-emerald-500/25",
    icon: (
      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    ),
  },
  error: {
    ring: "ring-rose-600/20 dark:ring-rose-500/25",
    icon: (
      <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    ),
  },
  info: {
    ring: "ring-primary-600/20 dark:ring-primary-500/25",
    icon: (
      <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-500/15 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h1.5v5.25M12 7.5h.008" />
        </svg>
      </span>
    ),
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, body }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[tone]),
      );
    },
    [dismiss],
  );

  // Timers outlive the component without this — a toast fired right
  // before a route change would try to setState on an unmounted tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, body) => toast("success", title, body),
      error: (title, body) => toast("error", title, body),
      info: (title, body) => toast("info", title, body),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl ring-1 animate-slide-up
              bg-white dark:bg-slate-800 shadow-lg ${TONE_STYLES[item.tone].ring}`}
          >
            {TONE_STYLES[item.tone].icon}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900 dark:text-white">
                {item.title}
              </p>
              {item.body && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-line break-words">
                  {item.body}
                </p>
              )}
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
              className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Toasts are optional: components used both inside and outside a
 * provider (the approval screen renders standalone) get a no-op API
 * rather than a thrown error.
 */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  const fallback = useMemo<ToastApi>(
    () => ({
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    }),
    [],
  );
  return context ?? fallback;
}
