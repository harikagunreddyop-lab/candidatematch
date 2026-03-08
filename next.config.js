/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  experimental: {
    instrumentationHook: true,
  },
  images: {
    domains: [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse uses 'canvas' optionally — tell webpack to ignore it
      config.externals = [...(config.externals || []), 'canvas'];
    }
    // unpdf/pdfjs triggers "Critical dependency: the request of a dependency is an expression"
    config.ignoreWarnings = [
      ...(Array.isArray(config.ignoreWarnings) ? config.ignoreWarnings : []),
      { module: /node_modules\/unpdf/ },
      /Critical dependency: the request of a dependency is an expression/,
    ];
    return config;
  },
};

const { withSentryConfig } = require('@sentry/nextjs');
module.exports = withSentryConfig(nextConfig, { silent: true });