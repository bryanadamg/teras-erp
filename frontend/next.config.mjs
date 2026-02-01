/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
  // Ensure trailing slashes to avoid file resolution issues in Electron
  trailingSlash: true,
};

export default nextConfig;
