import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    status?: string;
    app_id?: string;
    expires_at?: string;
    code?: string;
    gateway?: string;
  }>;
}

/**
 * Callback page after proxy approval.
 * Since we're using client-side session storage, we just redirect
 * to the page that handles the params:
 * - Bearer claim-code callback (?code=…&gateway=…) → /bearer
 * - PoP approval callback (?status=approved&app_id=…) → / (home page
 *   completes the connection from the pending session)
 */
export default async function CallbackPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;

  // Bearer claim-code callback is handled by /bearer
  if (resolvedParams.code && resolvedParams.gateway) {
    const bearerParams = new URLSearchParams({
      code: resolvedParams.code,
      gateway: resolvedParams.gateway,
    });
    redirect(`/bearer?${bearerParams.toString()}`);
  }

  // Build redirect URL with params
  const params = new URLSearchParams();
  if (resolvedParams.status) params.set("status", resolvedParams.status);
  if (resolvedParams.app_id) params.set("app_id", resolvedParams.app_id);
  if (resolvedParams.expires_at)
    params.set("expires_at", resolvedParams.expires_at);

  const redirectUrl = params.toString() ? `/?${params.toString()}` : "/";
  redirect(redirectUrl);
}
