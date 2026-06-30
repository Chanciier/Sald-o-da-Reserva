import type { Marketplace } from '@prisma/client';

/**
 * Catálogo de eventos do OMS. Usado pelo EventBus para desacoplar os módulos
 * (checkout, pagamentos, marketplace, expedição) do orquestrador de pedidos.
 *
 * Nenhum emissor deve depender de quem escuta — emitir um evento NUNCA pode
 * travar o fluxo principal (ver EventBusService).
 */
export const OmsEvents = {
  OrderCreated: 'order.created',
  OrderPaid: 'order.paid',
  OrderCancelled: 'order.cancelled',
  ProductReserved: 'product.reserved',
  ProductSold: 'product.sold',
  MarketplacePublishFailed: 'marketplace.publish.failed',
  MarketplaceProductPublished: 'marketplace.product.published',
  PaymentApproved: 'payment.approved',
  ShippingLabelCreated: 'shipping.label.created',
  InvoiceCreated: 'invoice.created',
} as const;

export type OmsEvent = (typeof OmsEvents)[keyof typeof OmsEvents];

export interface OmsEventPayloads {
  'order.created': { orderId: string };
  'order.paid': { orderId: string; paymentId?: string };
  'order.cancelled': { orderId: string; reason?: string };
  'product.reserved': { productId: string; orderId?: string };
  'product.sold': { productId: string; orderId?: string };
  'marketplace.publish.failed': {
    productId: string;
    marketplace: Marketplace;
    error: string;
  };
  'marketplace.product.published': {
    productId: string;
    marketplace: Marketplace;
    externalId?: string | null;
  };
  'payment.approved': { orderId: string; paymentId: string };
  'shipping.label.created': { orderId: string; trackingCode?: string | null };
  'invoice.created': { orderId: string; invoiceId: string };
}
