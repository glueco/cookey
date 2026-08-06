/** @type {import('next').NextConfig} */
const nextConfig = {
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
