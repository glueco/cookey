// ============================================
// ZERO-DEPENDENCY CRYPTO
// SHA-256 + Ed25519 via WebCrypto — available in Node ≥18 and all
// modern browsers. No @noble, no polyfills, no runtime dependencies.
// ============================================

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error(
      "WebCrypto is unavailable. Node 18+ or a modern browser is required.",
    );
  }
  return cryptoObj.subtle;
}

/** SHA-256 of raw bytes. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await subtle().digest(
    "SHA-256",
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return new Uint8Array(digest);
}

// PKCS8 prefix for a raw Ed25519 seed (RFC 8410)
const PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20,
]);

// SPKI prefix for a raw Ed25519 public key
const SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function importSeed(seed: Uint8Array): Promise<CryptoKey> {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }
  return subtle().importKey(
    "pkcs8",
    concat(PKCS8_PREFIX, seed).buffer as ArrayBuffer,
    { name: "Ed25519" },
    true,
    ["sign"],
  );
}

/** Sign a message with a 32-byte Ed25519 seed. Returns the 64-byte signature. */
export async function ed25519Sign(
  seed: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  const key = await importSeed(seed);
  const signature = await subtle().sign(
    { name: "Ed25519" },
    key,
    message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer,
  );
  return new Uint8Array(signature);
}

/** Derive the 32-byte public key from a seed (via JWK export). */
export async function ed25519PublicKey(seed: Uint8Array): Promise<Uint8Array> {
  const key = await importSeed(seed);
  const jwk = await subtle().exportKey("jwk", key);
  if (!jwk.x) throw new Error("Could not derive Ed25519 public key");
  return base64UrlDecodeRaw(jwk.x);
}

/** Verify an Ed25519 signature with a raw 32-byte public key. */
export async function ed25519Verify(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  const key = await subtle().importKey(
    "spki",
    concat(SPKI_PREFIX, publicKey).buffer as ArrayBuffer,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return subtle().verify(
    { name: "Ed25519" },
    key,
    signature.buffer.slice(signature.byteOffset, signature.byteOffset + signature.byteLength) as ArrayBuffer,
    message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as ArrayBuffer,
  );
}

/** Generate a fresh Ed25519 keypair. Returns raw seed + public bytes. */
export async function ed25519GenerateKeyPair(): Promise<{
  seed: Uint8Array;
  publicKey: Uint8Array;
}> {
  const pair = (await subtle().generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await subtle().exportKey("jwk", pair.privateKey);
  if (!jwk.d || !jwk.x) throw new Error("Could not export generated keypair");
  return {
    seed: base64UrlDecodeRaw(jwk.d),
    publicKey: base64UrlDecodeRaw(jwk.x),
  };
}

/** CSPRNG bytes. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function base64UrlDecodeRaw(value: string): Uint8Array {
  let padded = value.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
