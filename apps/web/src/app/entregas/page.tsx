import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';
import { sanitizeHtml } from '@/lib/sanitize';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/entregas`, {
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
    title: 'Política de Entrega — Saldão da Reserva',
    description:
      'Saiba tudo sobre os prazos de entrega, modalidades de frete, rastreamento e retirada na loja do Saldão da Reserva.',
    openGraph: {
      title: 'Política de Entrega — Saldão da Reserva',
      description: 'Modalidades de entrega, prazos e rastreamento do Saldão da Reserva.',
    },
  };
}

export default async function EntregasPage() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Política de Entrega'} updatedAt={page?.updatedAt}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
