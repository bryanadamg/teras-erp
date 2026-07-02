/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      // Legacy routes folded into /item-metadata (were client-side stub pages)
      { source: '/attributes', destination: '/item-metadata', permanent: false },
      { source: '/categories', destination: '/item-metadata', permanent: false },
      { source: '/uom', destination: '/item-metadata', permanent: false },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://api:8000/api/:path*',
      },
      {
        source: '/static/:path*',
        destination: 'http://api:8000/static/:path*',
      },
    ]
  },
}

module.exports = nextConfig
