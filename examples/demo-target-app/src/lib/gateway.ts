// ============================================
// GATEWAY CLIENT (v0.4.0 - Env-Only Design)
// Browser-compatible gateway client
// Keys are server-side only - browser stores {appId, proxyUrl}
// ============================================

import {
  handleCallback,
  parsePairingString,
  type GatewayTransport,
  type GatewayResponse,
  type GatewayStreamResponse,
  type GatewayRequestOptions,
} from "@glueco/sdk";
import {
  BrowserConfigStorage,
  type GatewayConfig,
} from "./storage";

// ============================================
// BROWSER GATEWAY CLIENT
// ============================================

/**
 * Browser-compatible gateway client.
 * Uses localStorage for config storage.
 * Keys are managed server-side via GLUECO_PRIVATE_KEY.
 * 
 * Connection flow:
 * 1. Browser calls server API to initiate connect (server has the key)
 * 2. User approves on gateway
 * 3. Browser stores {appId, proxyUrl} from callback
 * 4. Browser makes requests through server API (server signs)
 * 
 * For direct browser-to-gateway requests, use server-side transport.
 */
export class BrowserGatewayClient {
  private configStorage: BrowserConfigStorage;
  private config: GatewayConfig | null = null;

  constructor() {
    this.configStorage = new BrowserConfigStorage();
  }

  /**
   * Check if the client is connected.
   */
  async isConnected(): Promise<boolean> {
    await this.loadState();
    return !!(this.config && this.config.appId);
  }

  /**
   * Initialize connection - stores proxy URL before redirect.
   * Actual connect() is called server-side via API route.
   */
  async prepareConnect(pairingString: string): Promise<{ proxyUrl: string }> {
    const { proxyUrl } = parsePairingString(pairingString);
    
    // Store partial config (appId will be set after callback)
    this.config = {
      appId: "",
      proxyUrl,
    };
    await this.configStorage.save(this.config);
    
    return { proxyUrl };
  }

  /**
   * Handle the callback after approval.
   */
  async handleCallback(params: URLSearchParams): Promise<{
    approved: boolean;
    appId?: string;
  }> {
    const result = handleCallback(params);

    if (result.approved && result.appId) {
      await this.loadState();

      if (!this.config) {
        throw new Error("No config found after callback");
      }

      this.config = {
        ...this.config,
        appId: result.appId,
      };
      await this.configStorage.save(this.config);
      
      // Set expiry if provided
      if (result.expiresAt) {
        this.configStorage.setExpiry(result.expiresAt);
      }
    }

    return result;
  }

  /**
   * Get the configured proxy URL.
   */
  async getProxyUrl(): Promise<string> {
    await this.loadState();
    if (!this.config) {
      throw new Error("Not connected");
    }
    return this.config.proxyUrl;
  }

  /**
   * Get the app ID.
   */
  async getAppId(): Promise<string> {
    await this.loadState();
    if (!this.config || !this.config.appId) {
      throw new Error("Not connected");
    }
    return this.config.appId;
  }

  /**
   * Get the gateway config.
   */
  async getConfig(): Promise<GatewayConfig | null> {
    await this.loadState();
    return this.config;
  }

  /**
   * Disconnect and clear all stored data.
   */
  async disconnect(): Promise<void> {
    await this.configStorage.delete();
    this.config = null;
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
// SINGLETON
// ============================================

let gatewayClient: BrowserGatewayClient | null = null;

/**
 * Get or create the gateway client singleton.
 */
export function getGatewayClient(): BrowserGatewayClient {
  if (!gatewayClient) {
    gatewayClient = new BrowserGatewayClient();
  }
  return gatewayClient;
}

/**
 * Get the config storage instance.
 */
export function getConfigStorage(): BrowserConfigStorage {
  return new BrowserConfigStorage();
}

/**
 * Clear the gateway client singleton.
 */
export function clearGatewayClient(): void {
  gatewayClient = null;
}

// Re-export types for convenience
export type { GatewayTransport, GatewayResponse, GatewayStreamResponse } from "@glueco/sdk";
export type { GatewayConfig, BrowserConfigStorage } from "./storage";
