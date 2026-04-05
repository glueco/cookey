import { sha256 } from '@noble/hashes/sha256';
import { GatewayErrorResponseSchema, getPathWithQuery, buildCanonicalRequestV1, POP_VERSION } from '@glueco/shared';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));
var ENV_PRIVATE_KEY = "GLUECO_PRIVATE_KEY";
var SEED_LENGTH = 32;
var KeyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "KeyError";
  }
};
function ensureServerSide() {
  if (typeof window !== "undefined") {
    throw new KeyError(
      "GLUECO_PRIVATE_KEY must be used server-side only. This SDK cannot be used in browser environments to prevent key leakage."
    );
  }
}
function loadSeedFromEnv() {
  ensureServerSide();
  const value = process.env[ENV_PRIVATE_KEY];
  if (!value) {
    throw new KeyError(
      `Missing environment variable: ${ENV_PRIVATE_KEY}
Set it to a base64-encoded 32-byte Ed25519 seed.
Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  let seed;
  try {
    seed = Uint8Array.from(Buffer.from(value, "base64"));
  } catch (e) {
    throw new KeyError(
      `Invalid format in ${ENV_PRIVATE_KEY}: ${e}\\nExpected base64-encoded 32 bytes.`
    );
  }
  if (seed.length !== SEED_LENGTH) {
    throw new KeyError(
      `Invalid seed length in ${ENV_PRIVATE_KEY}: got ${seed.length} bytes, expected ${SEED_LENGTH}.
Must be exactly 32 bytes (256 bits) base64-encoded.`
    );
  }
  return seed;
}
function publicKeyFromSeed(seed) {
  const publicKey = ed25519.getPublicKey(seed);
  return Buffer.from(publicKey).toString("base64");
}
function getPublicKeyBytes(seed) {
  return ed25519.getPublicKey(seed);
}
function signWithSeed(seed, message) {
  return ed25519.sign(message, seed);
}
function signToBase64Url(seed, message) {
  const signature = signWithSeed(seed, message);
  return base64UrlEncode(signature);
}
function verify2(publicKey, message, signature) {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
function base64UrlEncode(data) {
  let base64;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(data).toString("base64");
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(str) {
  let padded = str;
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } else {
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}
function generateNonce() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    const nodeCrypto = __require("crypto");
    const randomBytes = nodeCrypto.randomBytes(16);
    bytes.set(randomBytes);
  }
  return base64UrlEncode(bytes);
}
var GatewayError = class extends Error {
  constructor(code, message, status, options) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }
  /**
   * Check if this error matches a specific error code.
   */
  is(code) {
    return this.code === code;
  }
  /**
   * Convert to a plain object for logging/serialization.
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      ...this.requestId && { requestId: this.requestId },
      ...this.details !== void 0 && { details: this.details }
    };
  }
};
function parseGatewayError(body, status) {
  const parsed = GatewayErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const { error } = parsed.data;
  return new GatewayError(error.code, error.message, status, {
    requestId: error.requestId,
    details: error.details
  });
}
function isGatewayError(error) {
  return error instanceof GatewayError;
}
function createGatewayFetch(options) {
  const { appId, proxyUrl, seed, baseFetch, throwOnError = false } = options;
  const actualSeed = seed ?? loadSeedFromEnv();
  const fetchFn = resolveFetch(baseFetch);
  return async (input, init) => {
    const proxyUrlObj = new URL(proxyUrl);
    let url;
    if (typeof input === "string") {
      url = new URL(input, proxyUrlObj);
    } else if (input instanceof URL) {
      url = input;
    } else {
      url = new URL(input.url, proxyUrlObj);
    }
    const method = init?.method || "GET";
    let bodyBytes;
    if (init?.body) {
      if (typeof init.body === "string") {
        bodyBytes = new TextEncoder().encode(init.body);
      } else if (init.body instanceof ArrayBuffer) {
        bodyBytes = new Uint8Array(init.body);
      } else if (init.body instanceof Uint8Array) {
        bodyBytes = init.body;
      } else {
        bodyBytes = new TextEncoder().encode(String(init.body));
      }
    } else {
      bodyBytes = new Uint8Array(0);
    }
    const timestamp = Math.floor(Date.now() / 1e3).toString();
    const nonce = generateNonce();
    const bodyHash = base64UrlEncode(sha256(bodyBytes));
    const pathWithQuery = getPathWithQuery(url);
    const canonicalPayload = buildCanonicalRequestV1({
      method: method.toUpperCase(),
      pathWithQuery,
      appId,
      ts: timestamp,
      nonce,
      bodyHash
    });
    const signature = signToBase64Url(
      actualSeed,
      new TextEncoder().encode(canonicalPayload)
    );
    const headers = new Headers(init?.headers);
    headers.set("x-pop-v", POP_VERSION);
    headers.set("x-app-id", appId);
    headers.set("x-ts", timestamp);
    headers.set("x-nonce", nonce);
    headers.set("x-sig", signature);
    const targetUrl = new URL(url.pathname + url.search, proxyUrlObj);
    const response = await fetchFn(targetUrl.toString(), {
      ...init,
      headers
    });
    if (throwOnError && !response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      const gatewayError = parseGatewayError(body, response.status);
      if (gatewayError) {
        throw gatewayError;
      }
      throw new Error(
        `Gateway request failed: ${response.status} ${response.statusText}`
      );
    }
    return response;
  };
}
function createGatewayFetchFromEnv(options) {
  const appId = process.env.GATEWAY_APP_ID;
  const proxyUrl = process.env.GATEWAY_PROXY_URL;
  if (!appId || !proxyUrl) {
    throw new Error(
      "Missing required environment variables: GATEWAY_APP_ID, GATEWAY_PROXY_URL"
    );
  }
  return createGatewayFetch({
    appId,
    proxyUrl,
    ...options
  });
}
function resolveFetch(customFetch) {
  if (customFetch) {
    return customFetch;
  }
  if (typeof globalThis.fetch !== "undefined") {
    return globalThis.fetch;
  }
  if (typeof window !== "undefined" && typeof window.fetch !== "undefined") {
    return window.fetch;
  }
  throw new Error(
    "No fetch implementation available. Please provide a fetch function via options or ensure global fetch is available."
  );
}

// src/createTransport.ts
function createTransport(options) {
  const { proxyUrl, appId, throwOnError = false } = options;
  const fetchFn = resolveFetch(options.fetch);
  const seed = loadSeedFromEnv();
  const signRequest = (method, url, bodyBytes) => {
    const timestamp = Math.floor(Date.now() / 1e3).toString();
    const nonce = generateNonce();
    const bodyHash = base64UrlEncode(sha256(bodyBytes));
    const pathWithQuery = getPathWithQuery(url);
    const canonicalPayload = buildCanonicalRequestV1({
      method: method.toUpperCase(),
      pathWithQuery,
      appId,
      ts: timestamp,
      nonce,
      bodyHash
    });
    const signature = signToBase64Url(
      seed,
      new TextEncoder().encode(canonicalPayload)
    );
    return {
      "x-pop-v": POP_VERSION,
      "x-app-id": appId,
      "x-ts": timestamp,
      "x-nonce": nonce,
      "x-sig": signature
    };
  };
  const transport = {
    async request(resourceId, action, payload, reqOptions) {
      const [resourceType, provider] = resourceId.split(":");
      const actionPath = action.replace(".", "/");
      const url = new URL(
        `/r/${resourceType}/${provider}/${actionPath}`,
        proxyUrl
      );
      const method = reqOptions?.method ?? "POST";
      const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
      const popHeaders = signRequest(method, url, bodyBytes);
      const response = await fetchFn(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...popHeaders,
          ...reqOptions?.headers
        },
        body: JSON.stringify(payload),
        signal: reqOptions?.signal
      });
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (!response.ok) {
        const errorBody = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = errorBody;
        }
        const error = parseGatewayError(parsed, response.status);
        throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
      }
      const data = await response.json();
      return {
        data,
        status: response.status,
        headers
      };
    },
    async requestStream(resourceId, action, payload, reqOptions) {
      const [resourceType, provider] = resourceId.split(":");
      const actionPath = action.replace(".", "/");
      const url = new URL(
        `/r/${resourceType}/${provider}/${actionPath}`,
        proxyUrl
      );
      const method = reqOptions?.method ?? "POST";
      const streamPayload = typeof payload === "object" && payload !== null ? { ...payload, stream: true } : payload;
      const bodyBytes = new TextEncoder().encode(JSON.stringify(streamPayload));
      const popHeaders = signRequest(method, url, bodyBytes);
      const response = await fetchFn(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...popHeaders,
          ...reqOptions?.headers
        },
        body: JSON.stringify(streamPayload),
        signal: reqOptions?.signal
      });
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (!response.ok) {
        const errorBody = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = errorBody;
        }
        const error = parseGatewayError(parsed, response.status);
        throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
      }
      if (!response.body) {
        throw new Error("No response body for streaming request");
      }
      return {
        stream: response.body,
        status: response.status,
        headers
      };
    },
    getProxyUrl: () => proxyUrl,
    getFetch: () => fetchFn
  };
  return transport;
}

// src/pairing.ts
function parsePairingString(pairingString) {
  const trimmed = pairingString.trim();
  if (!trimmed.startsWith("pair::")) {
    throw new Error('Invalid pairing string: must start with "pair::"');
  }
  const parts = trimmed.split("::");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid pairing string format. Expected: pair::<proxy_url>::<connect_code>"
    );
  }
  const [, proxyUrl, connectCode] = parts;
  try {
    new URL(proxyUrl);
  } catch {
    throw new Error(`Invalid proxy URL in pairing string: ${proxyUrl}`);
  }
  if (!connectCode || connectCode.length < 16) {
    throw new Error("Invalid connect code in pairing string");
  }
  return {
    proxyUrl,
    connectCode
  };
}
function createPairingString(proxyUrl, connectCode) {
  return `pair::${proxyUrl}::${connectCode}`;
}

// src/connect.ts
var ConnectError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ConnectError";
  }
};
async function connect(options) {
  const { pairingString, app, requestedPermissions, redirectUri } = options;
  const fetchFn = resolveFetch(options.fetch);
  const pairingInfo = parsePairingString(pairingString);
  const seed = loadSeedFromEnv();
  const publicKey = publicKeyFromSeed(seed);
  const permissionsPayload = requestedPermissions.map((perm) => {
    const permDict = {
      resourceId: perm.resourceId,
      actions: perm.actions
    };
    if (perm.requestedDuration) {
      permDict.requestedDuration = {
        type: perm.requestedDuration.type,
        [perm.requestedDuration.type]: perm.requestedDuration.value ?? perm.requestedDuration.seconds
      };
    }
    return permDict;
  });
  const requestPayload = {
    connectCode: pairingInfo.connectCode,
    app: {
      name: app.name,
      description: app.description,
      homepage: app.homepage
    },
    publicKey,
    // Proxy stores this with app_id
    requestedPermissions: permissionsPayload,
    redirectUri
  };
  let response;
  try {
    response = await fetchFn(`${pairingInfo.proxyUrl}/api/connect/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload)
    });
  } catch (e) {
    throw new ConnectError(`Failed to connect to gateway: ${e}`);
  }
  if (!response.ok) {
    let errorMessage;
    try {
      const body = await response.json();
      errorMessage = body?.error?.message ?? body?.error ?? `Connection failed: ${response.status}`;
    } catch {
      errorMessage = `Connection failed: ${response.status}`;
    }
    throw new ConnectError(errorMessage, response.status);
  }
  const data = await response.json();
  return {
    approvalUrl: data.approvalUrl,
    proxyUrl: pairingInfo.proxyUrl,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : void 0
  };
}
function handleCallback(params) {
  const status = params.get("status");
  const appId = params.get("app_id");
  const expiresAt = params.get("expires_at");
  if (status === "approved" && appId) {
    return {
      approved: true,
      appId,
      expiresAt: expiresAt ? new Date(expiresAt) : void 0
    };
  }
  return { approved: false };
}

