'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Star } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ReviewUser {
  id: string;
  name: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: ReviewUser;
}

interface ReviewsResponse {
  data: Review[];
  total: number;
  page: number;
  pages: number;
  averageRating: number | null;
  totalRatings: number;
}

function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${n <= value ? 'fill-yellow-400 text-yellow-400' : 'fill-muted text-muted-foreground/30'}`}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              n <= (hover || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-muted text-muted-foreground/30'
            }`}
          />
        </button>
      ))}
    </span>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const { user, token } = useAuth();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function load() {
    try {
      const res = await fetch(`${API}/api/v1/reviews/product/${productId}?limit=20`);
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    }
  }

  useEffect(() => {
    load();
  }, [productId]); // eslint-disable-line

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || rating === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API}/api/v1/reviews/product/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Erro ao enviar avaliação.');
      setSubmitted(true);
      setRating(0);
      setComment('');
      load();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(reviewId: string) {
    if (!token) return;
    await fetch(`${API}/api/v1/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  return (
    <section className="mt-12 border-t border-border pt-10">
      <h2 className="mb-6 text-xl font-bold">Avaliações</h2>

      {/* Summary */}
      {data && data.totalRatings > 0 && (
        <div className="mb-8 flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-5">
          <div className="text-center">
            <p className="text-4xl font-bold">{data.averageRating?.toFixed(1)}</p>
            <Stars value={Math.round(data.averageRating ?? 0)} size="sm" />
            <p className="mt-1 text-xs text-muted-foreground">{data.totalRatings} avaliações</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = data.data.filter((r) => r.rating === star).length;
              const pct = data.totalRatings ? Math.round((count / data.totalRatings) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-4 text-right">{star}</span>
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-yellow-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review list */}
      {data && data.data.length > 0 ? (
        <div className="space-y-5 mb-8">
          {data.data.map((review) => (
            <div key={review.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{review.user.name ?? 'Usuário'}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                {(user?.id === review.user.id || user?.role === 'ADMIN') && (
                  <button
                    onClick={() => handleDelete(review.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Excluir
                  </button>
                )}
              </div>
              {review.comment && (
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        data && (
          <p className="mb-8 text-sm text-muted-foreground">
            Nenhuma avaliação ainda. Seja o primeiro a avaliar!
          </p>
        )
      )}

      {/* Write review */}
      {user ? (
        submitted ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
            Obrigado pela sua avaliação!
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-card p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold">Escrever avaliação</h3>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">Sua nota *</p>
              <StarPicker value={rating} onChange={setRating} />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Comentário (opcional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Conte sua experiência com o produto..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Enviando...' : 'Publicar avaliação'}
            </button>
          </form>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          <a href="/login" className="text-primary hover:underline">
            Faça login
          </a>{' '}
          para deixar uma avaliação.
        </p>
      )}
    </section>
  );
}
