/**
 * Request options for gateway transport.
 */
interface GatewayRequestOptions {
    /** HTTP method override (default: POST) */
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    /** Custom headers to include */
    headers?: Record<string, string>;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Enable streaming response */
    stream?: boolean;
}
/**
 * Response from gateway transport.
 */
interface GatewayResponse<T = unknown> {
    /** Response data (for non-streaming) */
    data: T;
    /** Response status code */
    status: number;
    /** Response headers */
    headers: Record<string, string>;
}
/**
 * Streaming response from gateway transport.
 */
interface GatewayStreamResponse {
    /** Readable stream of response data */
    stream: ReadableStream<Uint8Array>;
    /** Response status code */
    status: number;
    /** Response headers */
    headers: Record<string, string>;
}
/**
 * Gateway Transport Interface
 *
 * This is the minimal interface that plugin clients depend on.
 * It abstracts away PoP signing, baseURL handling, and error parsing.
 *
 * Plugin clients should use this interface instead of importing
 * the full SDK implementation to maintain separation of concerns.
 *
 * @example
 * ```ts
 * // In plugin client
 * export function gemini(transport: GatewayTransport) {
 *   return {
 *     async generateContent(payload: GeminiGenerateContentRequest) {
 *       return transport.request<GeminiGenerateContentResponse>(
 *         "llm:gemini",
 *         "chat.completions",
 *         payload
 *       );
 *     }
 *   };
 * }
 * ```
 */
interface GatewayTransport {
    /**
     * Make a typed request to a resource action.
     *
     * @param resourceId - Resource identifier (e.g., "llm:gemini")
     * @param action - Action name (e.g., "chat.completions")
     * @param payload - Request payload (will be JSON serialized)
     * @param options - Optional request options
     * @returns Promise resolving to typed response
     */
    request<TResponse = unknown, TPayload = unknown>(resourceId: string, action: string, payload: TPayload, options?: GatewayRequestOptions): Promise<GatewayResponse<TResponse>>;
    /**
     * Make a streaming request to a resource action.
     *
     * @param resourceId - Resource identifier (e.g., "llm:gemini")
     * @param action - Action name (e.g., "chat.completions")
     * @param payload - Request payload (will be JSON serialized)
     * @param options - Optional request options
     * @returns Promise resolving to stream response
     */
    requestStream<TPayload = unknown>(resourceId: string, action: string, payload: TPayload, options?: Omit<GatewayRequestOptions, "stream">): Promise<GatewayStreamResponse>;
    /**
     * Get the base proxy URL.
     * Useful for constructing URLs for vendor SDKs.
     */
    getProxyUrl(): string;
    /**
     * Get the PoP-signed fetch function.
     * Use this when you need to use vendor SDKs that require a custom fetch.
     *
     * @returns Fetch function with PoP signing
     */
    getFetch(): typeof fetch;
}
/**
 * Type helper for creating typed plugin client factories.
 *
 * @example
 * ```ts
 * export const gemini: PluginClientFactory<GeminiClient> = (transport) => ({
 *   generateContent: (payload) => transport.request("llm:gemini", "chat.completions", payload)
 * });
 * ```
 */
type PluginClientFactory<TClient> = (transport: GatewayTransport) => TClient;
/**
 * Type helper to extract the return type of a plugin client factory.
 */
type PluginClient<T extends PluginClientFactory<unknown>> = T extends PluginClientFactory<infer C> ? C : never;

/**
 * Simple transport creation for the Glueco Gateway SDK.
 *
 * Provides createTransport() - the simplest way to get a signed transport.
 * Requires only proxyUrl and appId. Uses GLUECO_PRIVATE_KEY from env.
 *
 * @example
 * import { createTransport } from "@glueco/sdk";
 *
 * // App has saved these from the callback
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Use with plugins
 * import { groq } from "@glueco/plugin-llm-groq/client";
 * const client = groq(transport);
 * const response = await client.chatCompletions({...});
 */

