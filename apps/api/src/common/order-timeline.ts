import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Títulos legíveis padrão por status (call sites podem sobrescrever). */
export const ORDER_STATUS_TITLES: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Pedido criado',
  CONFIRMED: 'Pedido confirmado',
  PAID: 'Pagamento aprovado',
  SEPARATING: 'Separação iniciada',
  SEPARATED: 'Separação concluída',
  READY_TO_SHIP: 'Pronto',
  SHIPPED: 'Pedido enviado',
  DELIVERED: 'Pedido entregue',
  CANCELLED: 'Pedido cancelado',
  REFUNDED: 'Pedido reembolsado',
};

/**
 * Registra um evento na linha do tempo do pedido (order_status_events).
 * É best-effort: nunca lança nem quebra a transação chamadora.
 */
export async function recordOrderEvent(
  prisma: PrismaService,
  data: {
    orderId: string;
    status: OrderStatus;
    title?: string;
    description?: string | null;
    actor?: string | null;
    /** Se true, ignora quando o último evento já tem o mesmo status (evita duplicar
     * uma mesma transição vinda de caminhos diferentes, ex.: webhook + polling). */
    dedupe?: boolean;
  },
): Promise<void> {
  try {
    if (data.dedupe) {
      const last = await prisma.orderStatusEvent.findFirst({
        where: { orderId: data.orderId },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      if (last?.status === data.status) return;
    }
    await prisma.orderStatusEvent.create({
      data: {
        orderId: data.orderId,
        status: data.status,
        title: data.title ?? ORDER_STATUS_TITLES[data.status] ?? data.status,
        description: data.description ?? null,
        actor: data.actor ?? null,
      },
    });
  } catch {
    // timeline é best-effort — silenciosamente ignorado em caso de falha
  }
}
