/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the tracing/resolution root to this app. Without this, Next.js
  // detects the monorepo's root package-lock.json and resolves modules
  // from ITS node_modules too — masking a genuinely broken or missing
  // @glueco/sdk install here behind a working workspace-linked copy up
  // there. This app is a standalone npm consumer of the package; it
  // should only ever see what its own node_modules actually has.
  outputFileTracingRoot: __dirname,
  transpilePackages: ['@glueco/sdk'],
  webpack: (config, { isServer }) => {
    // Stub out fs/promises for browser bundles
    // The SDK imports FileKeyStorage which uses fs, but we use browser storage
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        'fs/promises': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