interface CreateTransportOptions {
    /** Gateway proxy URL */
    proxyUrl: string;
    /** Application ID (from callback) */
    appId: string;
    /** Optional custom fetch function */
    fetch?: typeof fetch;
    /** Whether to throw GatewayError on error responses */
    throwOnError?: boolean;
}
/**
 * Create a GatewayTransport for making signed requests.
 *
 * This is the main entry point for using the SDK after connection.
 * Uses GLUECO_PRIVATE_KEY from environment to sign all requests.
 *
 * @param options Configuration options
 * @returns GatewayTransport for use with plugin clients
 *
 * @throws KeyError if GLUECO_PRIVATE_KEY env var is missing or invalid
 *
 * @example
 * const transport = createTransport({
 *   proxyUrl: "https://gateway.example.com",
 *   appId: "app_abc123",
 * });
 *
 * // Use with plugins
 * import { groq } from "@glueco/plugin-llm-groq/client";
 * const client = groq(transport);
 */
declare function createTransport(options: CreateTransportOptions): GatewayTransport;

interface GatewayFetchOptions {
    /** App ID received after approval */
    appId: string;
    /** Gateway/proxy URL */
    proxyUrl: string;
    /** Optional: Ed25519 seed bytes (if not provided, uses GLUECO_PRIVATE_KEY env) */
    seed?: Uint8Array;
    /** Optional base fetch function (for testing) */
    baseFetch?: typeof fetch;
    /** Whether to throw GatewayError on error responses (default: false for compatibility) */
    throwOnError?: boolean;
}
type GatewayFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/**
 * Create a PoP-enabled fetch function.
 *
 * This wrapper:
 * - Adds PoP headers (x-pop-v, x-app-id, x-ts, x-nonce, x-sig)
 * - Routes requests through the gateway
 * - Preserves request body and headers
 * - Includes query params in signature (v1 protocol)
 *
 * @example
 * const gatewayFetch = createGatewayFetch({
 *   appId: 'clx123...',
 *   proxyUrl: 'https://gateway.example.com',
 *   keyPair: { publicKey: '...', privateKey: '...' },
 * });
 *
 * // Use with OpenAI SDK - explicit resource in URL
 * const client = new OpenAI({
 *   apiKey: 'unused',
 *   baseURL: 'https://gateway.example.com/r/llm/groq', // Note: /r/<type>/<provider>
 *   fetch: gatewayFetch,
 * });
 */
declare function createGatewayFetch(options: GatewayFetchOptions): GatewayFetch;
/**
 * Create a gateway fetch from environment variables.
 * Expects: GATEWAY_APP_ID, GATEWAY_PROXY_URL, GLUECO_PRIVATE_KEY
 */
declare function createGatewayFetchFromEnv(options?: Pick<GatewayFetchOptions, "baseFetch" | "throwOnError">): GatewayFetch;
/**
 * Resolve fetch implementation.
 * Uses provided fetch, falls back to global, or throws clear error.
 */
declare function resolveFetch(customFetch?: typeof fetch): typeof fetch;

interface PairingInfo {
    proxyUrl: string;
    connectCode: string;
}
/**
 * Parse a pairing string into its components.
 * Format: pair::<proxy_url>::<connect_code>
 *
 * @example
 * const info = parsePairingString('pair::https://my-gateway.vercel.app::abc123xyz');
 * // { proxyUrl: 'https://my-gateway.vercel.app', connectCode: 'abc123xyz' }
 */
declare function parsePairingString(pairingString: string): PairingInfo;
/**
 * Create a pairing string from components.
 * Useful for testing or manual construction.
 */
declare function createPairingString(proxyUrl: string, connectCode: string): string;

/**
 * Connection flow for the Glueco Gateway SDK.
 *
 * Handles:
 * 1. Initiating the connect/prepare flow
 * 2. Handling callbacks after user approval
 *
 * The SDK uses GLUECO_PRIVATE_KEY from environment. It derives the public key
 * and sends it during connection.
 */
