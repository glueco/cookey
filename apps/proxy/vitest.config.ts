import { defineConfig } from "vitest/config";
import path from "path";

// Load apps/proxy/.env so DB-backed integration tests can reach Postgres.
// Missing file is fine — those tests skip when DATABASE_URL is absent.
try {
  process.loadEnvFile(path.resolve(__dirname, ".env"));
} catch {
  // no .env — unit tests only
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests that need DATABASE_URL are gated by their own describe.skipIf
    testTimeout: 20000,
  },
});
