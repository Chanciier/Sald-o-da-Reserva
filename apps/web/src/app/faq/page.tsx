'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const CATEGORIES = ['Compras', 'Pagamentos', 'Entregas', 'Trocas', 'Conta', 'Segurança'];

interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  position: number;
}

export default function FaqPage() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Compras');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/content/faq`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
  }, []);

  const filtered = items.filter((i) => i.category === activeCategory);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span className="text-foreground">Perguntas Frequentes</span>
      </nav>

      <h1 className="mb-2 text-3xl font-bold">Perguntas Frequentes</h1>
      <p className="mb-8 text-muted-foreground text-sm">
        Encontre respostas rápidas para as dúvidas mais comuns.
      </p>

      {/* Category tabs */}
      <div className="mb-8 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setOpenId(null);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FAQ accordion */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma pergunta nesta categoria ainda.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium hover:bg-muted transition-colors"
              >
                <span>{item.question}</span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${openId === item.id ? 'rotate-180' : ''}`}
                />
              </button>
              {openId === item.id && (
                <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-xl border border-border bg-muted/40 p-6 text-sm">
        <p className="font-medium mb-1">Não encontrou sua resposta?</p>
        <p className="text-muted-foreground mb-3">
          Entre em contato com nossa equipe de atendimento.
        </p>
        <Link href="/contato" className="text-primary hover:underline font-medium">
          Falar com o suporte →
        </Link>
      </div>
    </main>
  );
}
