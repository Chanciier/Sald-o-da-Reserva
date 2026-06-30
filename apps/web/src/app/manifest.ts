import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Saldão da Reversa',
    short_name: 'Saldão',
    description: 'Painel e loja do Saldão da Reversa',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#facc15',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
