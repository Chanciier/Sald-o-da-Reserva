import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ProductType, WhatsappAccessGrant, WhatsappAccessGrantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { BaileysService } from '../whatsapp/baileys.service';
import { OrderWhatsappService } from '../whatsapp/order-whatsapp.service';
import { phoneToWhatsappJid } from '../whatsapp/phone';

interface OrderItemWithAccessProduct {
  id: string;
  productId: string;
  product: {
    name: string;
    type: ProductType;
    accessGroupJid: string | null;
    accessValidityDays: number | null;
  } | null;
}

@Injectable()
export class WhatsappAccessService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly baileys: BaileysService,
    private readonly orderWhatsapp: OrderWhatsappService,
  ) {}

  onModuleInit(): void {
    this.events.on(OmsEvents.OrderPaid, async (p) => {
      await this.handleOrderPaid(p.orderId);
    });
    this.events.on(OmsEvents.OrderCancelled, async (p) => {
      await this.handleOrderCancelled(p.orderId);
    });
  }

  private async handleOrderPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        buyerName: true,
        customerPhone: true,
        items: {
          select: {
            id: true,
            productId: true,
            product: {
              select: { name: true, type: true, accessGroupJid: true, accessValidityDays: true },
            },
          },
        },
      },
    });
    if (!order) return;

    const accessItems = (order.items as OrderItemWithAccessProduct[]).filter(
      (i) => i.product?.type === ProductType.WHATSAPP_ACCESS,
    );
    if (!accessItems.length) return;

    for (const item of accessItems) {
      await this.provisionGrant({
        orderId: order.id,
        userId: order.userId,
        buyerName: order.buyerName,
        phone: order.customerPhone,
        item,
      });
    }
  }

  private async provisionGrant(args: {
    orderId: string;
    userId: string;
    buyerName: string | null;
    phone: string | null;
    item: OrderItemWithAccessProduct;
  }): Promise<void> {
    const { orderId, userId, buyerName, phone, item } = args;
    const groupJid = item.product?.accessGroupJid;
    if (!groupJid) {
      this.logger.error(
        `Produto ${item.productId} e WHATSAPP_ACCESS sem accessGroupJid - grant nao criado (item=${item.id})`,
      );
      return;
    }

    const validityDays = item.product?.accessValidityDays ?? null;
    const expiresAt = validityDays ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000) : null;

    let inviteLink: string | null = null;
    try {
      inviteLink = this.baileys.isReady() ? await this.baileys.fetchGroupInviteLink(groupJid) : null;
    } catch (err) {
      this.logger.error(`Falha ao buscar invite link do grupo ${groupJid}`, err as Error);
    }

    let grant: WhatsappAccessGrant;
    try {
      grant = await this.prisma.whatsappAccessGrant.create({
        data: {
          orderId,
          orderItemId: item.id,
          productId: item.productId,
          userId,
          phone,
          groupJid,
          inviteLink,
          expiresAt,
          status: inviteLink ? WhatsappAccessGrantStatus.ACTIVE : WhatsappAccessGrantStatus.FAILED,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }

    if (!inviteLink) {
      this.logger.warn(
        `Grant ${grant.id} criado sem invite link (WhatsApp offline ou sem admin no grupo) - precisa reenvio manual`,
      );
      return;
    }

    await this.orderWhatsapp.notifyAccessGranted(
      { orderId, phone, name: buyerName },
      { orderItemId: item.id, inviteLink, expiresAt, productName: item.product?.name },
    );
  }

  private async handleOrderCancelled(orderId: string): Promise<void> {
    const grants = await this.prisma.whatsappAccessGrant.findMany({
      where: { orderId, status: WhatsappAccessGrantStatus.ACTIVE },
    });
    for (const grant of grants) {
      await this.revokeGrant(grant, WhatsappAccessGrantStatus.FAILED);
    }
  }

  private async revokeGrant(
    grant: Pick<WhatsappAccessGrant, 'id' | 'groupJid' | 'phone'>,
    onFailStatus: WhatsappAccessGrantStatus,
  ): Promise<boolean> {
    const jid = phoneToWhatsappJid(grant.phone);
    let removed = false;
    if (jid && this.baileys.isReady()) {
      removed = await this.baileys.removeGroupParticipant(grant.groupJid, jid).catch(() => false);
    }
    await this.prisma.whatsappAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: removed ? WhatsappAccessGrantStatus.REMOVED : onFailStatus,
        removedAt: removed ? new Date() : undefined,
      },
    });
    return removed;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireGrants(): Promise<void> {
    const due = await this.prisma.whatsappAccessGrant.findMany({
      where: { status: WhatsappAccessGrantStatus.ACTIVE, expiresAt: { lte: new Date() } },
    });
    if (!due.length) return;

    let removedCount = 0;
    for (const grant of due) {
      const removed = await this.revokeGrant(grant, WhatsappAccessGrantStatus.EXPIRED).catch((err) => {
        this.logger.error(`Falha ao processar expiracao do grant ${grant.id}`, err as Error);
        return false;
      });
      if (removed) removedCount += 1;
    }
    this.logger.log(`Expiracao de acessos: ${due.length} vencidos, ${removedCount} removidos do grupo.`);
  }

  async list(opts: { page: number; status?: WhatsappAccessGrantStatus }) {
    const take = 20;
    const skip = (opts.page - 1) * take;
    const where = opts.status ? { status: opts.status } : {};

    const [data, total] = await Promise.all([
      this.prisma.whatsappAccessGrant.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { name: true } },
          order: { select: { buyerName: true, customerPhone: true } },
        },
      }),
      this.prisma.whatsappAccessGrant.count({ where }),
    ]);

    return { data, total, page: opts.page, pages: Math.ceil(total / take) };
  }

  async resend(grantId: string): Promise<{ sent: boolean }> {
    const grant = await this.prisma.whatsappAccessGrant.findUnique({
      where: { id: grantId },
      include: { order: { select: { buyerName: true } }, product: { select: { name: true } } },
    });
    if (!grant) throw new NotFoundException('Acesso nao encontrado.');

    let inviteLink = grant.inviteLink;
    if (!inviteLink) {
      inviteLink = await this.baileys.fetchGroupInviteLink(grant.groupJid).catch(() => null);
    }
    if (!inviteLink) {
      throw new BadRequestException(
        'Nao foi possivel gerar o link de convite (WhatsApp desconectado ou sem permissao de admin no grupo).',
      );
    }

    await this.prisma.whatsappAccessGrant.update({
      where: { id: grant.id },
      data: { inviteLink, status: WhatsappAccessGrantStatus.ACTIVE },
    });

    const sent = await this.orderWhatsapp.notifyAccessGranted(
      { orderId: grant.orderId, phone: grant.phone, name: grant.order.buyerName },
      {
        orderItemId: grant.orderItemId,
        inviteLink,
        expiresAt: grant.expiresAt,
        productName: grant.product.name,
      },
      true,
    );
    return { sent };
  }

  async forceRemove(grantId: string): Promise<{ removed: boolean }> {
    const grant = await this.prisma.whatsappAccessGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Acesso nao encontrado.');
    const removed = await this.revokeGrant(grant, WhatsappAccessGrantStatus.FAILED);
    return { removed };
  }
}
