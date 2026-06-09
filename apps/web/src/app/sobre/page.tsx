import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/sobre`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ title: string; content: string; updatedAt: string }>;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Sobre Nós — Saldão da Reserva',
    description:
      'Conheça a história, missão e valores do Saldão da Reserva. Especializados em produtos de logística reversa revisados com garantia.',
    openGraph: {
      title: 'Sobre o Saldão da Reserva',
      description:
        'Plataforma especializada em produtos de logística reversa revisados com até 80% de desconto.',
    },
  };
}

export default async function SobrePage() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Sobre Nós'} updatedAt={undefined}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: page.content }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
