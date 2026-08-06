// ============================================
// EGRESS IP MATCHING
// Matches a client IP against an owner-configured allowlist.
// Supported pattern forms (newline- or comma-separated):
//   - exact:    203.0.113.7 or 2001:db8::1
//   - wildcard: 192.168.*  or 10.0.*.*   (IPv4 only, segment-wise)
//   - CIDR:     203.0.113.0/24           (IPv4 only)
// ============================================

/**
 * Parse an allowlist string into individual patterns.
 */
export function parseIpPatterns(list: string): string[] {
  return list
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Check whether an IP matches any pattern in the allowlist string.
 */
export function ipMatchesList(ip: string, list: string): boolean {
  const patterns = parseIpPatterns(list);
  if (patterns.length === 0) return true; // empty allowlist = unrestricted
  return patterns.some((pattern) => ipMatchesPattern(ip, pattern));
}

/**
 * Check whether an IP matches a single pattern.
 */
export function ipMatchesPattern(ip: string, pattern: string): boolean {
  // Exact match works for both IPv4 and IPv6
  if (ip === pattern) return true;

  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — compare the embedded IPv4
  const unmapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (unmapped === pattern) return true;

  if (pattern.includes("/")) {
    return cidrMatch(unmapped, pattern);
  }

  if (pattern.includes("*")) {
    return wildcardMatch(unmapped, pattern);
  }

  return false;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = parseInt(part, 10);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function cidrMatch(ip: string, cidr: string): boolean {
  const [network, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt === null || netInt === null) return false;

  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function wildcardMatch(ip: string, pattern: string): boolean {
  const ipParts = ip.split(".");
  const patternParts = pattern.split(".");
  if (ipParts.length !== 4) return false;
  // "192.168.*" is shorthand for "192.168.*.*"
  while (patternParts.length < 4) patternParts.push("*");
  if (patternParts.length !== 4) return false;

  return patternParts.every(
    (part, i) => part === "*" || part === ipParts[i],
  );
}
