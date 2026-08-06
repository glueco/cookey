import type { ZodSchema } from "zod";
import type { ActionSpec, ConnectorDocument } from "@/server/connectors/schema";

// ============================================
// ADAPTER CONTRACT (4.2)
// Adapters are the ONLY real code behind connectors. They do wire-format
// translation exclusively — enforcement, usage extraction, and error
// mapping are generic engine code driven by the connector document.
// ============================================

export interface AdapterContext {
  /** Resolved decrypted primary credential (apiKey) */
  secret: string;
  /** All resolved credential fields (from ResourceSecret.config + secret) */
  credentials: Record<string, string>;
  /** connector.config (frozen) */
  config: Record<string, unknown>;
  /** Full frozen document (for models, errorMap, ...) */
  connector: ConnectorDocument;
  /** http-passthrough only: the request's remaining sub-path + query */
  subPath?: string;
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: BodyInit;
}

export interface AdapterResult {
  /** For non-streaming responses (already gateway-canonical) */
  response?: unknown;
  /** For streaming responses (already gateway-canonical SSE) */
  stream?: ReadableStream<Uint8Array>;
  contentType: string;
}

export interface Adapter {
  id: string;
  /** Validates connector.config at install */
  configSchema: ZodSchema;
  /** Shape/translate the (already-enforced) input into the provider wire format */
  buildRequest(
    action: ActionSpec,
    input: unknown,
    ctx: AdapterContext,
    opts: { stream: boolean },
  ): BuiltRequest;
  /** Translate the provider response back to the gateway-canonical shape */
  parseResponse(
    action: ActionSpec,
    response: Response,
    opts: { stream: boolean },
  ): Promise<AdapterResult>;
}

/** Thrown by the pipeline when the upstream answers non-2xx. */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Upstream error: ${status}`);
    this.name = "UpstreamError";
  }
}
