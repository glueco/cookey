import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Grant, GrantStatus } from "@prisma/client";
import {
  effectiveAuth,
  validateGrantDocument,
  type GrantDocument,
  type GrantDecisions,
} from "./schema";
import {
  mintGrantToken,
  revokeGrantTokens,
  computeTokenExpiry,
} from "./tokens";
import { createClaimCode } from "./claim-codes";
import { logger } from "@/lib/logger";

// ============================================
// GRANT LIFECYCLE SERVICE
// PENDING → ACTIVE → (SUSPENDED_*) ⇄ ACTIVE; terminal: EXPIRED/REVOKED/DENIED
// ============================================

export class GrantServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "GrantServiceError";
  }
}

/**
 * How long an approval link stays actionable. The sweep expires stale
 * PENDING grants on its schedule; approveGrant() enforces the same
 * cutoff at approval time, so the guarantee holds between runs too.
 */
export const PENDING_GRANT_MAX_AGE_DAYS = 7;

function pendingGrantExpired(grant: Grant, now: Date): boolean {
  const ageMs = now.getTime() - grant.createdAt.getTime();
  return ageMs > PENDING_GRANT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Create a PENDING grant (and its identity App) from a validated document.
 * All three intake paths — connect/prepare, well-known fetch, manual paste —
 * land here.
 */
export async function createPendingGrant(
  rawDocument: unknown,
  options: { sourceUrl?: string } = {},
): Promise<Grant> {
  const validation = validateGrantDocument(rawDocument);
  if (!validation.valid) {
    throw new GrantServiceError(
      `Invalid grant document: ${validation.errors
        .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
        .join("; ")}`,
    );
  }
  const document = validation.document;

  const app = await prisma.app.create({
    data: {
      name: document.app.name,
      description: document.app.description,
      homepage: document.app.homepage,
      status: "PENDING",
      ...(document.publicKey && {
        credentials: {
          create: { publicKey: document.publicKey, label: "primary" },
        },
      }),
    },
  });

  return prisma.grant.create({
    data: {
      appId: app.id,
      document: document as unknown as Prisma.InputJsonValue,
      authType: document.auth === "pop" ? "POP" : "BEARER",
      runtime: document.runtime,
      sourceUrl: options.sourceUrl,
    },
  });
}

export interface ApproveResult {
  grant: Grant;
  /** Plaintext token for the copy-paste screen (bearer, no redirect) */
  token?: string;
  /** Redirect URL carrying the claim code (bearer with redirectUri) */
  redirectUrl?: string;
}

/**
 * Approve a PENDING grant with the owner's decisions.
 * Materializes ResourcePermission rows, activates the app, and mints the
 * credential for the effective auth type.
 */
export async function approveGrant(
  grantId: string,
  decisions: GrantDecisions,
  options: { gatewayUrl?: string } = {},
): Promise<ApproveResult> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);
  if (grant.status !== "PENDING") {
    throw new GrantServiceError(`Grant is already ${grant.status}`, 409);
  }
  if (pendingGrantExpired(grant, new Date())) {
    await prisma.grant.update({
      where: { id: grant.id },
      data: { status: "EXPIRED" },
    });
    throw new GrantServiceError(
      `This request is over ${PENDING_GRANT_MAX_AGE_DAYS} days old and has expired — ask the app to request access again`,
      410,
    );
  }

  const document = grant.document as unknown as GrantDocument;

  // App-proposed access options are OPTIONAL and purely a narrowing:
  // the thing being approved is `document.requests`, which the app
  // wrote. Accepting an option drops the requests outside it; naming no
  // option approves the document as written. Only a name that doesn't
  // exist is an error — that means the client and the frozen document
  // disagree, and silently approving everything would be the wrong way
  // to resolve that.
  if (decisions.optionId) {
    const option = document.options?.find((o) => o.id === decisions.optionId);
    if (!option) {
      throw new GrantServiceError(
        `Unknown access option "${decisions.optionId}" — the document defines: ${
          document.options?.map((o) => o.id).join(", ") || "none"
        }`,
      );
    }
  }

  // Owners tighten, never widen: every action named in the decisions
  // must appear in the request it belongs to. Without this a crafted
  // approval payload could mint a permission the app never asked for.
  for (const [rawIndex, actions] of Object.entries(decisions.actions ?? {})) {
    const index = Number(rawIndex);
    const request = document.requests[index];
    if (!request) {
      throw new GrantServiceError(
        `Action selection refers to request ${rawIndex}, which does not exist`,
      );
    }
    const unknown = actions.filter((a) => !request.actions.includes(a));
    if (unknown.length > 0) {
      throw new GrantServiceError(
        `Request ${rawIndex} was not asked for: ${unknown.join(", ")}`,
      );
    }
  }

  // Credential type is the APP's property, not an owner decision: PoP
  // needs a public key to verify signatures against, and no approval
  // preference can produce one. Derived here rather than read from
  // `decisions.auth`, so a stale or hand-crafted payload can neither
  // downgrade a signing app to a static token nor claim PoP without a
  // key.
  const auth = effectiveAuth(document);

  if (auth === "pop") {
    const hasCredential = await prisma.appCredential.findFirst({
      where: { appId: grant.appId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!hasCredential && document.publicKey) {
      await prisma.appCredential.create({
        data: {
          appId: grant.appId,
          publicKey: document.publicKey,
          label: "primary",
        },
      });
    }
  }

  const now = new Date();
  const expiresAt = decisions.durationMs
    ? new Date(now.getTime() + decisions.durationMs)
    : null;
  const renewalPeriodDays = decisions.renewal?.periodDays ?? null;
  const currentPeriodEnd = renewalPeriodDays
    ? new Date(now.getTime() + renewalPeriodDays * 24 * 60 * 60 * 1000)
    : null;

  const permissionData = buildPermissionRows(grant, document, decisions, {
    expiresAt,
  });
  if (permissionData.length === 0) {
    throw new GrantServiceError(
      "Approval produced no permissions — keep at least one action enabled, " +
        "and bind every “any provider” request to a configured provider",
    );
  }

  // Normalized egress IP list — a whitespace/comma-only value must store
  // as null, or the pipeline would treat the grant as IP-pinned while the
  // matcher fails open on an empty pattern list.
  const egressIps =
    decisions.egressIps
      ?.split(/[\n,]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join(",") || null;

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional claim: only one concurrent approval can flip
    // PENDING → ACTIVE. The loser sees count 0 and aborts before any
    // permission rows or tokens exist for it.
    const claimed = await tx.grant.updateMany({
      where: { id: grant.id, status: "PENDING" },
      data: {
        status: "ACTIVE",
        // Freeze the DERIVED auth, not whatever the client sent — this
        // record is what the grant detail page reads back as "what was
        // agreed", so it must not preserve a value we ignored.
        decisions: { ...decisions, auth } as unknown as Prisma.InputJsonValue,
        authType: auth === "pop" ? "POP" : "BEARER",
        expiresAt,
        renewalPeriodDays,
        currentPeriodEnd,
        inactivitySuspendDays: decisions.inactivitySuspendDays ?? null,
        allowBrowser: decisions.allowBrowser ?? false,
        egressIps,
        approvedAt: now,
      },
    });
    if (claimed.count === 0) {
      throw new GrantServiceError("Grant was already processed", 409);
    }
    await tx.resourcePermission.createMany({
      data: permissionData,
      skipDuplicates: true,
    });
    await tx.app.update({
      where: { id: grant.appId },
      data: { status: "ACTIVE" },
    });
    return tx.grant.findUniqueOrThrow({ where: { id: grant.id } });
  });

  const gatewayUrl = process.env.GATEWAY_URL || options.gatewayUrl || "";
  const redirectTarget = safeRedirectUrl(document.redirectUri);

  if (auth === "pop") {
    // PoP apps hold their credential already — redirect back (when the
    // document asked for it) so the app can finish its connect flow.
    if (redirectTarget) {
      redirectTarget.searchParams.set("status", "approved");
      redirectTarget.searchParams.set("app_id", updated.appId);
      redirectTarget.searchParams.set("gateway", gatewayUrl);
      return { grant: updated, redirectUrl: redirectTarget.toString() };
    }
    return { grant: updated };
  }

  // Bearer: mint the token; deliver via claim-code redirect or copy-paste
  const { token } = await mintGrantToken(
    updated.id,
    computeTokenExpiry(updated),
  );

  if (redirectTarget) {
    const code = await createClaimCode(updated.id);
    redirectTarget.searchParams.set("code", code);
    redirectTarget.searchParams.set("gateway", gatewayUrl);
    return { grant: updated, redirectUrl: redirectTarget.toString() };
  }

  return { grant: updated, token };
}

