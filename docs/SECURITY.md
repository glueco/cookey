# Security Model

What Cookey defends, how, and — honestly — what it cannot defend.

## The honest paragraph first

**No scheme survives a fully compromised, unwatched app.** If an app you
granted access to is malicious or taken over, it can spend your budget up to
the caps you set until you notice. Cookey's answer is not a promise that
this can't happen; it is **containment** (caps, expiry, renewal-by-default),
**visibility** (digests, last-IP, anomaly flags, full audit logs), and
**default-dead access** (grants that lapse unless you renew them). Any field
in which an app *promises* to behave (like `runtime`) is treated as a policy
anchor for your decisions, never as a security control. Counterparty
promises are theater; gateway-side enforcement is not.

## What the gateway enforces

1. **Keys never leave.** Provider keys are envelope-encrypted (AES-256-GCM
   under `MASTER_KEY`) and decrypted only inside the execute step. Errors
   and logs redact any echo of the secret; a test pins the log redaction.
2. **Egress pinning.** Outbound provider requests may only target hosts in
   the connector's frozen `allowedHosts`, asserted at the single choke point
   that performs outbound fetches. A connector update that adds hosts
   requires explicit re-approval with the new hosts highlighted.
3. **Frozen documents.** Connectors and grants execute only from DB-frozen
   JSON. The gateway never fetches an external document at request time, and
   install freezes the exact bytes the admin reviewed (no preview/install
   TOCTOU).
4. **SSRF guard.** Every server-side fetch of an admin-supplied URL
   (connector installs, marketplace index, well-known grants, update checks)
   resolves DNS and rejects loopback, RFC1918, link-local (incl. cloud
   metadata IPs), CGNAT, and their IPv6 equivalents; re-validates each of at
   most 3 redirects; 5s timeout; 64 KB cap; https-only (localhost allowed in
   development).
5. **Token hygiene.** `ck_` tokens are 40 chars of CSPRNG base62, stored as
   SHA-256 (lookup by exact hash — timing-safe by construction). Shown to a
   human once, plus a pre-first-use copy-paste window backed by an encrypted
   copy that is deleted on first use. Never logged (tested). Registering the
   `ck_` prefix with GitHub secret scanning is tracked as a follow-up; until
   then leaked tokens are still greppable.
6. **Replay protection.** PoP nonces are unique-inserted into Postgres with
   a TTL of 2× the timestamp window; expired rows are pruned by the sweep
   (TTLs are enforced at read time — the sweep is only cleanup).
7. **Browser blocking.** Requests bearing an `Origin` header or
   `Sec-Fetch-Site: cross-site` are rejected on the data plane and
   `/v1/grant` unless the grant explicitly allows browsers.
8. **IP pinning.** Optional per-grant egress allowlists (exact, `192.168.*`
   wildcards, CIDR), offered prominently for server-runtime apps; fails
   closed when the client IP can't be resolved.
9. **Short-lived secrets.** Pairing codes and claim codes are hash-stored,
   single-use, 10-minute TTL; claim endpoints are IP rate-limited and code
   reuse notifies the owner.
10. **Admin surface.** All admin routes sit behind the cookie session /
    `ADMIN_SECRET`; connector installs and the custom builder are
    admin-only.
11. **Icons.** `iconUrl` renders via `<img>` with no referrer and is never
    fetched server-side; broken icons fall back to an identicon-style badge.

## Residual risks you should understand

- **A leaked bearer token** is silently usable until its expiry or your
  revocation — that ceiling is why long-lived bearer grants trigger a red
  warning and why renewable periods are the default containment. PoP
  eliminates this class for apps willing to hold a keypair.
- **An active thief keeps a grant warm**, so inactivity suspension won't
  catch it; last-IP visibility, anomaly flags, and digests are the
  detection surface there.
- **DNS rebinding** between the SSRF guard's resolution and the fetch is
  partially mitigated (per-hop re-validation), not eliminated; the guard is
  defense-in-depth on top of the egress pin.
- **Spend estimates are estimates.** Connector pricing drives projections
  and cost columns; your provider's bill is authoritative.

Report vulnerabilities via GitHub security advisories on `glueco/cookey`.
