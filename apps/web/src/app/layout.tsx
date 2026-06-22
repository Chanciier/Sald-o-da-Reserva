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
import { PixelProvider } from '@/components/pixel-provider';

const inter = Inter({ subsets: ['latin'] });

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saldaodareserva.com.br';

export const metadata: Metadata = {
  title: { default: 'Saldão da Reserva', template: '%s — Saldão da Reserva' },
  description:
    'Produtos de logística reversa revisados e garantidos com economia de até 80%. Compra segura, NF-e e entrega para todo o Brasil.',
  metadataBase: new URL(BASE),
  openGraph: {
    type: 'website',
    siteName: 'Saldão da Reserva',
    title: 'Saldão da Reserva',
    description:
      'Produtos revisados com até 80% de desconto. Compra segura, NF-e e entrega para todo o Brasil.',
    locale: 'pt_BR',
  },
  robots: { index: true, follow: true },
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
        <PixelProvider />
      </body>
    </html>
  );
}
