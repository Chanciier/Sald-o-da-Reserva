import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { CartProvider } from '@/contexts/cart-context';
import { QueryProvider } from '@/providers/query-provider';
import { Header } from '@/components/layout/header';
import { CartDrawer } from '@/components/cart/cart-drawer';

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
              <Header />
              <CartDrawer />
              {children}
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
