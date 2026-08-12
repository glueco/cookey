"use client";

import { useEffect, useId, useRef, useState } from "react";

// ============================================
// FORM CONTROLS
// The vocabulary the redesigned screens are built from. Everything here
// is uncontrolled-free: each takes value + onChange so pages stay the
// single source of truth.
// ============================================

/** Label + optional hint + error, wrapped around any control. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className = "",
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Horizontal choice control. Use for ≤5 mutually exclusive options. */
export function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  className = "",
  size = "md",
}: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={`segmented ${className}`} role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`${active ? "segmented-item-active" : "segmented-item"} ${
              size === "sm" ? "!px-2.5 !py-1 !text-xs" : ""
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** iOS-style toggle. Prefer over a checkbox for "on/off capability". */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  tone = "default",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  /** "danger" tints the ON state red — for switches that widen access */
  tone?: "default" | "danger";
}) {
  const id = useId();
  const onColor = tone === "danger" ? "bg-rose-600" : "accent-fill";
  return (
    <div className={`flex items-start gap-3 ${disabled ? "opacity-50" : ""}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative mt-0.5 shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ease-premium
          disabled:cursor-not-allowed
          ${checked ? onColor : "bg-slate-300 dark:bg-slate-700"}`}
      >
        {/* The knob takes the accent's own foreground colour when ON, so
            it stays visible even where the accent inverts to near-white
            on a dark canvas. */}
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ease-premium
            ${
              checked && tone !== "danger"
                ? "translate-x-4 bg-[rgb(var(--on-primary))]"
                : checked
                  ? "translate-x-4 bg-white"
                  : "translate-x-0 bg-white"
            }`}
        />
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">
          {label}
        </span>
        {description && (
          <span className="block field-hint mt-0.5">{description}</span>
        )}
      </label>
    </div>
  );
}

/** Checkbox rendered as a selectable card. For multi-select lists. */
export function CheckCard({
  checked,
  onChange,
  title,
  subtitle,
  meta,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`${checked ? "card-select-active" : "card-select"} !p-2.5 !rounded-lg flex items-start gap-2.5
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-900 dark:text-white">
          {title}
        </span>
        {subtitle && (
          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 text-xs text-slate-400">{meta}</span>}
    </label>
  );
}

/**
 * Number input that keeps "" (meaning "no limit") distinct from 0.
 * Budget fields depend on that distinction — 0 requests/day is a real
 * and very different answer from "unlimited".
 */
export function NumberField({
  value,
  onChange,
  placeholder = "unlimited",
  min = 1,
  suffix,
  className = "",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  suffix?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        className={`input ${suffix ? "pr-14" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * Free-form list of short strings as removable pills (IP ranges, email
 * domains, model ids). Commas, spaces and newlines all commit an entry
 * — owners paste these from other tools and shouldn't have to reformat.
 */
export function TagInput({
  values,
  onChange,
  placeholder,
  validate,
  mono = true,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Return an error string to reject an entry */
  validate?: (value: string) => string | null;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[\s,\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const accepted: string[] = [];
    for (const part of parts) {
      const problem = validate?.(part);
      if (problem) {
        setError(problem);
        continue;
      }
      if (!values.includes(part) && !accepted.includes(part)) {
        accepted.push(part);
      }
    }
    if (accepted.length > 0) {
      setError(null);
      onChange([...values, ...accepted]);
    }
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <div
        className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/50
          transition-[border-color,box-shadow]
          focus-within:border-[rgb(var(--primary))] focus-within:shadow-[0_0_0_3px_rgb(var(--primary)/0.2)]"
      >
        {values.map((value) => (
          <span
            key={value}
            className={`chip ${mono ? "font-mono" : ""} pr-1`}
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="ml-0.5 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          className={`flex-1 min-w-[8rem] bg-transparent px-1.5 py-1 text-sm outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 ${
            mono ? "font-mono" : ""
          }`}
          placeholder={values.length === 0 ? placeholder : "Add another…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            } else if (
              event.key === "Backspace" &&
              draft === "" &&
              values.length > 0
            ) {
              onChange(values.slice(0, -1));
            }
          }}
          // Committing on blur stops a typed-but-unsubmitted entry from
          // being silently dropped when the owner clicks Approve.
          onBlur={() => commit(draft)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[\s,\n]/.test(text)) {
              event.preventDefault();
              commit(text);
            }
          }}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Compact multi-select for a known set of short values (model ids). */
export function PillSelect({
  options,
  selected,
  onChange,
  emptyMeansAll = true,
}: {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** When true, an empty selection is presented as "all allowed" */
  emptyMeansAll?: boolean;
}) {
  const allSelected = selected.length === 0 && emptyMeansAll;
  const toggle = (option: string) => {
    // Leaving "all" for the first time starts from every option so the
    // owner narrows down rather than starting from nothing.
    if (allSelected) {
      onChange(options.filter((o) => o !== option));
      return;
    }
    const next = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option];
    onChange(next.length === options.length && emptyMeansAll ? [] : next);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = allSelected || selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={active ? "pill-select-active" : "pill-select"}
          >
            {option}
          </button>
        );
      })}
      {emptyMeansAll && !allSelected && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="px-2 py-1 rounded-md text-xs text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-800 dark:hover:text-slate-200"
        >
          allow all
        </button>
      )}
    </div>
  );
}

/**
 * "/" jumps to the search field, like GitHub and Linear. Attach the
 * returned ref to the input; the shortcut stays out of the way whenever
 * the user is already typing somewhere.
 */
export function useSlashFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return ref;
}
