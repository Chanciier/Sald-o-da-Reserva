'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Truck, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SHIPMENT_STATUS: Record<string, { label: string; cls: string; step: number }> = {
  PENDING: { label: 'Aguardando envio', cls: 'text-yellow-700', step: 1 },
  LABEL_PURCHASED: { label: 'Etiqueta gerada', cls: 'text-blue-700', step: 2 },
  SHIPPED: { label: 'Enviado', cls: 'text-indigo-700', step: 3 },
  IN_TRANSIT: { label: 'Em trânsito', cls: 'text-purple-700', step: 4 },
  DELIVERED: { label: 'Entregue', cls: 'text-green-700', step: 5 },
  CANCELLED: { label: 'Cancelado', cls: 'text-red-700', step: 0 },
};

async function fetchOrders(token: string) {
  const res = await fetch(`${BASE}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return Array.isArray(data) ? data : [];
}

export default function ClienteRastreamento() {
  const { token } = useAuth();

  const {
    data: orders = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['cliente-tracking'],
    queryFn: () => fetchOrders(token!),
    enabled: !!token,
  });

  const shippedOrders = orders.filter((o: { shipment: unknown }) => o.shipment !== null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Rastreamento</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !shippedOrders.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium">Nenhum pedido em trânsito</p>
          <p className="text-sm text-muted-foreground">Seus pedidos enviados aparecerão aqui.</p>
          <Link href="/pedidos" className="mt-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            Ver todos os pedidos
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {shippedOrders.map(
            (o: {
              id: string;
              createdAt: string;
              status: string;
              total: number;
              items: { name: string; quantity: number }[];
              shipment: {
                carrier: string;
                service: string;
                trackingCode: string | null;
                status: string;
                deliveryMin: number | null;
                deliveryMax: number | null;
              };
            }) => {
              const ship = o.shipment;
              const statusInfo = SHIPMENT_STATUS[ship.status] ?? {
                label: ship.status,
                cls: 'text-muted-foreground',
                step: 0,
              };
              const steps = [
                'Pedido realizado',
                'Etiqueta gerada',
                'Enviado',
                'Em trânsito',
                'Entregue',
              ];

              return (
                <div key={o.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b">
                    <div>
                      <Link
                        href={`/pedidos/${o.id}`}
                        className="font-mono text-sm font-semibold text-primary hover:underline"
                      >
                        Pedido #{o.id.slice(-8).toUpperCase()}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                        {ship.carrier && ` · ${ship.carrier}`}
                        {ship.deliveryMin &&
                          ship.deliveryMax &&
                          ` · ${ship.deliveryMin}–${ship.deliveryMax} dias`}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    {/* Progress steps */}
                    <div className="flex items-center gap-0">
                      {steps.map((step, i) => {
                        const done = statusInfo.step > i;
                        const current = statusInfo.step === i + 1;
                        return (
                          <div key={step} className="flex flex-1 items-center">
                            <div className="flex flex-col items-center">
                              <div
                                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  done
                                    ? 'bg-primary text-primary-foreground'
                                    : current
                                      ? 'bg-primary/20 text-primary ring-2 ring-primary'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {done ? '✓' : i + 1}
                              </div>
                              <p
                                className={`text-xs mt-1 text-center w-16 leading-tight ${done || current ? 'text-foreground' : 'text-muted-foreground'}`}
                              >
                                {step}
                              </p>
                            </div>
                            {i < steps.length - 1 && (
                              <div
                                className={`flex-1 h-0.5 mx-1 -mt-5 ${done ? 'bg-primary' : 'bg-muted'}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Tracking code */}
                    {ship.trackingCode && (
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
                        <div>
                          <p className="text-xs text-muted-foreground">Código de rastreio</p>
                          <p className="font-mono text-sm font-semibold">{ship.trackingCode}</p>
                        </div>
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
