/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output only for Docker; Vercel manages its own output format
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
