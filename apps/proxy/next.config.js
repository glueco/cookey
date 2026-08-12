/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 15 promoted this out of `experimental`.
  serverExternalPackages: ["@noble/ed25519", "@noble/hashes"],
  async headers() {
    return [
      {
        // New resource router paths
        source: "/r/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "Content-Type, Authorization, x-app-id, x-ts, x-nonce, x-sig, x-gateway-resource",
          },
        ],
      },
      {
        // App-facing runtime endpoints (/v1/grant, /v1/token/claim)
        source: "/v1/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "Content-Type, Authorization, x-app-id, x-ts, x-nonce, x-sig, x-gateway-resource",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "Content-Type, Authorization, x-app-id, x-ts, x-nonce, x-sig",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
