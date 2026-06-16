'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import type { Order } from '@/types/order';

export default function EtiquetaRetiradaPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', params.id],
    queryFn: () => getOrder(token!, params.id),
    enabled: !!token,
  });

  useEffect(() => {
    if (order) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [order]);

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const pickupCode =
    (order as Order & { pickupCode?: string | null }).pickupCode ??
    params.id.slice(-8).toUpperCase();
  const clientName = (order as Order & { user?: { name?: string | null } }).user?.name ?? '—';
  const now = new Date().toLocaleDateString('pt-BR');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pickupCode)}`;

  return (
    <div className="min-h-screen bg-white">
      {/* No-print buttons */}
      <div className="no-print flex gap-3 p-4 border-b">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          Imprimir
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
        >
          Fechar
        </button>
      </div>

      {/* Print area — A5-ish */}
      <div className="mx-auto mt-6 w-[148mm] border-2 border-black font-sans text-black print:mt-0 print:border-0">
        {/* Header */}
        <div className="border-b-2 border-black px-5 py-4 text-center">
          <p className="text-lg font-black uppercase tracking-widest">Saldão da Reserva</p>
          <p className="text-sm font-bold uppercase tracking-wider mt-0.5">Etiqueta de Retirada</p>
        </div>

        {/* Order info */}
        <div className="border-b-2 border-black px-5 py-4 space-y-1 text-sm">
          <p>
            <span className="font-bold">Pedido:</span> #{params.id.slice(-8).toUpperCase()}
          </p>
          <p>
            <span className="font-bold">Cliente:</span> {clientName}
          </p>
          <p>
            <span className="font-bold">Código:</span>{' '}
            <span className="font-mono text-base font-black tracking-widest">{pickupCode}</span>
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center border-b-2 border-black py-5">
          <Image
            src={qrUrl}
            alt={`QR Code: ${pickupCode}`}
            width={150}
            height={150}
            unoptimized
            className="block"
          />
        </div>

        {/* Items */}
        <div className="border-b-2 border-black px-5 py-4">
          <p className="font-bold text-sm mb-2">ITENS:</p>
          <ul className="space-y-1 text-sm">
            {order.items.map((item) => (
              <li key={item.id}>
                • {item.name}{' '}
                <span className="text-xs">
                  (Qtd: {item.quantity}, SKU: {item.sku})
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 text-sm">
          <p>
            <span className="font-bold">Data:</span> {now}
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
