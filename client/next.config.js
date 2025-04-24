/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  // Server Actions are enabled by default in Next.js 14
  // No need for the experimental flag anymore
  experimental: {
    // This is needed for the standalone output to work correctly
    outputFileTracingRoot: __dirname,
  },
};

module.exports = nextConfig; 