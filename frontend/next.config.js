/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Ensure that static export doesn't happen if not intended, 
  // or configure it if it is. 
  // For now, standalone is best for Docker production.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
