// Content Security Policy. Whitelists every external origin the app actually
// uses so injected <script src=evil>, exfiltration fetches, clickjacking and
// <base>/<form> hijacks are blocked. 'unsafe-inline'/'unsafe-eval' are required
// by Next.js hydration + the Mercado Pago SDK; a nonce-based policy would need a
// middleware refactor. Origins:
//   scripts  → MP SDK, Cloudflare Turnstile
//   connect  → API, MP API, BrasilAPI/ViaCEP (lookup de CEP), Turnstile
//   frames   → Turnstile widget, MP secure fields
//   images   → S3/CloudFront/QR server/any https + data/blob (next/image)
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || '';

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://challenges.cloudflare.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${apiOrigin} https://api.mercadopago.com https://*.mercadopago.com https://brasilapi.com.br https://viacep.com.br https://challenges.cloudflare.com`,
  `frame-src 'self' https://challenges.cloudflare.com https://*.mercadopago.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'self'`,
  `upgrade-insecure-requests`,
]
  .map((d) => d.replace(/\s+/g, ' ').trim())
  .join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

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
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      { source: '/(.*)', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
