import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';
import { sanitizeHtml } from '@/lib/sanitize';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/cookies`, {
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
    title: 'Política de Cookies — Saldão da Reserva',
    description:
      'Entenda como o Saldão da Reserva utiliza cookies e como gerenciar suas preferências de privacidade.',
    openGraph: {
      title: 'Política de Cookies — Saldão da Reserva',
      description: 'Política de cookies e consentimento do Saldão da Reserva.',
    },
  };
}

export default async function CookiesPage() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Política de Cookies'} updatedAt={page?.updatedAt}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.content) }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
