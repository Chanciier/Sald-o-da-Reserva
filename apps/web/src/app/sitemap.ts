import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saldaodareversa.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/produtos`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/categorias`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/contato`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/sobre`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    {
      url: `${BASE}/trocas-e-devolucoes`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    { url: `${BASE}/entregas`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    {
      url: `${BASE}/termos-de-uso`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    { url: `${BASE}/privacidade`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/cookies`, lastModified: now, changeFrequency: 'monthly', priority: 0.2 },
  ];
}