interface ConnectOptions {
    /** Pairing string from gateway admin */
    pairingString: string;
    /** App metadata */
    app: {
        name: string;
        description?: string;
        homepage?: string;
    };
    /** Requested permissions */
    requestedPermissions: Array<{
        resourceId: string;
        actions: string[];
        requestedDuration?: {
            type: "preset" | "custom";
            value?: string;
            seconds?: number;
        };
    }>;
    /** Redirect URI for callback */
    redirectUri: string;
    /** Optional custom fetch */
    fetch?: typeof fetch;
}
interface ConnectResult {
    /** URL to redirect user to for approval */
    approvalUrl: string;
    /** Proxy URL (from pairing string) */
    proxyUrl: string;
    /** When the session expires */
    expiresAt?: Date;
}
declare class ConnectError extends Error {
    statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined);
}
/**
 * Initiate the connection flow with the gateway.
 *
 * This function:
 * 1. Parses the pairing string
 * 2. Loads private key seed from GLUECO_PRIVATE_KEY env
 * 3. Derives public key from seed
 * 4. Calls the /api/connect/prepare endpoint with publicKey
 * 5. Returns the approval URL (NO secrets returned)
 *
 * @throws KeyError if GLUECO_PRIVATE_KEY env var is missing or invalid
 * @throws ConnectError if gateway request fails
 */
declare function connect(options: ConnectOptions): Promise<ConnectResult>;
/**
 * Handle the callback after user approval/denial.
 *
 * Call this when the user is redirected back to your app.
 * The app should persist app_id and proxy_url.
 */
declare function handleCallback(params: URLSearchParams): {
    approved: boolean;
    appId?: string;
    expiresAt?: Date;
};

/**
 * Error thrown when the gateway returns an error response.
 * Contains structured error information from the gateway.
 */
declare class GatewayError extends Error {
    readonly code: string;
    readonly status: number;
    readonly requestId?: string;
    readonly details?: unknown;
    constructor(code: string, message: string, status: number, options?: {
        requestId?: string;
        details?: unknown;
    });
    /**
     * Check if this error matches a specific error code.
     */
    is(code: string): boolean;
    /**
     * Convert to a plain object for logging/serialization.
     */
    toJSON(): {
        details?: {} | null | undefined;
        requestId?: string | undefined;
        name: string;
        code: string;
        message: string;
        status: number;
    };
}
/**
 * Parse a gateway error response and create a GatewayError.
 * Returns null if the response doesn't match the expected schema.
 */
declare function parseGatewayError(body: unknown, status: number): GatewayError | null;
/**
 * Type guard to check if an error is a GatewayError.
 */
declare function isGatewayError(error: unknown): error is GatewayError;

/**
 * Key management for the Glueco Gateway SDK.
 *
 * Loads Ed25519 private key seed from environment variable `GLUECO_PRIVATE_KEY`.
 * SDK never generates keys - the app provisions a key and stores it server-side.
 *
 * Key Format:
 *   GLUECO_PRIVATE_KEY must be base64-encoded 32-byte Ed25519 seed.
 *
 * Example:
 *   // Generate a key (one-time, outside SDK):
 *   const seed = crypto.getRandomValues(new Uint8Array(32));
 *   console.log(Buffer.from(seed).toString('base64'));
 *
 *   // Set in environment:
 *   export GLUECO_PRIVATE_KEY="base64-encoded-32-bytes..."
 *
 * IMPORTANT: This module is server-side only!
 * Attempting to use in browser will throw an error.
 */
declare const ENV_PRIVATE_KEY = "GLUECO_PRIVATE_KEY";
/**
 * Error thrown for key-related issues
 */
declare class KeyError extends Error {
    constructor(message: string);
}
/**
 * Load Ed25519 seed from GLUECO_PRIVATE_KEY environment variable.
 *
 * @returns 32-byte seed as Uint8Array
 * @throws KeyError if env var is missing or invalid
 */
