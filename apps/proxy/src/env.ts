// ============================================
// ENVIRONMENT VARIABLE HELPER
// Handles demo branch environment switching
// ============================================

/**
 * Check if running on demo branch (Vercel sets VERCEL_GIT_COMMIT_REF automatically)
 */
function isDemo(): boolean {
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  return branch === "demo";
}

// Database URL - uses DEMO_ prefix on demo branch
export const DATABASE_URL =
  (isDemo() ? process.env.DEMO_DATABASE_URL : undefined) ??
  process.env.DATABASE_URL;

// ============================================
// CRITICAL: Override process.env for libraries that read directly
// Prisma reads from process.env, not our exports
// ============================================
if (isDemo()) {
  if (DATABASE_URL) {
    process.env.DATABASE_URL = DATABASE_URL;
  }
}

// Validation
if (!DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL (or DEMO_DATABASE_URL on demo branch)"
  );
}

// ============================================
// GATEWAY_URL - Public URL of this gateway
// Used for generating callback URLs and connection flows
// ============================================
const rawGatewayUrl =
  (isDemo() ? process.env.DEMO_GATEWAY_URL : undefined) ??
  process.env.GATEWAY_URL;

// Validate and normalize GATEWAY_URL (remove trailing slash if present)
export const GATEWAY_URL = rawGatewayUrl?.replace(/\/$/, "");

if (rawGatewayUrl && rawGatewayUrl.endsWith("/")) {
  console.warn(
    `⚠️  GATEWAY_URL should not end with a trailing slash. ` +
    `Got "${rawGatewayUrl}", using "${GATEWAY_URL}" instead. ` +
    `Please fix your environment variable to avoid potential CORS issues.`
  );
}

// Override process.env for libraries that read directly
if (GATEWAY_URL) {
  process.env.GATEWAY_URL = GATEWAY_URL;
}

// ============================================
// CRON_SECRET - authenticates Vercel cron invocations
// Optional at boot; cron routes reject when it is unset.
// ============================================
export const CRON_SECRET = process.env.CRON_SECRET;
