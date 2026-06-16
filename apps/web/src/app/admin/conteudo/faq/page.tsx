'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const CATEGORIES = ['Compras', 'Pagamentos', 'Entregas', 'Trocas', 'Conta', 'Segurança'];

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  position: number;
  active: boolean;
}

interface FaqForm {
  category: string;
  question: string;
  answer: string;
  position: number;
  active: boolean;
}

const EMPTY_FORM: FaqForm = {
  category: 'Compras',
  question: '',
  answer: '',
  position: 0,
  active: true,
};

export default function AdminFaqPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FaqForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FaqForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('Compras');

  function headers() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  function loadItems() {
    if (!token) return;
    fetch(`${API}/api/v1/content/faq/admin`, { headers: headers() })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadItems, [token]);

  async function createItem() {
    if (!token || !form.question.trim() || !form.answer.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/content/faq`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm(EMPTY_FORM);
        setCreating(false);
        loadItems();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(id: string) {
    if (!token) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/content/faq/${id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        loadItems();
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    if (!token || !confirm('Remover esta pergunta?')) return;
    await fetch(`${API}/api/v1/content/faq/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    loadItems();
  }

  const filtered = items.filter((i) => i.category === activeCategory);
  const inputCls =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">FAQ</h1>
        <button
          onClick={() => setCreating(!creating)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Nova pergunta
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Nova pergunta</h2>
          <select
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            className={inputCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            placeholder="Pergunta"
            value={form.question}
            onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
            className={inputCls}
          />
          <textarea
            placeholder="Resposta"
            rows={3}
            value={form.answer}
            onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
            className={`${inputCls} resize-none`}
          />
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="Posição"
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: Number(e.target.value) }))}
              className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                className="accent-primary"
              />
              Ativo
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createItem}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              Criar
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-border px-4 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {cat} ({items.filter((i) => i.category === cat).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhuma pergunta nesta categoria.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) =>
            editingId === item.id ? (
              <div key={item.id} className="rounded-xl border border-primary bg-card p-4 space-y-2">
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  value={editForm.question}
                  onChange={(e) => setEditForm((p) => ({ ...p, question: e.target.value }))}
                  className={inputCls}
                />
                <textarea
                  rows={3}
                  value={editForm.answer}
                  onChange={(e) => setEditForm((p) => ({ ...p, answer: e.target.value }))}
                  className={`${inputCls} resize-none`}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editForm.position}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, position: Number(e.target.value) }))
                    }
                    className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.active}
                      onChange={(e) => setEditForm((p) => ({ ...p, active: e.target.checked }))}
                      className="accent-primary"
                    />
                    Ativo
                  </label>
                  <button
                    onClick={() => updateItem(item.id)}
                    disabled={saving}
                    className="ml-auto rounded-md p-1.5 bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-md p-1.5 hover:bg-muted transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{item.question}</p>
                    {!item.active && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.answer}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setEditForm({
                        category: item.category,
                        question: item.question,
                        answer: item.answer,
                        position: item.position,
                        active: item.active,
                      });
                    }}
                    className="rounded-md p-1.5 hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded-md p-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
