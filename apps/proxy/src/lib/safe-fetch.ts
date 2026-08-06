import { lookup } from "dns/promises";

// ============================================
// SSRF-GUARDED FETCH
// Used for ALL server-side fetches of admin-supplied URLs (connector
// install, marketplace index, well-known grants, update checks).
//
// - https only (http://localhost allowed in development)
// - DNS-resolves every hop and rejects private/internal ranges
// - re-validates on every redirect (max 3)
// - 5s timeout, 64 KB size cap
// ============================================

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_BYTES = 64 * 1024;

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "scheme"
      | "private_address"
      | "dns"
      | "redirect"
      | "timeout"
      | "too_large"
      | "network",
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

/**
 * Is this literal IP inside a private/internal range?
 * Covers loopback, RFC1918, link-local (incl. cloud metadata IPs),
 * CGNAT, unspecified, and the IPv6 equivalents.
 */
export function isPrivateIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  const octets = v4.split(".");
  if (octets.length === 4 && octets.every((o) => /^\d{1,3}$/.test(o))) {
    const [a, b] = octets.map((o) => parseInt(o, 10));
    if (a === 0) return true; // 0.0.0.0/8 unspecified
    if (a === 10) return true; // RFC1918
    if (a === 127) return true; // loopback
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified / loopback
  if (lower.startsWith("fe8") || lower.startsWith("fe9")) return true; // link-local fe80::/10
  if (lower.startsWith("fea") || lower.startsWith("feb")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

function isDevLocalhostAllowed(url: URL): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

/**
 * Validate one URL hop: scheme + DNS resolution to public addresses only.
 */
export async function assertUrlSafe(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    if (isDevLocalhostAllowed(url)) return;
    throw new SafeFetchError(
      `Refusing to fetch non-https URL (${url.protocol}//…)`,
      "scheme",
    );
  }

  // Literal IP in the URL
  const bareHost = url.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(bareHost) || bareHost.includes(":")) {
    if (isPrivateIp(bareHost)) {
      throw new SafeFetchError(
        `Refusing to fetch private address ${bareHost}`,
        "private_address",
      );
    }
    return;
  }

  let addresses;
  try {
    addresses = await lookup(bareHost, { all: true });
  } catch {
    throw new SafeFetchError(`DNS resolution failed for ${bareHost}`, "dns");
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new SafeFetchError(
        `Host ${bareHost} resolves to private address ${address}`,
        "private_address",
      );
    }
  }
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  text: string;
  finalUrl: string;
}

/**
 * Fetch an admin-supplied URL with SSRF protections.
 */
export async function safeFetch(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new SafeFetchError(`Invalid URL: ${rawUrl}`, "network");
    }

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertUrlSafe(url);

      let response: Response;
      try {
        response = await fetch(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "application/json, text/plain, */*" },
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new SafeFetchError(
            `Fetch timed out after ${timeoutMs}ms`,
            "timeout",
          );
        }
        throw new SafeFetchError(
          `Network error fetching ${url.hostname}: ${error instanceof Error ? error.message : "unknown"}`,
          "network",
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new SafeFetchError(
            "Redirect response without Location header",
            "redirect",
          );
        }
        if (hop === MAX_REDIRECTS) {
          throw new SafeFetchError(
            `Too many redirects (max ${MAX_REDIRECTS})`,
            "redirect",
          );
        }
        url = new URL(location, url);
        continue;
      }

      const text = await readCapped(response, maxBytes);
      return {
        status: response.status,
        headers: response.headers,
        text,
        finalUrl: url.toString(),
      };
    }

    throw new SafeFetchError("Redirect loop", "redirect");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && parseInt(declared, 10) > maxBytes) {
    throw new SafeFetchError(
      `Response exceeds ${maxBytes} byte cap`,
      "too_large",
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SafeFetchError(
        `Response exceeds ${maxBytes} byte cap`,
        "too_large",
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
