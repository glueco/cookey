"use client";

import { useEffect, useState } from "react";

// ============================================
// DISPLAY PRIMITIVES
// Page chrome, stats, empty states and the small affordances (copy,
// relative time) that separate a dashboard from a data dump.
// ============================================

/** Page title + optional description and right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}

/** Card with a header rail. The default container for page sections. */
export function Section({
  title,
  description,
  actions,
  children,
  padded = true,
  className = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="section-header">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {description && (
              <p className="field-hint mt-0.5">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Stat tile. Deliberately typographic — no tinted gradient boxes. A
 * dashboard reads as premium when the NUMBERS carry the hierarchy and
 * the containers stay quiet.
 */
export function StatTile({
  label,
  value,
  hint,
  trend,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Sparkline series, oldest → newest */
  trend?: number[];
  href?: string;
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <div className="flex items-end justify-between gap-3 mt-2">
        <p className="text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-slate-900 dark:text-white truncate">
          {value}
        </p>
        {trend && trend.length > 1 && (
          <Sparkline series={trend} className="shrink-0 mb-0.5" />
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 h-4 truncate">
        {hint ?? ""}
      </p>
    </>
  );

  const className =
    "px-5 py-4 min-w-0 transition-colors duration-150" +
    (href ? " hover:bg-slate-50 dark:hover:bg-slate-800/40 block" : "");

  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Minimal area sparkline — no axes, no labels, pure shape. */
export function Sparkline({
  series,
  className = "",
  width = 64,
  height = 22,
}: {
  series: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  // A flat series would divide by zero; render it as a centred line.
  const span = max - min || 1;
  const step = width / (series.length - 1);
  const points = series.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polygon
        points={area}
        className="fill-primary-600/10 dark:fill-primary-500/15"
      />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-600 dark:stroke-primary-400"
      />
    </svg>
  );
}

/** Copy-to-clipboard with inline "Copied" feedback. */
export function CopyButton({
  value,
  label = "Copy",
  className = "btn-secondary btn-sm",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard is blocked outside a secure context — the value is
          // always select-all'able in the DOM as the fallback.
        }
      }}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

export function formatRelative(input: string | Date | null): string {
  if (!input) return "never";
  const date = typeof input === "string" ? new Date(input) : input;
  const delta = date.getTime() - Date.now();
  const absolute = Math.abs(delta);
  if (absolute < 45_000) return "just now";
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (absolute >= ms) return formatter.format(Math.round(delta / ms), unit);
  }
  return formatter.format(Math.round(delta / 60_000), "minute");
}

/**
 * Relative timestamp with the absolute value on hover. Rendered as a
 * placeholder on the server pass — Date.now() differs between server
 * and client, and a mismatch there is a hydration error.
 */
export function RelativeTime({
  value,
  className = "",
}: {
  value: string | Date | null;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!value) return <span className={className}>never</span>;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return <span className={className}>—</span>;

  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className={className}
      suppressHydrationWarning
    >
      {mounted ? formatRelative(date) : date.toLocaleDateString()}
    </time>
  );
}

/** Quota/usage meter. Turns amber at 75%, rose at 90%. */
export function UsageMeter({
  used,
  cap,
  label,
  format = (value: number) => value.toLocaleString(),
}: {
  used: number;
  cap: number | null;
  label: string;
  /** How a value renders — dollars pass `(v) => \`$${v.toFixed(2)}\`` */
  format?: (value: number) => string;
}) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  const bar =
    pct >= 90
      ? "bg-rose-500"
      : pct >= 75
        ? "bg-amber-500"
        : "bg-primary-600 dark:bg-primary-500";

  return (
    <div className="text-xs">
      <div className="flex justify-between gap-2">
        <span className="text-slate-500 dark:text-slate-400 truncate">
          {label}
        </span>
        <span className="tabular-nums shrink-0 text-slate-600 dark:text-slate-300">
          {format(used)}
          {cap ? (
            <span className="text-slate-400"> / {format(cap)}</span>
          ) : (
            <span className="text-slate-400"> · no cap</span>
          )}
        </span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        {cap ? (
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-premium ${bar}`}
            style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
          />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(154_162_173_/_0.25)_4px,rgb(154_162_173_/_0.25)_8px)]" />
        )}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`loading-spinner ${className}`} aria-hidden="true" />;
}

/** Full-panel loading placeholder that matches the final layout. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inline error block with a retry affordance. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="callout-danger flex items-start justify-between gap-3">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button className="btn-secondary btn-sm shrink-0" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
