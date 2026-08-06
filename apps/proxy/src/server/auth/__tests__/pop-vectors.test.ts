import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { buildCanonicalRequestV1 } from "@/shared";
import { hashBody, verifySignatureWithCanonical } from "@/lib/crypto";

// ============================================
// PoP v1 CROSS-LANGUAGE TEST VECTORS
// sdks/test-vectors.json is the shared contract between the gateway
// (this suite, @noble verification) and the SDKs (WebCrypto / PyNaCl
// signing). If this test fails, the wire protocol drifted.
// ============================================

interface Vector {
  name: string;
  method: string;
  pathWithQuery: string;
  appId: string;
  ts: string;
  nonce: string;
  body: string;
  bodyHashBase64Url: string;
  canonicalRequest: string;
  signatureBase64Url: string;
}

const fixture = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../../sdks/test-vectors.json"),
    "utf8",
  ),
) as { publicKeyBase64: string; vectors: Vector[] };

describe("PoP v1 test vectors", () => {
  for (const vector of fixture.vectors) {
    describe(vector.name, () => {
      it("gateway body hash matches", () => {
        expect(hashBody(vector.body)).toBe(vector.bodyHashBase64Url);
      });

      it("gateway canonical request matches", () => {
        const canonical = buildCanonicalRequestV1({
          method: vector.method,
          pathWithQuery: vector.pathWithQuery,
          appId: vector.appId,
          ts: vector.ts,
          nonce: vector.nonce,
          bodyHash: vector.bodyHashBase64Url,
        });
        expect(canonical).toBe(vector.canonicalRequest);
      });

      it("gateway verifies the SDK-produced signature", async () => {
        const valid = await verifySignatureWithCanonical(
          fixture.publicKeyBase64,
          vector.signatureBase64Url,
          vector.canonicalRequest,
        );
        expect(valid).toBe(true);
      });

      it("rejects a tampered canonical request", async () => {
        const valid = await verifySignatureWithCanonical(
          fixture.publicKeyBase64,
          vector.signatureBase64Url,
          vector.canonicalRequest.replace("v1", "v2"),
        );
        expect(valid).toBe(false);
      });
    });
  }
});
