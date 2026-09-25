import type { Metadata } from 'next';
import { DM_Mono, Space_Grotesk } from 'next/font/google';
import { LinksClient } from './links-client';

// Fontes servidas pelo próprio site (a CSP bloqueia o Google Fonts direto).
const sans = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-links-sans',
});
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-links-mono' });

export const metadata: Metadata = {
  title: 'Links',
  description:
    'Clube Saldão, grupos de ofertas e de sex shop no WhatsApp — todos os links do Saldão da Reversa SJC.',
};

// Página de links da bio do Instagram (portada do projeto LinkFour).
export default function LinksPage() {
  return (
    <div className={`${sans.variable} ${mono.variable}`}>
      <LinksClient />
    </div>
  );
}
