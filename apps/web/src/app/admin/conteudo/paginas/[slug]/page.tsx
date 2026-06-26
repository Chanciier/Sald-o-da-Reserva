'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { sanitizeHtml } from '@/lib/sanitize';
import { ArrowLeft, Eye } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface LegalPage {
  slug: string;
  title: string;
  content: string;
  published: boolean;
  version: number;
  updatedAt: string;
}

export default function EditLegalPagePage() {
  const { token } = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [page, setPage] = useState<LegalPage | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!token || !slug) return;
    fetch(`${API}/api/v1/content/pages/${slug}?draft=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((p: LegalPage) => {
        setPage(p);
        setTitle(p.title);
        setContent(p.content);
        setPublished(p.published);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, slug]);

  async function save(pub?: boolean) {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API}/api/v1/content/pages/${slug}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, published: pub ?? published }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPage(updated);
        setPublished(updated.published);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/conteudo/paginas"
          className="rounded-md p-1.5 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{page?.title ?? slug}</h1>
          {page && (
            <p className="text-xs text-muted-foreground">
              /{slug} · v{page.version} · {new Date(page.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreview(!preview)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              preview ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            }`}
          >
            <Eye className="size-3.5" />
            Preview
          </button>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              published
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
            }`}
          >
            {published ? 'Publicado' : 'Rascunho'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-sm font-medium">
            <span>Conteúdo (HTML)</span>
            <span className="text-xs text-muted-foreground font-normal">
              Use tags HTML: &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;
            </span>
          </label>
          {preview ? (
            <div
              className="min-h-64 rounded-lg border border-border bg-card p-4 text-sm
                [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:first:mt-0
                [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-medium
                [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5
                [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
            />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={24}
              className={`${inputCls} resize-y font-mono text-xs`}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-primary"
            />
            Publicar (visível ao público)
          </label>
        </div>

        {saved && <p className="text-sm text-green-600 dark:text-green-400">Salvo com sucesso!</p>}

        <div className="flex gap-3">
          <button
            onClick={() => save()}
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {!published && (
            <button
              onClick={() => {
                setPublished(true);
                save(true);
              }}
              disabled={saving}
              className="rounded-lg border border-green-500 bg-green-50 px-5 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-60 transition-colors dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900"
            >
              Salvar e publicar
            </button>
          )}
          {published && (
            <button
              onClick={() => {
                setPublished(false);
                save(false);
              }}
              disabled={saving}
              className="rounded-lg border border-border px-5 py-2 text-sm hover:bg-muted disabled:opacity-60 transition-colors"
            >
              Despublicar (rascunho)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
