import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/cart-context';
import { QueryProvider } from '@/providers/query-provider';
import { ConditionalHeader } from '@/components/layout/conditional-header';
import { ConditionalFooter } from '@/components/layout/conditional-footer';
import { CookieBanner } from '@/components/cookie-banner';
import { SITE_URL } from '@/lib/site-url';

const inter = Inter({ subsets: ['latin'] });

const BASE = SITE_URL;

export const metadata: Metadata = {
  applicationName: 'Saldão da Reversa',
  title: { default: 'Saldão da Reversa', template: '%s — Saldão da Reversa' },
  description:
    'Produtos de logística reversa revisados e garantidos com economia de até 80%. Compra segura, NF-e e entrega para todo o Brasil.',
  metadataBase: new URL(BASE),
  openGraph: {
    type: 'website',
    siteName: 'Saldão da Reversa',
    title: 'Saldão da Reversa',
    description:
      'Produtos revisados com até 80% de desconto. Compra segura, NF-e e entrega para todo o Brasil.',
    locale: 'pt_BR',
  },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    title: 'Saldão',
    statusBarStyle: 'default',
  },
  icons: { apple: '/icon.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            <CartProvider>
              <ConditionalHeader />
              {children}
              <ConditionalFooter />
              <CookieBanner />
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
