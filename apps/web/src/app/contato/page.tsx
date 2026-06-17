'use client';

import { useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ContatoPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`${API}/api/v1/content/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setStatus('sent');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  const inputCls =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span className="text-foreground">Contato</span>
      </nav>

      <h1 className="mb-8 text-3xl font-bold">Contato</h1>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Company info */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border p-6 space-y-3 text-sm">
            <h2 className="text-base font-semibold">Nossos Dados</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Razão Social:</span> Saldão da Reserva
                Comércio Eletrônico Ltda.
              </li>
              <li>
                <span className="font-medium text-foreground">CNPJ:</span> 00.000.000/0001-00
              </li>
              <li>
                <span className="font-medium text-foreground">E-mail:</span>{' '}
                <a
                  href="mailto:saldaodareversasjc@gmail.com"
                  className="text-primary hover:underline"
                >
                  saldaodareversasjc@gmail.com
                </a>
              </li>
              <li>
                <span className="font-medium text-foreground">Celular:</span>{' '}
                <a href="tel:+5512981116645" className="text-primary hover:underline">
                  (12) 98111-6645
                </a>
              </li>
              <li>
                <span className="font-medium text-foreground">Endereço:</span> A ser preenchido pelo
                administrador
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border p-6 text-sm space-y-2">
            <h2 className="text-base font-semibold">Horário de Atendimento</h2>
            <ul className="space-y-1 text-muted-foreground">
              <li>Segunda a Sexta: 7h às 19h</li>
              <li>Sábados, domingos e feriados: sem atendimento</li>
            </ul>
          </div>
        </div>

        {/* Contact form */}
        <div>
          <h2 className="mb-4 text-base font-semibold">Envie uma mensagem</h2>

          {status === 'sent' ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              <p className="font-semibold mb-1">Mensagem enviada!</p>
              <p>Retornaremos em até 2 dias úteis no e-mail informado.</p>
              <button
                onClick={() => setStatus('idle')}
                className="mt-4 text-primary hover:underline text-sm"
              >
                Enviar outra mensagem
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Nome</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Seu nome completo"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">E-mail</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="seu@email.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Assunto</label>
                <input
                  required
                  type="text"
                  value={form.subject}
                  onChange={(e) => set('subject', e.target.value)}
                  placeholder="Pedido, entrega, dúvida..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Mensagem</label>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => set('message', e.target.value)}
                  placeholder="Descreva sua dúvida ou solicitação..."
                  className={`${inputCls} resize-none`}
                />
              </div>

              {status === 'error' && (
                <p className="text-sm text-destructive">
                  Erro ao enviar a mensagem. Tente novamente ou use o e-mail direto.
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar mensagem'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
