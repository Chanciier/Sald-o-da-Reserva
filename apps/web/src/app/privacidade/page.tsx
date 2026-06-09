import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal-page-shell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API}/api/v1/content/pages/privacidade`, {
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
    title: 'Política de Privacidade — Saldão da Reserva',
    description:
      'Saiba como o Saldão da Reserva coleta, utiliza e protege seus dados pessoais, em conformidade com a LGPD (Lei 13.709/2018).',
    openGraph: {
      title: 'Política de Privacidade — Saldão da Reserva',
      description: 'Política de privacidade e proteção de dados do Saldão da Reserva (LGPD).',
    },
  };
}

export default async function PrivacidadePage() {
  const page = await getPage();
  return (
    <LegalPageShell title={page?.title ?? 'Política de Privacidade'} updatedAt={page?.updatedAt}>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: page.content }} />
      ) : (
        <p className="text-muted-foreground">Conteúdo temporariamente indisponível.</p>
      )}
    </LegalPageShell>
  );
}
