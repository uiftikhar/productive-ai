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
  
  // Add environment variables to make available to the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://server:3000',
    NEXT_PUBLIC_BROWSER_API_URL: process.env.NEXT_PUBLIC_BROWSER_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://server:3000',
    NEXT_PUBLIC_BROWSER_WS_URL: process.env.NEXT_PUBLIC_BROWSER_WS_URL || 'ws://localhost:3000',
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