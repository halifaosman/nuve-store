/** @type {import('next').NextConfig} */
const nextConfig = {
  // deploy/update.sh builds into a separate folder, then swaps it in, so the live store keeps running during a build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { unoptimized: true },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      ],
    }];
  },
};
export default nextConfig;
