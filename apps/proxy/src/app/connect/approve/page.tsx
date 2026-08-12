import { prisma } from "@/lib/db";
import { validateAdminSession } from "@/lib/auth-cookie";
import { listResourceCapabilities } from "@/server/connectors/catalog";
import {
  getGatewayName,
  getInactivitySuspendDaysDefault,
} from "@/server/settings";
import { parseDurationMs, parseDurationDays } from "@/server/grants/schema";
import ApprovalForm from "./ApprovalForm";
import {
  AppIdentityCard,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";
import { CookeyMark, getBrandInitial } from "@/components/CookeyLogo";

// ============================================
// GRANT APPROVAL PAGE
// Loaded from the approval link: /connect/approve?grant=<id>
// (?session= kept as an alias for older links)
//
// This is the highest-stakes screen in the product — it's where the
// owner decides what a third party may do with their keys and money.
// Layout follows that: identity first, then a linear review, with the
// decision itself parked in a rail that stays on screen throughout.
// ============================================

interface PageProps {
  searchParams: Promise<{ grant?: string; session?: string }>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen relative overflow-hidden py-8 px-4 sm:px-6">
      <div className="absolute inset-0 pattern-dots opacity-[0.55] pointer-events-none" />
      <div className="aura -top-40 left-1/2 -translate-x-1/2 w-[46rem] h-[46rem]" />
      <div className="relative z-10">{children}</div>
    </main>
  );
}

function ErrorCard({
  title,
  message,
  tone = "warning",
  action,
}: {
  title: string;
  message: string;
  tone?: "warning" | "danger";
  action?: { href: string; label: string };
}) {
  return (
    <Shell>
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="card p-8 max-w-md text-center animate-scale-in shadow-lg">
          <div
            className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${
              tone === "danger"
                ? "bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400"
                : "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white mb-1.5">
            {title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {message}
          </p>
          {action && (
            <a href={action.href} className="btn-primary mt-5">
              {action.label}
            </a>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default async function ApprovePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const grantId = params.grant ?? params.session;

  // Owner-only, like the POST that completes it. The grant id is not a
  // secret (the requesting app holds it), and this page lays out the
  // owner's configured connectors, models and pricing — none of which
  // an app should see before its request is even reviewed. Same dev
  // allowance as checkAdminAuth: no secret configured + development.
  const authed =
    (await validateAdminSession()) ||
    (!process.env.ADMIN_SECRET && process.env.NODE_ENV === "development");

  if (!authed) {
    // Sign-in carries this page as ?next= so the owner lands straight
    // back on the request they were sent to review.
    const next = grantId
      ? `/connect/approve?grant=${encodeURIComponent(grantId)}`
      : null;
    return (
      <ErrorCard
        title="Sign in to review this request"
        message="Approval links only work for the gateway owner."
        action={{
          href: next ? `/?next=${encodeURIComponent(next)}` : "/",
          label: "Go to sign in",
        }}
      />
    );
  }

  if (!grantId) {
    return (
      <ErrorCard
        title="Invalid approval link"
        message="This link carries no grant reference. Open it again from your gateway's Grants list."
      />
    );
  }

  const grant = await prisma.grant.findUnique({ where: { id: grantId } });

  if (!grant) {
    return (
      <ErrorCard
        title="Request not found"
        message="This approval link doesn't match any pending request. It may have expired or already been cleaned up."
      />
    );
  }

  if (grant.status !== "PENDING") {
    return (
      <ErrorCard
        title="Already handled"
        message={`This request was already ${grant.status
          .toLowerCase()
          .replace(/_/g, " ")}. Nothing further to decide.`}
      />
    );
  }

  const document = grant.document as unknown as GrantDocumentShape;

  // Every enabled connector, annotated with what the enforcement engine
  // can actually restrict on it — this is what lets the approval screen
  // offer real per-service limits instead of a hard-coded list.
  const [capabilities, inactivitySuspendDaysDefault, gatewayName] =
    await Promise.all([
      listResourceCapabilities(),
      getInactivitySuspendDaysDefault(),
      getGatewayName(),
    ]);

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <CookeyMark initial={getBrandInitial(gatewayName)} size={20} />
            Access request
          </span>
          <span className="badge-info">Awaiting your decision</span>
        </div>

        <div className="card overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-primary-50/70 via-transparent to-transparent dark:from-primary-500/[0.07]">
            <AppIdentityCard app={document.app} />
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="badge-neutral">Runs on: {document.runtime}</span>
              <span className="badge-neutral">
                {document.publicKey
                  ? "Signing key provided"
                  : "No signing key — static token only"}
              </span>
              {/* The HOST is the part an owner can actually verify; the
                  well-known path is noise and truncates mid-word. */}
              {grant.sourceUrl && (
                <span
                  className="badge-neutral"
                  title={grant.sourceUrl}
                >
                  Fetched from {hostOf(grant.sourceUrl)}
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            <ApprovalForm
              grantId={grant.id}
              document={document}
              capabilities={capabilities}
              requestedDurationMs={parseDurationMs(document.duration) ?? null}
              requestedRenewalDays={
                document.renewal
                  ? parseDurationDays(document.renewal.period)
                  : null
              }
              defaultInactivitySuspendDays={inactivitySuspendDaysDefault}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
