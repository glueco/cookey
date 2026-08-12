import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  approveGrant,
  denyGrant,
  GrantServiceError,
} from "@/server/grants/service";
import { GrantDecisionsSchema, type GrantDecisions } from "@/server/grants/schema";
import { checkAdminAuth } from "@/lib/admin-auth";
import { resolveConnector } from "@/server/connectors/registry";
import {
  deriveConstraintSpecs,
  sanitizeConstraints,
} from "@/server/connectors/capabilities";

// ============================================
// POST /api/connect/approve
// Complete a pending grant (approve with decisions, or deny).
// OWNER-ONLY: the grant id is NOT a secret (apps receive it from
// /api/connect/prepare), so this endpoint must be admin-authenticated —
// otherwise an app could self-approve its own grant and mint a token.
// ============================================

const ApproveRequestSchema = z.object({
  sessionToken: z.string().min(1), // grant id
  decision: z.enum(["approve", "deny"]),
  decisions: GrantDecisionsSchema.optional(),
});

/**
 * Keep only the constraint keys the bound connector can actually
 * enforce, coerced to the shapes the enforcement engine reads.
 *
 * The approval screen derives its controls from the same specs, so in
 * normal use nothing is dropped. This exists for the abnormal cases: a
 * tab left open across a connector downgrade, or a hand-rolled POST.
 * An unenforceable key stored on a permission is worse than useless —
 * it shows up on the grant detail page as a limit that isn't real.
 */
async function sanitizeDecisionConstraints(
  decisions: GrantDecisions,
): Promise<GrantDecisions> {
  const entries = Object.entries(decisions.constraints ?? {});
  if (entries.length === 0) return decisions;

  const cleaned: Record<string, Record<string, unknown>> = {};
  for (const [resourceId, raw] of entries) {
    const connector = await resolveConnector(resourceId);
    if (!connector) continue; // no such connector → nothing to enforce
    const kept = sanitizeConstraints(
      deriveConstraintSpecs(connector.document),
      raw,
    );
    if (Object.keys(kept).length > 0) cleaned[resourceId] = kept;
  }

  return { ...decisions, constraints: cleaned };
}

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json(
      { error: "Unauthorized — sign in as the gateway owner to approve grants" },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ApproveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: parsed.error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.decision === "approve") {
      if (!parsed.data.decisions) {
        return NextResponse.json(
          { error: "decisions required for approval" },
          { status: 400 },
        );
      }

      const decisions = await sanitizeDecisionConstraints(
        parsed.data.decisions,
      );

      const result = await approveGrant(
        parsed.data.sessionToken,
        decisions,
        { gatewayUrl: request.nextUrl.origin },
      );

      return NextResponse.json({
        status: "approved",
        appId: result.grant.appId,
        grantId: result.grant.id,
        // Exactly one of these is set for bearer grants:
        // token → copy-paste screen; redirectUri → claim-code delivery
        ...(result.token && { token: result.token }),
        ...(result.redirectUrl && { redirectUri: result.redirectUrl }),
      });
    } else {
      await denyGrant(parsed.data.sessionToken);
      return NextResponse.json({ status: "denied" });
    }
  } catch (error) {
    if (error instanceof GrantServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Approve error:", error);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 },
    );
  }
}
