import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saldaodareserva.com.br';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/cliente/', '/vendedor/', '/checkout/', '/pagamento/'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