/**
 * Parse a document's redirect target, accepting only http(s). Intake
 * validation pins the scheme now, but the document is frozen verbatim
 * on the Grant row — a grant created before that rule (or a
 * hand-inserted row) must not become a javascript: navigation or a
 * mid-approval crash. Unusable target → null, and the caller falls
 * back to copy-paste token delivery instead of failing the approval.
 */
function safeRedirectUrl(uri: string | null | undefined): URL | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Expand grant requests + owner decisions into ResourcePermission rows.
 * Wildcard requests use decisions.bindings[requestIndex]; concrete requests
 * bind to themselves.
 */
function buildPermissionRows(
  grant: Grant,
  document: GrantDocument,
  decisions: GrantDecisions,
  options: { expiresAt: Date | null },
): Prisma.ResourcePermissionCreateManyInput[] {
  const rows: Prisma.ResourcePermissionCreateManyInput[] = [];
  const budget = decisions.budget ?? {};
  const option = decisions.optionId
    ? document.options?.find((o) => o.id === decisions.optionId)
    : undefined;

  document.requests.forEach((request, index) => {
    // When an access option was accepted, requests outside it are skipped
    if (option && !option.requests.includes(index)) return;

    // Owner-narrowed action set. Absent = everything the request asked
    // for; empty = the owner dropped this request, so nothing is minted.
    const chosen = decisions.actions?.[String(index)];
    const actions = chosen ?? request.actions;
    if (actions.length === 0) return;

    const isWildcard = request.resource.endsWith(":*");
    const requestType = request.resource.split(":")[0];
    const resources = isWildcard
      ? (decisions.bindings?.[String(index)] ?? [])
      : [request.resource];

    for (const resourceId of resources) {
      if (resourceId.endsWith(":*")) continue; // bindings must be concrete
      // A binding answers "which provider of the REQUESTED type" — it
      // must not smuggle a different resource type past the request.
      if (isWildcard && !resourceId.startsWith(`${requestType}:`)) continue;
      const overrides = decisions.constraints?.[resourceId] ?? {};
      const constraints = { ...request.constraints, ...overrides };

      for (const action of actions) {
        rows.push({
          appId: grant.appId,
          grantId: grant.id,
          resourceId,
          action,
          expiresAt: options.expiresAt,
          constraints:
            Object.keys(constraints).length > 0
              ? (constraints as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          dailyQuota: budget.dailyRequests ?? null,
          monthlyQuota: budget.monthlyRequests ?? null,
          dailyTokenBudget: budget.dailyTokens ?? null,
          monthlyTokenBudget: budget.monthlyTokens ?? null,
          dailyCostBudgetUsd: budget.dailyCostUsd ?? null,
          monthlyCostBudgetUsd: budget.monthlyCostUsd ?? null,
        });
      }
    }
  });

  return rows;
}

/**
 * Deny a PENDING grant. The app row is kept (status REVOKED) so status
 * polling can report the rejection; cron cleanup prunes old denied grants.
 */
export async function denyGrant(grantId: string): Promise<Grant> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);
  if (grant.status !== "PENDING") {
    throw new GrantServiceError(`Grant is already ${grant.status}`, 409);
  }

  const [updated] = await prisma.$transaction([
    prisma.grant.update({
      where: { id: grantId },
      data: { status: "DENIED" },
    }),
    prisma.app.update({
      where: { id: grant.appId },
      data: { status: "REVOKED" },
    }),
  ]);
  return updated;
}

