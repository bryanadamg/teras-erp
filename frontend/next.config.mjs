/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
  // Ensure trailing slashes to avoid file resolution issues in Electron
  trailingSlash: true,
  // Force relative paths for assets so they load in file:// protocol
  assetPrefix: '.',
};

export default nextConfig;
