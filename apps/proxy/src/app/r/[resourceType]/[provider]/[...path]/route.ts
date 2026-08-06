import { NextRequest, NextResponse } from "next/server";
import { processGatewayRequest, logRequest } from "@/server/gateway/pipeline";
import { resolveConnector } from "@/server/connectors/registry";
import { pathMatchesPattern } from "@/server/adapters/http-passthrough";
import {
  ChatCompletionRequestSchema,
  ErrorCode,
  getErrorStatus,
  createResourceId,
} from "@glueco/shared";
import { CORS_HEADERS, CORS_PREFLIGHT_HEADERS } from "@/lib/cors";

// ============================================
// Resource Router: /r/[resourceType]/[provider]/[...path]
// Resolves the connector from the runtime registry.
// Path shapes (unchanged):
//   /r/llm/groq/chat.completions           -> action chat.completions
//   /r/llm/groq/v1/chat/completions        -> action chat.completions (OpenAI compat)
//   /r/mail/resend/emails/send             -> action emails.send
// http-passthrough connectors instead match the remaining path against
// their actions' pathPattern globs and forward it verbatim.
// ============================================

interface RouteParams {
  params: Promise<{
    resourceType: string;
    provider: string;
    path?: string[];
  }>;
}

/**
 * Extract action from path segments (non-passthrough connectors).
 */
function extractAction(pathSegments?: string[]): string {
  if (!pathSegments || pathSegments.length === 0) {
    throw new Error("Action not specified in path");
  }

  // Handle OpenAI-compatible path: v1/chat/completions
  if (pathSegments[0] === "v1") {
    const remaining = pathSegments.slice(1);
    if (remaining.length === 0) {
      throw new Error("Action not specified after v1/");
    }
    return remaining.join(".");
  }

  return pathSegments.join(".");
}

function errorResponse(code: ErrorCode, message: string, status?: number) {
  return NextResponse.json(
    { error: { code, message, type: code } },
    { status: status ?? getErrorStatus(code), headers: CORS_HEADERS },
  );
}

async function handle(request: NextRequest, { params }: RouteParams) {
  const { resourceType, provider, path } = await params;
  const resourceId = createResourceId(resourceType, provider);

  // Resolve connector (enabled only; disabled connectors 404)
  const resolved = await resolveConnector(resourceId);
  if (!resolved) {
    return errorResponse(
      ErrorCode.ERR_UNKNOWN_RESOURCE,
      `Resource '${resourceId}' is not available on this gateway. See /api/resources for what is.`,
    );
  }

  const { document: connector } = resolved;
  const isPassthrough = connector.adapter === "http-passthrough";

  // Resolve the action
  let action: string;
  let subPath: string | undefined;

  if (isPassthrough) {
    // Passthrough requests supply their own sub-path; match it against
    // each action's method + pathPattern allowlist
    const search = request.nextUrl.search ?? "";
    const rawPath = `/${(path ?? []).join("/")}`;
    const match = Object.entries(connector.actions).find(
      ([, spec]) =>
        spec.method === request.method &&
        spec.pathPattern &&
        pathMatchesPattern(rawPath, spec.pathPattern),
    );
    if (!match) {
      return errorResponse(
        ErrorCode.ERR_UNSUPPORTED_ACTION,
        `No allowed action matches ${request.method} ${rawPath} on ${resourceId}`,
      );
    }
    action = match[0];
    subPath = `${rawPath}${search}`;
  } else {
    try {
      action = extractAction(path);
    } catch {
      return errorResponse(
        ErrorCode.ERR_INVALID_REQUEST,
        "Action not specified in path",
        400,
      );
    }

    const actionSpec = connector.actions[action];
    if (!actionSpec) {
      return errorResponse(
        ErrorCode.ERR_UNSUPPORTED_ACTION,
        `Action '${action}' not supported by ${resourceId}. Supported actions: ${Object.keys(connector.actions).join(", ")}`,
      );
    }
    if (actionSpec.method !== request.method) {
      return errorResponse(
        ErrorCode.ERR_INVALID_REQUEST,
        `Action '${action}' expects ${actionSpec.method}`,
        405,
      );
    }
  }

  // ============================================
  // Buffer-based body handling (read once, use everywhere)
  // ============================================
  let rawBody: Uint8Array;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
  } catch {
    return errorResponse(
      ErrorCode.ERR_INVALID_REQUEST,
      "Failed to read request body",
      400,
    );
  }

  const body = new TextDecoder().decode(rawBody);

  const contentType = request.headers.get("content-type") || "";
  const isJsonRequest = contentType.includes("application/json");

  let input: unknown;
  if (isPassthrough) {
    // Body bytes forwarded untouched
    input = rawBody.byteLength > 0 ? rawBody : undefined;
  } else if (isJsonRequest && body) {
    try {
      input = JSON.parse(body);
    } catch {
      return errorResponse(
        ErrorCode.ERR_INVALID_JSON,
        "Invalid JSON in request body",
        400,
      );
    }
  } else {
    input = undefined;
  }

  // Canonical-shape validation for LLM chat (single parse, once):
  // any OpenAI SDK pointed at /r/llm/<provider> speaks this shape
  let stream = false;
  if (!isPassthrough && resourceType === "llm" && action === "chat.completions" && input) {
    const parsed = ChatCompletionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return errorResponse(
        ErrorCode.ERR_INVALID_REQUEST,
        `Invalid request: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        400,
      );
    }
    stream = parsed.data.stream ?? false;
  } else if (
    !isPassthrough &&
    input &&
    typeof input === "object" &&
    (input as { stream?: unknown }).stream === true
  ) {
    stream = true;
  }

  const endpointPath = `/r/${resourceType}/${provider}/${path?.join("/") || ""}`;

  const result = await processGatewayRequest(request, body, {
    resourceId,
    action,
    input,
    stream,
    rawBody,
    subPath,
  });

  // Log request asynchronously
  logRequest(result, resourceId, action, endpointPath, request.method).catch(
    console.error,
  );

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          message: result.error!.message,
          type: result.error!.code,
          code: result.error!.code,
        },
      },
      { status: result.error!.status, headers: CORS_HEADERS },
    );
  }

  // Streaming (or non-JSON passthrough) response
  if (result.result!.stream) {
    return new Response(result.result!.stream, {
      headers: {
        "Content-Type": result.result!.contentType,
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS_HEADERS,
      },
    });
  }

  return NextResponse.json(result.result!.response, {
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_PREFLIGHT_HEADERS,
  });
}