/**
 * Revoke a grant: immediate, terminal. Tokens die with it.
 */
export async function revokeGrant(grantId: string): Promise<Grant> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);

  await revokeGrantTokens(grantId);
  const [updated] = await prisma.$transaction([
    prisma.grant.update({
      where: { id: grantId },
      data: { status: "REVOKED" },
    }),
    prisma.app.update({
      where: { id: grant.appId },
      data: { status: "REVOKED" },
    }),
    prisma.resourcePermission.updateMany({
      where: { grantId },
      data: { status: "REVOKED" },
    }),
  ]);
  return updated;
}

/**
 * Renew a renewable grant: extends the current period and the SAME token's
 * expiry (no reissue — apps hold read-only config).
 */
export async function renewGrant(grantId: string): Promise<Grant> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);
  if (!grant.renewalPeriodDays) {
    throw new GrantServiceError("Grant is not renewable");
  }
  if (grant.status !== "ACTIVE" && grant.status !== "EXPIRED") {
    throw new GrantServiceError(`Cannot renew a ${grant.status} grant`, 409);
  }

  const newPeriodEnd = new Date(
    Date.now() + grant.renewalPeriodDays * 24 * 60 * 60 * 1000,
  );

  const updated = await prisma.grant.update({
    where: { id: grantId },
    data: {
      status: "ACTIVE",
      currentPeriodEnd: newPeriodEnd,
      // Renewal extends the grant itself, not just the period — otherwise
      // computeTokenExpiry() stays min'd to the old expiresAt and the
      // "renewed" grant re-expires on the next request/sweep.
      ...(grant.expiresAt &&
        grant.expiresAt < newPeriodEnd && { expiresAt: newPeriodEnd }),
    },
  });

  const tokenExpiry = computeTokenExpiry(updated);
  await prisma.grantToken.updateMany({
    where: { grantId, revokedAt: null },
    data: { expiresAt: tokenExpiry },
  });

  // Re-activate permissions that expired with the previous period and
  // push every live permission's expiry out to the new grant expiry.
  await prisma.resourcePermission.updateMany({
    where: { grantId, status: { in: ["ACTIVE", "EXPIRED"] } },
    data: {
      status: "ACTIVE",
      ...(updated.expiresAt && { expiresAt: updated.expiresAt }),
    },
  });

  return updated;
}

