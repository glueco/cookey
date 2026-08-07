import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/lib/admin-auth";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { createPendingGrant, GrantServiceError } from "@/server/grants/service";

// ============================================
// POST /api/admin/grants/fetch
// Well-known discovery (5.2 path 1): { appUrl } →
// fetch <appUrl>/.well-known/cookey-grant.json (SSRF-guarded) →
// create a PENDING grant for review.
// ============================================

const WELL_KNOWN_PATH = "/.well-known/cookey-grant.json";

const FetchRequestSchema = z.object({
  appUrl: z.string().url(),
});

export async function POST(request: NextRequest) {
  if (!(await checkAdminAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = FetchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { appUrl: <https URL of the app> }" },
      { status: 400 },
    );
  }

  const base = new URL(parsed.data.appUrl);
  const wellKnownUrl = new URL(WELL_KNOWN_PATH, base.origin).toString();

  let text: string;
  try {
    const result = await safeFetch(wellKnownUrl);
    if (result.status !== 200) {
      return NextResponse.json(
        {
          error: `The app returned HTTP ${result.status} for ${WELL_KNOWN_PATH}`,
        },
        { status: 422 },
      );
    }
    text = result.text;
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return NextResponse.json(
        { error: `Could not fetch grant document: ${error.message}` },
        { status: 422 },
      );
    }
    throw error;
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: `${WELL_KNOWN_PATH} did not contain valid JSON` },
      { status: 422 },
    );
  }

  try {
    const grant = await createPendingGrant(document, {
      sourceUrl: wellKnownUrl,
    });
    return NextResponse.json({
      grant,
      approvalUrl: `${process.env.GATEWAY_URL || request.nextUrl.origin}/connect/approve?grant=${grant.id}`,
    });
  } catch (error) {
    if (error instanceof GrantServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
