import { parsePairingString } from "./pairing";
import { connect as envConnect, handleCallback as envHandleCallback, ConnectOptions, ConnectResult } from "./connect";
import { createGatewayFetch, GatewayFetch, resolveFetch } from "./fetch";
import { loadSeedFromEnv } from "./keys";
import { parseGatewayError } from "./errors";
import type {
  GatewayTransport,
  GatewayRequestOptions,
  GatewayResponse,
  GatewayStreamResponse,
} from "./transport";

// ============================================
// GATEWAY CLIENT
// High-level client that combines all SDK functionality
// ============================================

export interface GatewayClientOptions {
  /** Storage for app config (appId, proxyUrl) */
  configStorage?: ConfigStorage;

  /** Custom fetch function (for testing or custom environments) */
  fetch?: typeof fetch;

  /** Whether to throw GatewayError on error responses (default: false) */
  throwOnError?: boolean;
}

export interface ConfigStorage {
  load(): Promise<GatewayConfig | null>;
  save(config: GatewayConfig): Promise<void>;
  delete(): Promise<void>;
}

export interface GatewayConfig {
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
export class GatewayClient {
  private configStorage: ConfigStorage;
  private fetchFn: typeof fetch;
  private throwOnError: boolean;

  private config: GatewayConfig | null = null;
  private gatewayFetch: GatewayFetch | null = null;

  constructor(options: GatewayClientOptions = {}) {
    this.configStorage = options.configStorage || new MemoryConfigStorage();
    this.fetchFn = resolveFetch(options.fetch);
    this.throwOnError = options.throwOnError ?? false;
  }

  /**
   * Check if the client is connected and has valid credentials.
   * Returns true only if we have a config with a valid appId.
   */
  async isConnected(): Promise<boolean> {
    await this.loadState();
    return !!(this.config && this.config.appId);
  }

  /**
   * Check if a connection flow is pending (connect() was called but callback not yet received).
   * Useful for handling page refreshes during the approval flow.
   */
  async isPendingApproval(): Promise<boolean> {
    await this.loadState();
    return !!(this.config && !this.config.appId);
  }

  /**
   * Initiate the connection flow.
   * Returns the approval URL to redirect the user to.
   * Uses GLUECO_PRIVATE_KEY from environment.
   */
  async connect(options: {
    pairingString: string;
    app: { name: string; description?: string; homepage?: string };
    requestedPermissions: Array<{ resourceId: string; actions: string[] }>;
    redirectUri: string;
  }): Promise<ConnectResult> {
    const result = await envConnect({
      ...options,
      fetch: this.fetchFn,
    });

    // Save partial config (appId will be added after callback)
    this.config = {
      appId: "", // Will be set after callback
      proxyUrl: result.proxyUrl,
    };
    await this.configStorage.save(this.config);

    return result;
  }

  /**
   * Handle the callback after user approval.
   * This loads the stored config (saved during connect()) and updates it with the appId.
   */
  async handleCallback(params: URLSearchParams): Promise<{
    approved: boolean;
    appId?: string;
  }> {
    const result = envHandleCallback(params);

    if (result.approved && result.appId) {
      // Load existing state first (config was saved during connect())
      await this.loadState();

      if (!this.config) {
        throw new Error(
          "No config found. Make sure connect() was called before handleCallback(). " +
            "The config should have been persisted during the connect flow.",
        );
      }

      // Update config with the approved appId
      this.config = {
        ...this.config,
        appId: result.appId,
      };
      await this.configStorage.save(this.config);

      // Clear cached fetch so it will be recreated with the new appId
      this.gatewayFetch = null;
    }

    return result;
  }

  /**
   * Get the PoP-enabled fetch function.
   * Uses GLUECO_PRIVATE_KEY from environment.
   */
  async getFetch(): Promise<GatewayFetch> {
    if (this.gatewayFetch) {
      return this.gatewayFetch;
    }

    await this.loadState();

    if (!this.config || !this.config.appId) {
      throw new Error("Client not connected. Call connect() first.");
    }

    this.gatewayFetch = createGatewayFetch({
      appId: this.config.appId,
      proxyUrl: this.config.proxyUrl,
      // seed loaded from env inside createGatewayFetch
      baseFetch: this.fetchFn,
      throwOnError: this.throwOnError,
    });

    return this.gatewayFetch;
  }

  /**
   * Get the proxy URL for configuring SDK baseURL.
   */
  async getProxyUrl(): Promise<string> {
    await this.loadState();

    if (!this.config || !this.config.proxyUrl) {
      throw new Error("Client not connected. Call connect() first.");
    }

    return this.config.proxyUrl;
  }

  /**
   * Get a resource-scoped base URL.
   * Use this with OpenAI SDK baseURL.
   *
   * @example
   * const baseURL = await client.getResourceBaseUrl('llm', 'groq');
   * // Returns: https://gateway.example.com/r/llm/groq
   */
  async getResourceBaseUrl(
    resourceType: string,
    provider: string,
  ): Promise<string> {
    const proxyUrl = await this.getProxyUrl();
    return `${proxyUrl}/r/${resourceType}/${provider}`;
  }

