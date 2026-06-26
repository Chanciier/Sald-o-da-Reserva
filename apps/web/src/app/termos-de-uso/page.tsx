import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';
import { sanitizeHtml } from '@/lib/sanitize';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/termos-de-uso`, {
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
    title: 'Termos de Uso — Saldão da Reserva',
    description:
      'Leia os Termos de Uso da plataforma Saldão da Reserva. Conheça seus direitos, responsabilidades e as regras de utilização do nosso e-commerce.',
    openGraph: {
      title: 'Termos de Uso — Saldão da Reserva',
      description: 'Termos e condições de uso da plataforma Saldão da Reserva.',
    },
  };
}

export default async function TermosDeUsoPage() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Termos de Uso'} updatedAt={page?.updatedAt}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
