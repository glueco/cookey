// ============================================
// GATEWAY-INTERNAL SHARED MODULE
// Folded from the former @glueco/shared package (Addendum A ruling #3).
// The SDKs vendor their own canonical-request code; docs/POP_PROTOCOL.md
// plus sdks/test-vectors.json are the cross-implementation contract.
// ============================================

/**
 * Resource identifier format: <resourceType>:<provider>
 * Examples: llm:groq, llm:gemini, mail:resend
 */
export type ResourceId = `${string}:${string}`;

/**
 * Parse a resource ID into its components.
 */
export function parseResourceId(resourceId: string): {
  resourceType: string;
  provider: string;
} {
  const parts = resourceId.split(":");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid resource ID format: ${resourceId}. Expected: <resourceType>:<provider>`,
    );
  }
  return {
    resourceType: parts[0],
    provider: parts[1],
  };
}

/**
 * Create a resource ID from components.
 */
export function createResourceId(
  resourceType: string,
  provider: string,
): ResourceId {
  return `${resourceType}:${provider}` as ResourceId;
}

export * from "./errors";
export * from "./schemas";
export * from "./pop";
export * from "./duration-presets";
