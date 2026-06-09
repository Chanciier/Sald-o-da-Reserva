import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/cart-context';
import { QueryProvider } from '@/providers/query-provider';
import { ConditionalHeader } from '@/components/layout/conditional-header';
import { ConditionalFooter } from '@/components/layout/conditional-footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Saldão da Reversa',
  description: 'Plataforma de vendas Saldão da Reversa',
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
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