// src/client.ts
var GatewayClient = class {
  constructor(options = {}) {
    this.config = null;
    this.gatewayFetch = null;
    this.configStorage = options.configStorage || new MemoryConfigStorage();
    this.fetchFn = resolveFetch(options.fetch);
    this.throwOnError = options.throwOnError ?? false;
  }
  /**
   * Check if the client is connected and has valid credentials.
   * Returns true only if we have a config with a valid appId.
   */
  async isConnected() {
    await this.loadState();
    return !!(this.config && this.config.appId);
  }
  /**
   * Check if a connection flow is pending (connect() was called but callback not yet received).
   * Useful for handling page refreshes during the approval flow.
   */
  async isPendingApproval() {
    await this.loadState();
    return !!(this.config && !this.config.appId);
  }
  /**
   * Initiate the connection flow.
   * Returns the approval URL to redirect the user to.
   * Uses GLUECO_PRIVATE_KEY from environment.
   */
  async connect(options) {
    const result = await connect({
      ...options,
      fetch: this.fetchFn
    });
    this.config = {
      appId: "",
      // Will be set after callback
      proxyUrl: result.proxyUrl
    };
    await this.configStorage.save(this.config);
    return result;
  }
  /**
   * Handle the callback after user approval.
   * This loads the stored config (saved during connect()) and updates it with the appId.
   */
  async handleCallback(params) {
    const result = handleCallback(params);
    if (result.approved && result.appId) {
      await this.loadState();
      if (!this.config) {
        throw new Error(
          "No config found. Make sure connect() was called before handleCallback(). The config should have been persisted during the connect flow."
        );
      }
      this.config = {
        ...this.config,
        appId: result.appId
      };
      await this.configStorage.save(this.config);
      this.gatewayFetch = null;
    }
    return result;
  }
  /**
   * Get the PoP-enabled fetch function.
   * Uses GLUECO_PRIVATE_KEY from environment.
   */
  async getFetch() {
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
      throwOnError: this.throwOnError
    });
    return this.gatewayFetch;
  }
  /**
   * Get the proxy URL for configuring SDK baseURL.
   */
  async getProxyUrl() {
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
  async getResourceBaseUrl(resourceType, provider) {
    const proxyUrl = await this.getProxyUrl();
    return `${proxyUrl}/r/${resourceType}/${provider}`;
  }
  /**
   * Get the app ID.
   */
  async getAppId() {
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
  async getTransport() {
    const fetch = await this.getFetch();
    const proxyUrl = await this.getProxyUrl();
    const transport = {
      async request(resourceId, action, payload, options) {
        const [resourceType, provider] = resourceId.split(":");
        const url = `${proxyUrl}/r/${resourceType}/${provider}/${action.replace(".", "/")}`;
        const response = await fetch(url, {
          method: options?.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...options?.headers
          },
          body: JSON.stringify(payload),
          signal: options?.signal
        });
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        if (!response.ok) {
          const errorBody = await response.text();
          let parsed;
          try {
            parsed = JSON.parse(errorBody);
          } catch {
            parsed = errorBody;
          }
          const error = parseGatewayError(parsed, response.status);
          throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
        }
        const data = await response.json();
        return {
          data,
          status: response.status,
          headers
        };
      },
      async requestStream(resourceId, action, payload, options) {
        const [resourceType, provider] = resourceId.split(":");
        const url = `${proxyUrl}/r/${resourceType}/${provider}/${action.replace(".", "/")}`;
        const streamPayload = typeof payload === "object" && payload !== null ? { ...payload, stream: true } : payload;
        const response = await fetch(url, {
          method: options?.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...options?.headers
          },
          body: JSON.stringify(streamPayload),
          signal: options?.signal
        });
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        if (!response.ok) {
          const errorBody = await response.text();
          let parsed;
          try {
            parsed = JSON.parse(errorBody);
          } catch {
            parsed = errorBody;
          }
          const error = parseGatewayError(parsed, response.status);
          throw error ?? new Error(`Gateway error: ${response.status} ${errorBody}`);
        }
        if (!response.body) {
          throw new Error("No response body for streaming request");
        }
        return {
          stream: response.body,
          status: response.status,
          headers
        };
      },
      getProxyUrl: () => proxyUrl,
      getFetch: () => fetch
    };
    return transport;
  }
  /**
   * Disconnect and clear all stored credentials.
   */
  async disconnect() {
    await this.configStorage.delete();
    this.config = null;
    this.gatewayFetch = null;
  }
  /**
   * Load state from storage.
   */
  async loadState() {
    if (!this.config) {
      this.config = await this.configStorage.load();
    }
  }
};
var MemoryConfigStorage = class {
  constructor() {
    this.config = null;
  }
  async load() {
    return this.config;
  }
  async save(config) {
    this.config = config;
  }
  async delete() {
    this.config = null;
  }
};
var FileConfigStorage = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  async load() {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  async save(config) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(config, null, 2));
  }
  async delete() {
    try {
      const fs = await import('fs/promises');
      await fs.unlink(this.filePath);
    } catch {
    }
  }
};
var EnvConfigStorage = class {
  constructor(appIdEnv = "GATEWAY_APP_ID", proxyUrlEnv = "GATEWAY_PROXY_URL") {
    this.appIdEnv = appIdEnv;
    this.proxyUrlEnv = proxyUrlEnv;
  }
  async load() {
    const appId = process.env[this.appIdEnv];
    const proxyUrl = process.env[this.proxyUrlEnv];
    if (!appId || !proxyUrl) {
      return null;
    }
    return { appId, proxyUrl };
  }
  async save(config) {
    console.warn(
      `EnvConfigStorage: Cannot save config. Set ${this.appIdEnv} and ${this.proxyUrlEnv} manually.`
    );
    console.log(`App ID: ${config.appId}`);
    console.log(`Proxy URL: ${config.proxyUrl}`);
  }
  async delete() {
    console.warn(
      `EnvConfigStorage: Cannot delete config. Remove env vars manually.`
    );
  }
};

export { ConnectError, ENV_PRIVATE_KEY, EnvConfigStorage, FileConfigStorage, GatewayClient, GatewayError, KeyError, MemoryConfigStorage, base64UrlDecode, base64UrlEncode, connect, createGatewayFetch, createGatewayFetchFromEnv, createPairingString, createTransport, generateNonce, getPublicKeyBytes, handleCallback, isGatewayError, loadSeedFromEnv, parseGatewayError, parsePairingString, publicKeyFromSeed, resolveFetch, signToBase64Url, signWithSeed, verify2 as verify };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map