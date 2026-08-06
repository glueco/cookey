#!/usr/bin/env node
// Verify the published SDK installs and imports in a clean consumer project.
// Only @glueco/sdk publishes to npm — the gateway ships by deployment and
// connectors are data in the glueco/connectors registry.
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGE = "@glueco/sdk";
const dir = mkdtempSync(join(tmpdir(), "cookey-consumer-"));

try {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  execSync(`npm install ${PACKAGE}`, { cwd: dir, stdio: "inherit" });

  writeFileSync(
    join(dir, "check.mjs"),
    `import { buildCanonicalRequestV1, generateKeyPair, POP_VERSION } from "${PACKAGE}";
const { publicKeyBase64 } = await generateKeyPair();
if (!publicKeyBase64 || POP_VERSION !== "1") throw new Error("sdk import broken");
const canonical = buildCanonicalRequestV1({ method: "post", pathWithQuery: "/x", appId: "a", ts: "1", nonce: "n".repeat(16), bodyHash: "h" });
if (!canonical.startsWith("v1\\nPOST")) throw new Error("canonical broken");
console.log("✅ ${PACKAGE} installs and imports");
`,
  );
  execSync("node check.mjs", { cwd: dir, stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