  /**
   * Get the app ID.
   */
  async getAppId(): Promise<string> {
    await this.loadState();

    if (!this.config || !this.config.appId) {
      throw new Error("Client not connected. Call connect() first.");
    }

    return this.config.appId;
  }

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
  async getTransport(): Promise<GatewayTransport> {
    const fetch = await this.getFetch();
    const proxyUrl = await this.getProxyUrl();

    const transport: GatewayTransport = {
      async request<TResponse = unknown, TPayload = unknown>(
        resourceId: string,
        action: string,
        payload: TPayload,
        options?: GatewayRequestOptions,
      ): Promise<GatewayResponse<TResponse>> {
        const [resourceType, provider] = resourceId.split(":");
        const url = `${proxyUrl}/r/${resourceType}/${provider}/${action.replace(".", "/")}`;

        const response = await fetch(url, {
          method: options?.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
          body: JSON.stringify(payload),
          signal: options?.signal,
        });

        // Extract headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        if (!response.ok) {
          const errorBody = await response.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(errorBody);
          } catch {
            parsed = errorBody;
          }
          const error = parseGatewayError(parsed, response.status);
          throw (
            error ?? new Error(`Gateway error: ${response.status} ${errorBody}`)
          );
        }

        const data = (await response.json()) as TResponse;

        return {
          data,
          status: response.status,
          headers,
        };
      },

      async requestStream<TPayload = unknown>(
        resourceId: string,
        action: string,
        payload: TPayload,
        options?: Omit<GatewayRequestOptions, "stream">,
      ): Promise<GatewayStreamResponse> {
        const [resourceType, provider] = resourceId.split(":");
        const url = `${proxyUrl}/r/${resourceType}/${provider}/${action.replace(".", "/")}`;

        // Add stream flag to payload if it's an object
        const streamPayload =
          typeof payload === "object" && payload !== null
            ? { ...payload, stream: true }
            : payload;

        const response = await fetch(url, {
          method: options?.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...options?.headers,
          },
          body: JSON.stringify(streamPayload),
          signal: options?.signal,
        });

        // Extract headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        if (!response.ok) {
          const errorBody = await response.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(errorBody);
          } catch {
            parsed = errorBody;
          }
          const error = parseGatewayError(parsed, response.status);
          throw (
            error ?? new Error(`Gateway error: ${response.status} ${errorBody}`)
          );
        }

        if (!response.body) {
          throw new Error("No response body for streaming request");
        }

        return {
          stream: response.body,
          status: response.status,
          headers,
        };
      },

      getProxyUrl: () => proxyUrl,

      getFetch: () => fetch,
    };

    return transport;
  }

  /**
   * Disconnect and clear all stored credentials.
   */
  async disconnect(): Promise<void> {
    await this.configStorage.delete();
    this.config = null;
    this.gatewayFetch = null;
  }

  /**
   * Load state from storage.
   */
  private async loadState(): Promise<void> {
    if (!this.config) {
      this.config = await this.configStorage.load();
    }
  }
}

// ============================================
// CONFIG STORAGE IMPLEMENTATIONS
// ============================================

/**
 * In-memory config storage.
 */
export class MemoryConfigStorage implements ConfigStorage {
  private config: GatewayConfig | null = null;

  async load(): Promise<GatewayConfig | null> {
    return this.config;
  }

  async save(config: GatewayConfig): Promise<void> {
    this.config = config;
  }

  async delete(): Promise<void> {
    this.config = null;
  }
}

/**
 * File-based config storage.
 */
export class FileConfigStorage implements ConfigStorage {
  constructor(private filePath: string) {}

  async load(): Promise<GatewayConfig | null> {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(content) as GatewayConfig;
    } catch {
      return null;
    }
  }

  async save(config: GatewayConfig): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2));
  }

  async delete(): Promise<void> {
    try {
      const fs = await import("fs/promises");
      await fs.unlink(this.filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Environment-based config storage.
 */
export class EnvConfigStorage implements ConfigStorage {
  constructor(
    private appIdEnv: string = "GATEWAY_APP_ID",
    private proxyUrlEnv: string = "GATEWAY_PROXY_URL",
  ) {}

  async load(): Promise<GatewayConfig | null> {
    const appId = process.env[this.appIdEnv];
    const proxyUrl = process.env[this.proxyUrlEnv];

    if (!appId || !proxyUrl) {
      return null;
    }

    return { appId, proxyUrl };
  }

  async save(config: GatewayConfig): Promise<void> {
    console.warn(
      `EnvConfigStorage: Cannot save config. Set ${this.appIdEnv} and ${this.proxyUrlEnv} manually.`,
    );
    console.log(`App ID: ${config.appId}`);
    console.log(`Proxy URL: ${config.proxyUrl}`);
  }

  async delete(): Promise<void> {
    console.warn(
      `EnvConfigStorage: Cannot delete config. Remove env vars manually.`,
    );
  }
}