declare function loadSeedFromEnv(): Uint8Array;
/**
 * Derive Ed25519 public key from seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @returns Public key as base64 string
 */
declare function publicKeyFromSeed(seed: Uint8Array): string;
/**
 * Get public key bytes from seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @returns 32-byte public key as Uint8Array
 */
declare function getPublicKeyBytes(seed: Uint8Array): Uint8Array;
/**
 * Sign a message with the Ed25519 seed.
 *
 * @param seed 32-byte Ed25519 seed
 * @param message Message bytes to sign
 * @returns 64-byte signature
 */
declare function signWithSeed(seed: Uint8Array, message: Uint8Array): Uint8Array;
/**
 * Sign message and return base64url-encoded signature.
 *
 * @param seed 32-byte Ed25519 seed
 * @param message Message bytes to sign
 * @returns Base64URL-encoded signature
 */
declare function signToBase64Url(seed: Uint8Array, message: Uint8Array): string;
/**
 * Verify an Ed25519 signature.
 *
 * @param publicKey 32-byte public key
 * @param message Original message bytes
 * @param signature 64-byte signature
 * @returns True if valid
 */
declare function verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
declare function base64UrlEncode(data: Uint8Array): string;
declare function base64UrlDecode(str: string): Uint8Array;
/**
 * Generate a cryptographically random nonce (base64url encoded).
 * Used for PoP replay protection.
 */
declare function generateNonce(): string;

interface GatewayClientOptions {
    /** Storage for app config (appId, proxyUrl) */
    configStorage?: ConfigStorage;
    /** Custom fetch function (for testing or custom environments) */
    fetch?: typeof fetch;
    /** Whether to throw GatewayError on error responses (default: false) */
    throwOnError?: boolean;
}
interface ConfigStorage {
    load(): Promise<GatewayConfig | null>;
    save(config: GatewayConfig): Promise<void>;
    delete(): Promise<void>;
}
interface GatewayConfig {
    appId: string;
    proxyUrl: string;
}
/**
 * High-level gateway client.
 * Manages keys, config, and provides a simple interface.
 *
 * @example
 * const client = new GatewayClient({
 *   keyStorage: new FileKeyStorage('./.gateway/keys.json'),
 *   configStorage: new FileConfigStorage('./.gateway/config.json'),
 * });
 *
 * // First time: connect
 * if (!await client.isConnected()) {
 *   const result = await client.connect({
 *     pairingString: 'pair::...',
 *     app: { name: 'My App' },
 *     requestedPermissions: [
 *       { resourceId: 'llm:groq', actions: ['chat.completions'] }
 *     ],
 *     redirectUri: 'https://myapp.com/callback',
 *   });
 *   // Redirect user to result.approvalUrl
 * }
 *
 * // After callback
 * await client.handleCallback(params);
 *
 * // Get fetch for use with SDKs
 * const gatewayFetch = await client.getFetch();
 *
 * // Use with OpenAI SDK - explicit resource in baseURL
 * const openai = new OpenAI({
 *   apiKey: 'unused',
 *   baseURL: `${await client.getProxyUrl()}/r/llm/groq`,
 *   fetch: gatewayFetch,
 * });
 */
