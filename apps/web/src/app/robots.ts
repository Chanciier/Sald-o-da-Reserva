import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saldaodareversa.com';

export default function robots(): MetadataRoute.Robots {
  // Don't advertise protected route prefixes (admin/vendedor/checkout/...) in
  // robots.txt — those areas are guarded server-side, not by obscurity. Listing
  // them just hands attackers a map. SEO only needs /api blocked.
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
