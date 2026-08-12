"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// CONFIRM DIALOG
// Replaces window.confirm() for destructive actions. Beyond looks, the
// native dialog can't say WHAT is about to happen — revoking a grant
// kills live tokens, and the owner deserves to see that named before
// they click.
// ============================================

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Label of the confirming button */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** When set, the owner must type this exact string to enable confirm */
  typeToConfirm?: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Returns [confirm, dialog]. Render `dialog` anywhere in the tree and
 * `await confirm({...})` wherever the action fires.
 */
export function useConfirm(): [
  (options: ConfirmOptions) => Promise<boolean>,
  React.ReactNode,
] {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [typed, setTyped] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
      setTyped("");
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    document.addEventListener("keydown", onKey);
    // Focus lands on the confirming button only when there's no
    // type-to-confirm gate — otherwise the input is the real first stop.
    if (!pending.typeToConfirm) confirmButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  const gateSatisfied =
    !pending?.typeToConfirm || typed.trim() === pending.typeToConfirm;

  const dialog = pending ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] animate-fade-in"
        onClick={() => settle(false)}
      />
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-5 animate-scale-in">
        <div className="flex items-start gap-3">
          {pending.tone === "danger" && (
            <span className="w-9 h-9 shrink-0 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <h2
              id="confirm-title"
              className="text-[15px] font-semibold text-slate-900 dark:text-white"
            >
              {pending.title}
            </h2>
            {pending.body && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {pending.body}
              </p>
            )}
          </div>
        </div>

        {pending.typeToConfirm && (
          <label className="block mt-4">
            <span className="field-hint">
              Type <code className="code-inline">{pending.typeToConfirm}</code>{" "}
              to confirm
            </span>
            <input
              autoFocus
              className="input mt-1.5"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && gateSatisfied) settle(true);
              }}
            />
          </label>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" onClick={() => settle(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmButtonRef}
            disabled={!gateSatisfied}
            className={pending.tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={() => settle(true)}
          >
            {pending.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}
