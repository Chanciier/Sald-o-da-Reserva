'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { FileText, ExternalLink } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface LegalPage {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  version: number;
  updatedAt: string;
}

const PAGE_SLUGS = [
  { slug: 'termos-de-uso', label: 'Termos de Uso', route: '/termos-de-uso' },
  { slug: 'privacidade', label: 'Política de Privacidade', route: '/privacidade' },
  { slug: 'cookies', label: 'Política de Cookies', route: '/cookies' },
  { slug: 'trocas-e-devolucoes', label: 'Trocas e Devoluções', route: '/trocas-e-devolucoes' },
  { slug: 'entregas', label: 'Política de Entrega', route: '/entregas' },
  { slug: 'sobre', label: 'Sobre Nós', route: '/sobre' },
  { slug: 'contato', label: 'Contato', route: '/contato' },
];

export default function AdminPaginasPage() {
  const { token } = useAuth();
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/v1/content/pages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setPages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const pageMap = new Map(pages.map((p) => [p.slug, p]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Páginas Jurídicas</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-3">
          {PAGE_SLUGS.map(({ slug, label, route }) => {
            const page = pageMap.get(slug);
            return (
              <div
                key={slug}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">/{slug}</span>
                      {page && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            page.published
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                          }`}
                        >
                          {page.published ? 'Publicado' : 'Rascunho'}
                        </span>
                      )}
                      {page && (
                        <span className="text-xs text-muted-foreground">v{page.version}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={route}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Ver página"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                  <Link
                    href={`/admin/conteudo/paginas/${slug}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
