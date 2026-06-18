'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, TrendingUp, Wallet, Users } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Commission {
  id: string;
  orderId: string;
  baseAmount: number;
  rate: number;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  createdAt: string;
  paidAt: string | null;
  orderTotal: number | null;
}

interface Dashboard {
  affiliate: { id: string; code: string; isActive: boolean } | null;
  config: { commissionRate: number; cookieDays: number; isActive: boolean };
  totals: { pending: number; paid: number; cancelled: number; conversions: number };
  commissions: Commission[];
}

const STATUS = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Paga', cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchDashboard(token: string): Promise<Dashboard> {
  const res = await fetch(`${BASE}/api/v1/affiliates/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Erro ao carregar');
  return res.json();
}

export default function AfiliadoPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const { data, isLoading } = useQuery({
    queryKey: ['affiliate-me'],
    queryFn: () => fetchDashboard(token!),
    enabled: !!token,
  });

  const activate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/affiliates/me/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao ativar');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-me'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const rate = data?.config.commissionRate ?? 10;

  // ── Ainda não é afiliado ──────────────────────────────────────────────────
  if (!data?.affiliate) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-xl font-bold">Programa de Afiliados</h1>
        <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="size-7 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-bold">Ganhe indicando nossos produtos</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Ative seu link de afiliado e receba <strong>{rate}% de comissão</strong> sobre cada
            venda feita por quem você indicar. Sem custo para participar.
          </p>
          <button
            onClick={() => activate.mutate()}
            disabled={activate.isPending}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {activate.isPending ? 'Ativando...' : 'Quero ser afiliado'}
          </button>
        </div>
      </div>
    );
  }

  const link = `${origin}/?ref=${data.affiliate.code}`;
  const { totals } = data;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Programa de Afiliados</h1>
        <p className="text-sm text-muted-foreground">
          Você recebe {rate}% de comissão sobre cada venda indicada.
        </p>
      </div>

      {/* Link de afiliado */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="size-4 text-primary" />
          Seu link de afiliado
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm"
          />
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Compartilhe esse link. Quem comprar em até {data.config.cookieDays} dias após clicar gera
          comissão para você.
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" /> A receber
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">{fmt(totals.pending)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5" /> Já pago
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">{fmt(totals.paid)}</p>
        </div>
        <div className="col-span-2 rounded-xl border bg-card p-4 shadow-sm sm:col-span-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> Vendas indicadas
          </p>
          <p className="mt-1 text-2xl font-bold">{totals.conversions}</p>
        </div>
      </div>

      {/* Histórico de comissões */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">Histórico de comissões</h2>
        </div>
        {!data.commissions.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma comissão ainda. Compartilhe seu link para começar a ganhar.
          </p>
        ) : (
          <div className="divide-y">
            {data.commissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    Pedido #{c.orderId.slice(-8).toUpperCase()}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {c.rate}% de {fmt(c.baseAmount)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmt(c.amount)}</p>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}
                  >
                    {STATUS[c.status].label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
