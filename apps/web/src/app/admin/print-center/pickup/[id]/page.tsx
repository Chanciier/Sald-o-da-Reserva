'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { confirmarRetiradaExpedicao } from '@/lib/print-center-api';

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Pago — ainda não separado',
  CONFIRMED: 'Confirmado — ainda não separado',
  SEPARATING: 'Em separação',
  SEPARATED: 'Separado, aguardando retirada',
  READY_TO_SHIP: 'Pronto para retirada',
  DELIVERED: 'Já retirado',
  CANCELLED: 'Cancelado',
};

// Alvo do QR Code impresso na etiqueta interna de retirada (gerada assim que
// o pedido é pago). Só lê o pedido (getOrder, já existente) e chama o
// endpoint de confirmação que já existe em Expedição — nenhuma lógica de
// pedido é reescrita aqui.
export default function PrintCenterPickupPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', params.id],
    queryFn: () => getOrder(token!, params.id),
    enabled: !!token,
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmarRetiradaExpedicao(token!, params.id),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['order', params.id] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const shortId = '#' + order.id.slice(-8).toUpperCase();
  const canConfirm = order.status === 'SEPARATED' || order.status === 'READY_TO_SHIP';

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Retirada — {shortId}</h1>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2 text-sm">
        <p>
          <span className="font-medium">Status:</span> {STATUS_LABEL[order.status] ?? order.status}
        </p>
        <p>
          <span className="font-medium">Código de retirada:</span> {order.pickupCode ?? '—'}
        </p>
        <div>
          <span className="font-medium">Itens:</span>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc text-muted-foreground">
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}x {item.name} (SKU: {item.sku})
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {order.status === 'DELIVERED' ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Este pedido já foi retirado.
        </p>
      ) : (
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={!canConfirm || confirmMutation.isPending}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {confirmMutation.isPending
            ? 'Confirmando...'
            : canConfirm
              ? 'Confirmar retirada'
              : 'Aguardando separação do pedido'}
        </button>
      )}
    </div>
  );
}
