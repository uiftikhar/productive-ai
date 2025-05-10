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
  
  // Add API proxy configuration
  async rewrites() {
    return [
      // Proxy meeting analysis API requests to the server
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
      // Proxy other API requests to the server
      {
        source: '/api/:path*',
        has: [
          {
            type: 'header',
            key: 'x-bypass-auth',
            value: '1',
          },
        ],
        destination: 'http://localhost:3001/api/:path*',
      },
      // Auth requests will be handled by the Next.js routes directly
      // and not be proxied to the backend
    ];
  },
};

module.exports = nextConfig; 