/**
 * Manual suspend / reactivate.
 */
export async function setGrantSuspended(
  grantId: string,
  suspended: boolean,
  reason: Extract<
    GrantStatus,
    "SUSPENDED_MANUAL" | "SUSPENDED_INACTIVITY" | "SUSPENDED_ANOMALY"
  > = "SUSPENDED_MANUAL",
): Promise<Grant> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);

  if (suspended) {
    if (grant.status !== "ACTIVE") {
      throw new GrantServiceError(`Cannot suspend a ${grant.status} grant`, 409);
    }
    return prisma.grant.update({
      where: { id: grantId },
      data: { status: reason },
    });
  }

  if (!grant.status.startsWith("SUSPENDED")) {
    throw new GrantServiceError(`Grant is not suspended (${grant.status})`, 409);
  }
  return prisma.grant.update({
    where: { id: grantId },
    data: { status: "ACTIVE" },
  });
}

/**
 * Regenerate the bearer token: revoke old tokens, mint a new one for the
 * same grant. Returns the plaintext exactly once.
 */
export async function regenerateToken(grantId: string): Promise<string> {
  const grant = await prisma.grant.findUnique({ where: { id: grantId } });
  if (!grant) throw new GrantServiceError("Grant not found", 404);
  if (grant.authType !== "BEARER") {
    throw new GrantServiceError("Grant does not use bearer auth");
  }
  if (grant.status !== "ACTIVE") {
    throw new GrantServiceError(`Cannot mint a token for a ${grant.status} grant`, 409);
  }

  await revokeGrantTokens(grantId);
  const { token } = await mintGrantToken(grantId, computeTokenExpiry(grant));
  logger.info("Grant token regenerated", { grantId });
  return token;
}