declare class GatewayClient {
    private configStorage;
    private fetchFn;
    private throwOnError;
    private config;
    private gatewayFetch;
    constructor(options?: GatewayClientOptions);
    /**
     * Check if the client is connected and has valid credentials.
     * Returns true only if we have a config with a valid appId.
     */
    isConnected(): Promise<boolean>;
    /**
     * Check if a connection flow is pending (connect() was called but callback not yet received).
     * Useful for handling page refreshes during the approval flow.
     */
    isPendingApproval(): Promise<boolean>;
    /**
     * Initiate the connection flow.
     * Returns the approval URL to redirect the user to.
     * Uses GLUECO_PRIVATE_KEY from environment.
     */
    connect(options: {
        pairingString: string;
        app: {
            name: string;
            description?: string;
            homepage?: string;
        };
        requestedPermissions: Array<{
            resourceId: string;
            actions: string[];
        }>;
        redirectUri: string;
    }): Promise<ConnectResult>;
    /**
     * Handle the callback after user approval.
     * This loads the stored config (saved during connect()) and updates it with the appId.
     */
    handleCallback(params: URLSearchParams): Promise<{
        approved: boolean;
        appId?: string;
    }>;
    /**
     * Get the PoP-enabled fetch function.
     * Uses GLUECO_PRIVATE_KEY from environment.
     */
    getFetch(): Promise<GatewayFetch>;
    /**
     * Get the proxy URL for configuring SDK baseURL.
     */
    getProxyUrl(): Promise<string>;
    /**
     * Get a resource-scoped base URL.
     * Use this with OpenAI SDK baseURL.
     *
     * @example
     * const baseURL = await client.getResourceBaseUrl('llm', 'groq');
     * // Returns: https://gateway.example.com/r/llm/groq
     */
    getResourceBaseUrl(resourceType: string, provider: string): Promise<string>;
    /**
     * Get the app ID.
     */
    getAppId(): Promise<string>;
    /**
     * Get a GatewayTransport instance for use with plugin clients.
     *
     * This is the recommended way to use typed plugin clients:
     *
     * @example
     * ```ts
     * import { gemini } from "@glueco/plugin-llm-gemini/client";
     *
     * const transport = await client.getTransport();
     * const geminiClient = gemini(transport);
     *
     * const response = await geminiClient.generateContent({
     *   model: "gemini-1.5-flash",
     *   messages: [{ role: "user", content: "Hello!" }]
     * });
     * ```
     */
    getTransport(): Promise<GatewayTransport>;
    /**
     * Disconnect and clear all stored credentials.
     */
    disconnect(): Promise<void>;
    /**
     * Load state from storage.
     */
    private loadState;
}
/**
 * In-memory config storage.
 */
declare class MemoryConfigStorage implements ConfigStorage {
    private config;
    load(): Promise<GatewayConfig | null>;
    save(config: GatewayConfig): Promise<void>;
    delete(): Promise<void>;
}
/**
 * File-based config storage.
 */
declare class FileConfigStorage implements ConfigStorage {
    private filePath;
    constructor(filePath: string);
    load(): Promise<GatewayConfig | null>;
    save(config: GatewayConfig): Promise<void>;
    delete(): Promise<void>;
}
/**
 * Environment-based config storage.
 */
declare class EnvConfigStorage implements ConfigStorage {
    private appIdEnv;
    private proxyUrlEnv;
    constructor(appIdEnv?: string, proxyUrlEnv?: string);
    load(): Promise<GatewayConfig | null>;
    save(config: GatewayConfig): Promise<void>;
    delete(): Promise<void>;
}

export { type ConfigStorage, ConnectError, type ConnectOptions, type ConnectResult, type CreateTransportOptions, ENV_PRIVATE_KEY, EnvConfigStorage, FileConfigStorage, GatewayClient, type GatewayClientOptions, type GatewayConfig, GatewayError, type GatewayFetch, type GatewayFetchOptions, type GatewayRequestOptions, type GatewayResponse, type GatewayStreamResponse, type GatewayTransport, KeyError, MemoryConfigStorage, type PairingInfo, type PluginClient, type PluginClientFactory, base64UrlDecode, base64UrlEncode, connect, createGatewayFetch, createGatewayFetchFromEnv, createPairingString, createTransport, generateNonce, getPublicKeyBytes, handleCallback, isGatewayError, loadSeedFromEnv, parseGatewayError, parsePairingString, publicKeyFromSeed, resolveFetch, signToBase64Url, signWithSeed, verify };
