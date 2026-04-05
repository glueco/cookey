import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    proxy: "src/proxy.ts",
    client: "src/client.ts",
    contracts: "src/contracts.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@glueco/sdk", "@glueco/shared"],
});
