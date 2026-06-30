import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Marketplace, ProductStatus, Role, SyncAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents, OmsEventPayloads } from '../events/oms-events';
import { NotificationsService } from '../notifications/notifications.service';
import { MarketplaceHubService } from '../marketplace/marketplace-hub.service';

/**
 * Orquestrador central de vendas do OMS.
 *
 * Reage a eventos do EventBus (desacoplado dos emissores) e coordena os efeitos
 * colaterais que NÃO pertencem ao checkout/pagamento já existentes:
 *
 *   product.reserved → pausa anúncios nos outros canais + avisa vendedor
 *   order.paid       → marca produtos únicos como SOLD + remove dos outros canais
 *   order.cancelled  → libera produtos únicos reservados (volta para ACTIVE)
 *   marketplace.publish.failed → avisa admin
 *
 * A reserva de estoque e as notificações de "novo pedido"/"pagamento aprovado"
 * continuam onde sempre estiveram (checkout/webhook) — aqui só adicionamos o que
 * é novo, sem reescrever fluxos que já funcionam.
 */
@Injectable()
export class OrderOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(OrderOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly hub: MarketplaceHubService,
  ) {}

  onModuleInit(): void {
    this.events.on(OmsEvents.OrderCreated, (p) => this.onOrderCreated(p));
    this.events.on(OmsEvents.ProductReserved, (p) => this.onProductReserved(p));
    this.events.on(OmsEvents.OrderPaid, (p) => this.onOrderPaid(p));
    this.events.on(OmsEvents.OrderCancelled, (p) => this.onOrderCancelled(p));
    this.events.on(OmsEvents.MarketplacePublishFailed, (p) => this.onPublishFailed(p));
  }

  private async onOrderCreated({ orderId }: OmsEventPayloads['order.created']): Promise<void> {
    await this.audit('oms.order.created', { orderId });
  }

  /** Item único reservado: pausa nos demais canais e avisa o vendedor. */
  private async onProductReserved({
    productId,
    orderId,
  }: OmsEventPayloads['product.reserved']): Promise<void> {
    await this.hub.propagateToOtherChannels(productId, SyncAction.PAUSE, Marketplace.SITE);

    const product = await this.productName(productId);
    await this.notifications.notify({
      role: Role.VENDEDOR,
      type: 'PRODUCT_RESERVED',
      title: 'Produto reservado',
      message: `${product} foi reservado e precisa de separação.`,
      orderId: orderId ?? null,
      productId,
    });
    await this.audit('oms.product.reserved', { productId, orderId });
  }

  /** Pedido pago: produtos únicos viram SOLD e saem dos outros canais. */
  private async onOrderPaid({ orderId }: OmsEventPayloads['order.paid']): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { product: { select: { id: true, name: true, isUnique: true } } },
    });

    for (const { product } of items) {
      if (!product?.isUnique) continue;

      await this.prisma.product.updateMany({
        where: { id: product.id, status: { not: ProductStatus.SOLD } },
        data: { status: ProductStatus.SOLD },
      });

      await this.hub.propagateToOtherChannels(product.id, SyncAction.REMOVE);
      this.events.emit(OmsEvents.ProductSold, { productId: product.id, orderId });

      await this.notifications.notify({
        role: Role.ADMIN,
        type: 'PRODUCT_SOLD',
        title: 'Produto vendido',
        message: `${product.name} foi vendido e removido dos demais canais.`,
        orderId,
        productId: product.id,
      });
      await this.audit('oms.product.sold', { productId: product.id, orderId });
    }
  }

  /** Pedido cancelado: libera produtos únicos reservados (mas não os já vendidos). */
  private async onOrderCancelled({ orderId }: OmsEventPayloads['order.cancelled']): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { product: { select: { id: true, isUnique: true } } },
    });

    for (const { product } of items) {
      if (!product?.isUnique) continue;
      const freed = await this.prisma.product.updateMany({
        where: { id: product.id, status: ProductStatus.RESERVED },
        data: { status: ProductStatus.ACTIVE },
      });
      if (freed.count > 0) {
        await this.audit('oms.product.released', { productId: product.id, orderId });
      }
    }
  }

  /** Falha de publicação: avisa o admin para reprocessar pelo painel. */
  private async onPublishFailed({
    productId,
    marketplace,
    error,
  }: OmsEventPayloads['marketplace.publish.failed']): Promise<void> {
    const product = await this.productName(productId);
    await this.notifications.notify({
      role: Role.ADMIN,
      type: 'MARKETPLACE_PUBLISH_FAILED',
      title: 'Falha de publicação',
      message: `${product} falhou ao publicar em ${marketplace}: ${error}`,
      productId,
    });
  }

  private async productName(productId: string): Promise<string> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    return product?.name ?? `Produto ${productId.slice(-6)}`;
  }

  private async audit(action: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: { action, metadata: metadata as object },
      });
    } catch (err) {
      this.logger.warn(`Falha ao gravar audit ${action}`, err as Error);
    }
  }
}
