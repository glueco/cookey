import { GatewayRequestOptions, GatewayResponse, GatewayTransport } from '@glueco/sdk';
import { SendEmailRequest, SendEmailResponse } from './contracts.mjs';
export { ACTIONS, Attachment, AttachmentSchema, ENFORCEMENT_SUPPORT, EmailTag, EmailTagSchema, PLUGIN_ID, PLUGIN_NAME, PROVIDER, RESOURCE_TYPE, ResendAction, ResendEnforcementFields, ResendErrorResponse, ResendErrorResponseSchema, SendEmailRequestSchema, SendEmailResponseSchema, ShapedSendEmailRequest, VERSION, extractDomain, extractUniqueDomains, normalizeToArray } from './contracts.mjs';
import 'zod';

/**
 * Options for email requests.
 */
interface EmailRequestOptions extends Omit<GatewayRequestOptions, "stream" | "method"> {
    /**
     * Override for custom behavior (advanced usage).
     */
    raw?: boolean;
}
/**
 * Resend emails namespace interface.
 */
interface ResendEmailsClient {
    /**
     * Send a transactional email.
     *
     * @param request - Email request payload
     * @param options - Optional request options
     * @returns Send email response with email ID
     *
     * @example
     * ```ts
     * const response = await mailClient.emails.send({
     *   from: "notifications@myapp.com",
     *   to: "user@example.com",
     *   subject: "Welcome!",
     *   html: "<h1>Welcome to our app!</h1>"
     * });
     *
     * console.log(`Email sent with ID: ${response.data.id}`);
     * ```
     */
    send(request: SendEmailRequest, options?: EmailRequestOptions): Promise<GatewayResponse<SendEmailResponse>>;
}
/**
 * Resend client interface.
 * Provides typed methods for all supported actions.
 */
interface ResendClient {
    /**
     * Email operations.
     */
    emails: ResendEmailsClient;
    /**
     * Get the underlying transport for advanced usage.
     * Useful when you need direct access to the gateway.
     */
    readonly transport: GatewayTransport;
}
/**
 * Create a typed Resend client.
 *
 * @param transport - Gateway transport from SDK
 * @returns Typed Resend client
 *
 * @example
 * ```ts
 * import { resend } from "@glueco/plugin-mail-resend/client";
 * import { createTransport } from "@glueco/sdk";
 *
 * // Create transport (uses GLUECO_PRIVATE_KEY from env)
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Create typed client
 * const mailClient = resend(transport);
 *
 * // Send email with full type safety
 * const response = await mailClient.emails.send({
 *   from: "hello@example.com",
 *   to: ["user1@example.com", "user2@example.com"],
 *   subject: "Important Update",
 *   html: "<p>This is an important update.</p>",
 * });
 *
 * console.log(`Email sent! ID: ${response.data.id}`);
 * ```
 */
declare function resend(transport: GatewayTransport): ResendClient;

export { type EmailRequestOptions, type ResendClient, type ResendEmailsClient, SendEmailRequest, SendEmailResponse, resend as default, resend };
