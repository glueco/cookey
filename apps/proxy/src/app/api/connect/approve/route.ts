import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  approveGrant,
  denyGrant,
  GrantServiceError,
} from "@/server/grants/service";
import { GrantDecisionsSchema } from "@/server/grants/schema";

// ============================================
// POST /api/connect/approve
// Complete a pending grant (approve with decisions, or deny).
// Keyed by the grant id (the approval-link secret), matching the old
// session-token trust model.
// ============================================

const ApproveRequestSchema = z.object({
  sessionToken: z.string().min(1), // grant id
  decision: z.enum(["approve", "deny"]),
  decisions: GrantDecisionsSchema.optional(),
});

export async function POST(request: NextRequest) {
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

      const result = await approveGrant(
        parsed.data.sessionToken,
        parsed.data.decisions,
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
