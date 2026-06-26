import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';
import { sanitizeHtml } from '@/lib/sanitize';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/trocas-e-devolucoes`, {
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
    title: 'Trocas e Devoluções — Saldão da Reversa',
    description:
      'Política completa de trocas e devoluções do Saldão da Reversa. Conheça seu direito de arrependimento de 7 dias e o processo simplificado de devolução.',
    openGraph: {
      title: 'Trocas e Devoluções — Saldão da Reversa',
      description: 'Política de trocas e devoluções conforme o Código de Defesa do Consumidor.',
    },
  };
}

export default async function TrocasEDevolucoes() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Trocas e Devoluções'} updatedAt={page?.updatedAt}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
