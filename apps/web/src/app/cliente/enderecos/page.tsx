'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MapPin, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ShippingAddress {
  name: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

async function fetchOrders(token: string) {
  const res = await fetch(`${BASE}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return Array.isArray(data) ? data : [];
}

export default function ClienteEnderecos() {
  const { token } = useAuth();

  const {
    data: orders = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['cliente-orders-addresses'],
    queryFn: () => fetchOrders(token!),
    enabled: !!token,
  });

  // Extract unique addresses from orders
  const seen = new Set<string>();
  const addresses: (ShippingAddress & { orderId: string; date: string })[] = [];

  for (const o of orders) {
    const addr = o.shippingAddress as ShippingAddress;
    if (!addr) continue;
    const key = `${addr.cep}-${addr.street}-${addr.number}`;
    if (!seen.has(key)) {
      seen.add(key);
      addresses.push({ ...addr, orderId: o.id, date: o.createdAt });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meus Endereços</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <p className="text-sm text-muted-foreground">Endereços utilizados em pedidos anteriores.</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !addresses.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium">Nenhum endereço encontrado</p>
          <p className="text-sm text-muted-foreground">
            Seus endereços de entrega aparecem aqui após você realizar um pedido.
          </p>
          <Link
            href="/produtos"
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((addr) => (
            <div
              key={`${addr.cep}-${addr.number}`}
              className="rounded-xl border bg-card p-5 shadow-sm space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{addr.name}</p>
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>
              <p className="text-sm text-muted-foreground">
                {addr.street}, {addr.number}
                {addr.complement ? ` – ${addr.complement}` : ''}
              </p>
              <p className="text-sm text-muted-foreground">
                {addr.neighborhood} · {addr.city}/{addr.state}
              </p>
              <p className="text-sm text-muted-foreground font-mono">CEP: {addr.cep}</p>
              <p className="text-xs text-muted-foreground/60 pt-1">
                Usado em {new Date(addr.date).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
