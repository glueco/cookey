import { prisma } from "@/lib/db";
import { listEnabledConnectors } from "@/server/connectors/registry";
import { getInactivitySuspendDaysDefault } from "@/server/settings";
import {
  parseDurationMs,
  parseDurationDays,
} from "@/server/grants/schema";
import ApprovalForm from "./ApprovalForm";
import {
  AppIdentityCard,
  RawJsonExpander,
  type GrantDocumentShape,
} from "@/components/document/GrantDocumentReview";

// ============================================
// GRANT APPROVAL PAGE (9.3)
// Loaded from the approval link: /connect/approve?grant=<id>
// (?session= kept as an alias for older links)
// ============================================

interface PageProps {
  searchParams: { grant?: string; session?: string };
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center card p-8 max-w-md animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {title}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">{message}</p>
      </div>
    </main>
  );
}

export default async function ApprovePage({ searchParams }: PageProps) {
  const grantId = searchParams.grant ?? searchParams.session;

  if (!grantId) {
    return (
      <ErrorCard
        title="Invalid Request"
        message="No grant reference provided."
      />
    );
  }

  const grant = await prisma.grant.findUnique({ where: { id: grantId } });

  if (!grant) {
    return (
      <ErrorCard
        title="Not Found"
        message="This approval link does not match any pending request."
      />
    );
  }

  if (grant.status !== "PENDING") {
    return (
      <ErrorCard
        title="Already Processed"
        message={`This request has already been handled (${grant.status.toLowerCase().replace(/_/g, " ")}).`}
      />
    );
  }

  const document = grant.document as unknown as GrantDocumentShape;

  // Configured providers for wildcard binding + pricing for projection,
  // plus the owner's default inactivity-suspend window
  const [secrets, connectors, inactivitySuspendDaysDefault] = await Promise.all([
    prisma.resourceSecret.findMany({
      where: { status: "ACTIVE" },
      select: { resourceId: true, name: true, resourceType: true },
      orderBy: { resourceId: "asc" },
    }),
    listEnabledConnectors(),
    getInactivitySuspendDaysDefault(),
  ]);
  const connectorInfo = Object.fromEntries(
    connectors.map((connector) => [
      connector.id,
      { models: connector.models ?? [], pricing: connector.pricing },
    ]),
  );

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 pattern-dots opacity-30 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10 animate-fade-in-up">
        <div className="card glass overflow-hidden">
          {/* App identity */}
          <div className="p-6 bg-gradient-to-br from-primary-500/10 via-primary-500/5 to-transparent border-b border-slate-200 dark:border-slate-700">
            <AppIdentityCard app={document.app} />
            <div className="mt-3 flex gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                runtime: {document.runtime}
              </span>
            </div>
          </div>

          {/* Approval Form */}
          <div className="p-6">
            <ApprovalForm
              grantId={grant.id}
              document={document}
              availableResources={secrets}
              connectorInfo={connectorInfo}
              requestedDurationMs={parseDurationMs(document.duration) ?? null}
              requestedRenewalDays={
                document.renewal
                  ? parseDurationDays(document.renewal.period)
                  : null
              }
              defaultInactivitySuspendDays={inactivitySuspendDaysDefault}
            />
            <RawJsonExpander value={document} />
          </div>
        </div>
      </div>
    </main>
  );
}
