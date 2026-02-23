/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse uses 'canvas' optionally — tell webpack to ignore it
      config.externals = [...(config.externals || []), 'canvas'];
    }
    return config;
  },
};

module.exports = nextConfig;