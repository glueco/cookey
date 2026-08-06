import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkAdminAuth } from "@/lib/admin-auth";
import { decryptSecret } from "@/lib/vault";
import { resolveConnector } from "@/server/connectors/registry";
import { applyEnforcement, mapUpstreamError } from "@/server/gateway/enforce";
import { UpstreamError } from "@/server/adapters";

// ============================================
// POST /api/admin/connectors/test-call
// Custom-builder "Test call": fires a minimal request through the real
// enforcement + adapter + egress-guard path (no grant needed — this is
// the owner testing their own connector). Shows result/error verbatim
// (with the credential redacted).
// ============================================

const TestCallSchema = z.object({
  connectorId: z.string().min(1),
  action: z.string().min(1),
  input: z.unknown().optional(),
  /** http-passthrough: sub-path to forward */
  subPath: z.string().optional(),
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

  const parsed = TestCallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { connectorId, action, input?, subPath? }" },
      { status: 400 },
    );
  }
  const { connectorId, action, input, subPath } = parsed.data;

  const resolved = await resolveConnector(connectorId);
  if (!resolved) {
    return NextResponse.json(
      { error: `Connector '${connectorId}' not found or disabled` },
      { status: 404 },
    );
  }
  const { document: connector, adapter } = resolved;

  const actionSpec = connector.actions[action];
  if (!actionSpec) {
    return NextResponse.json(
      { error: `Action '${action}' not defined. Available: ${Object.keys(connector.actions).join(", ")}` },
      { status: 404 },
    );
  }

  const resourceSecret = await prisma.resourceSecret.findUnique({
    where: { resourceId: connectorId },
  });
  if (!resourceSecret || resourceSecret.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "No credentials configured — save an API key first" },
      { status: 422 },
    );
  }

  const secret = decryptSecret({
    encryptedKey: resourceSecret.encryptedKey,
    keyIv: resourceSecret.keyIv,
  });
  const secretConfig =
    (resourceSecret.config as Record<string, unknown> | null) ?? {};
  const credentials: Record<string, string> = { apiKey: secret };
  for (const [key, value] of Object.entries(secretConfig)) {
    if (typeof value === "string") credentials[key] = value;
  }
  const effectiveConfig = {
    ...connector.config,
    ...(typeof secretConfig.baseUrl === "string" && {
      baseUrl: secretConfig.baseUrl,
    }),
  };

  // Enforcement runs unconstrained (empty constraints) — this exercises
  // rule wiring (clamp defaults, connector model catalog) exactly as the
  // pipeline would
  const enforcement = applyEnforcement(actionSpec, connector, {}, input);
  if (!enforcement.allowed) {
    return NextResponse.json(
      { ok: false, stage: "enforcement", error: enforcement.violation },
      { status: 200 },
    );
  }

  try {
    const built = adapter.buildRequest(
      actionSpec,
      enforcement.body,
      { secret, credentials, config: effectiveConfig, connector, subPath },
      { stream: false },
    );

    const targetHost = new URL(built.url).hostname.toLowerCase();
    const allowedHosts = (connector.allowedHosts ?? []).map((h) =>
      h.toLowerCase(),
    );
    if (!allowedHosts.includes(targetHost)) {
      return NextResponse.json(
        {
          ok: false,
          stage: "egress",
          error: { message: `Egress blocked: '${targetHost}' is not in allowedHosts` },
        },
        { status: 200 },
      );
    }

    const upstream = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      ...(built.body !== undefined && { body: built.body }),
    });

    if (!upstream.ok) {
      throw new UpstreamError(upstream.status, await upstream.text());
    }

    const result = await adapter.parseResponse(actionSpec, upstream, {
      stream: false,
    });

    // Streams are drained to a preview for display
    let response = result.response;
    if (!response && result.stream) {
      const text = await new Response(result.stream).text();
      response = text.slice(0, 2000);
    }

    return NextResponse.json({ ok: true, status: upstream.status, response });
  } catch (error) {
    if (error instanceof UpstreamError) {
      const mapped = mapUpstreamError(connector, error.status, error.body, secret);
      return NextResponse.json(
        { ok: false, stage: "upstream", error: mapped },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        stage: "adapter",
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 200 },
    );
  }
}
