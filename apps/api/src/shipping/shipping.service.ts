import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

type ShipmentStatus =
  | 'PENDING'
  | 'LABEL_PURCHASED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

interface MeService {
  id: number;
  name: string;
  price: string;
  currency: string;
  delivery_time: number;
  delivery_range: { min: number; max: number };
  company: { id: number; name: string };
  error: string | null;
}

interface MeHistory {
  status: string;
  message: string;
  city?: string;
  state?: string;
  created_at: string;
}

export interface MeTracking {
  id: string;
  status: string;
  tracking: string | null;
  tracking_url?: string;
  posted_at?: string | null;
  delivered_at?: string | null;
  histories?: MeHistory[];
}

type MeRaw = Record<string, unknown>;

export interface ShippingQuoteOption {
  serviceId: number;
  method: string;
  name: string;
  carrier: string;
  description: string;
  price: number;
  deliveryMin: number;
  deliveryMax: number;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly webhookToken: string;
  private readonly userAgent: string;
  private readonly from: Record<string, string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    const sandbox = this.config.get<string>('MELHOR_ENVIO_SANDBOX', 'true') !== 'false';
    this.token = this.config.get<string>('MELHOR_ENVIO_TOKEN', '');
    this.webhookToken = this.config.get<string>('MELHOR_ENVIO_WEBHOOK_TOKEN', '');
    this.baseUrl = sandbox
      ? 'https://sandbox.melhorenvio.com.br/api/v2'
      : 'https://melhorenvio.com.br/api/v2';
    this.userAgent = 'Saldão da Reversa (adriansanluz@gmail.com)';
    this.from = {
      name: this.config.get<string>('MELHOR_ENVIO_FROM_NAME', ''),
      email: this.config.get<string>('MELHOR_ENVIO_FROM_EMAIL', ''),
      document: this.config.get<string>('MELHOR_ENVIO_FROM_DOCUMENT', '').replace(/\D/g, ''),
      phone: this.config.get<string>('MELHOR_ENVIO_FROM_PHONE', ''),
      address: this.config.get<string>('MELHOR_ENVIO_FROM_ADDRESS', ''),
      number: this.config.get<string>('MELHOR_ENVIO_FROM_NUMBER', ''),
      complement: this.config.get<string>('MELHOR_ENVIO_FROM_COMPLEMENT', ''),
      district: this.config.get<string>('MELHOR_ENVIO_FROM_DISTRICT', ''),
      city: this.config.get<string>('MELHOR_ENVIO_FROM_CITY', ''),
      state_abbr: this.config.get<string>('MELHOR_ENVIO_FROM_STATE', ''),
      country_id: 'BR',
      postal_code: this.config.get<string>('MELHOR_ENVIO_FROM_CEP', '').replace(/\D/g, ''),
    };
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  async quote(cep: string): Promise<ShippingQuoteOption[]> {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) throw new BadRequestException('CEP inválido.');

    if (!this.token || !this.from.postal_code) {
      return this.fallbackOptions();
    }

    try {
      const res = await fetch(`${this.baseUrl}/me/shipment/calculate`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          from: { postal_code: this.from.postal_code },
          to: { postal_code: cleaned },
          package: { height: 15, width: 20, length: 25, weight: 1 },
          options: { insurance_value: 0, receipt: false, own_hand: false },
        }),
      });

      if (!res.ok) {
        this.logger.warn(`ME quote failed: ${res.status}`);
        return this.fallbackOptions();
      }

      const services: MeService[] = await res.json();
      const results = services
        .filter((s) => !s.error && s.price)
        .map((s) => ({
          serviceId: s.id,
          method: s.name.toUpperCase().replace(/\s+/g, '_'),
          name: s.name,
          carrier: s.company.name,
          description: `${s.delivery_range.min}–${s.delivery_range.max} dias úteis`,
          price: parseFloat(s.price),
          deliveryMin: s.delivery_range.min,
          deliveryMax: s.delivery_range.max,
        }));

      return results.length ? results : this.fallbackOptions();
    } catch (err) {
      this.logger.error('ME quote error', err);
      return this.fallbackOptions();
    }
  }

  // ── Create shipment record (called from CheckoutService) ──────────────────

  async createShipmentRecord(
    orderId: string,
    serviceId: number,
    carrier: string,
    service: string,
    price: number,
    deliveryMin?: number | null,
    deliveryMax?: number | null,
  ) {
    return this.prisma.shipment.upsert({
      where: { orderId },
      create: { orderId, serviceId, carrier, service, price, deliveryMin, deliveryMax },
      update: { serviceId, carrier, service, price, deliveryMin, deliveryMax },
    });
  }

  // ── Get shipment for order ────────────────────────────────────────────────

  async getShipmentByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });

    return shipment ? this.serializeShipment(shipment) : null;
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  async getTracking(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!shipment) throw new NotFoundException('Envio não encontrado.');

    if (shipment.meOrderId && this.token) {
      try {
        await this.syncTracking(shipment.id, shipment.meOrderId, shipment.status);
      } catch (err) {
        this.logger.warn(`Sync tracking failed for shipment ${shipment.id}`, err);
      }
    }

    const fresh = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });

    return this.serializeShipment(fresh!);
  }

  // ── Purchase label (admin) ────────────────────────────────────────────────

  async purchaseLabel(orderId: string) {
    if (!this.token) throw new BadRequestException('Melhor Envio não configurado.');

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: {
        order: { include: { items: { include: { product: true } }, user: true } },
      },
    });
    if (!shipment) throw new NotFoundException('Envio não encontrado.');
    if (shipment.status !== 'PENDING') {
      throw new BadRequestException(`Etiqueta já processada. Status: ${shipment.status}`);
    }

    const order = shipment.order;
    const addr = order.shippingAddress as Record<string, string>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = order.items.map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unitary_value: i.price.toNumber(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalValue = order.items.reduce(
      (acc: number, i: any) => acc + i.price.toNumber() * i.quantity,
      0,
    );
    const { height, width, length, weight } = this.calcPackage(order.items);

    // Add to ME cart
    const cartRes = await fetch(`${this.baseUrl}/me/cart`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        service: shipment.serviceId,
        from: this.from,
        to: {
          name: addr.name,
          email: order.user.email,
          phone: '',
          document: '',
          address: addr.street,
          complement: addr.complement ?? '',
          number: addr.number,
          district: addr.neighborhood,
          city: addr.city,
          state_abbr: addr.state,
          country_id: 'BR',
          postal_code: addr.cep.replace(/\D/g, ''),
        },
        products,
        volumes: [{ height, width, length, weight }],
        options: {
          insurance_value: totalValue,
          receipt: false,
          own_hand: false,
          non_commercial: true,
        },
        tag: `order-${orderId.slice(-8).toUpperCase()}`,
      }),
    });

    if (!cartRes.ok) {
      const body = await cartRes.text();
      throw new BadRequestException(`Erro ao adicionar ao carrinho ME: ${body}`);
    }

    const cartData = (await cartRes.json()) as { id: string };
    const meOrderId = cartData.id;

    // Purchase
    const checkRes = await fetch(`${this.baseUrl}/me/shipment/checkout`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ orders: [meOrderId] }),
    });
    if (!checkRes.ok) {
      const body = await checkRes.text();
      throw new BadRequestException(`Erro ao comprar etiqueta: ${body}`);
    }

    // Generate label
    await fetch(`${this.baseUrl}/me/shipment/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ orders: [meOrderId] }),
    });

    // Get PDF URL
    let labelUrl: string | null = null;
    const printRes = await fetch(`${this.baseUrl}/me/shipment/print`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ mode: 'public', orders: [meOrderId] }),
    });
    if (printRes.ok) {
      const printData = (await printRes.json()) as { url?: string };
      labelUrl = printData.url ?? null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          meOrderId,
          status: 'LABEL_PURCHASED',
          labelUrl,
          rawData: cartData as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          event: 'label.purchased',
          status: 'LABEL_PURCHASED',
          description: 'Etiqueta comprada com sucesso',
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'shipment.label.purchased',
          metadata: { shipmentId: shipment.id, orderId, meOrderId, labelUrl },
        },
      });
    });

    this.logger.log(`Label purchased: shipment=${shipment.id} meOrderId=${meOrderId}`);
    return { meOrderId, labelUrl };
  }

  // ── Reverse label (returns) ───────────────────────────────────────────────

  async generateReverseLabel(
    orderId: string,
  ): Promise<{ meOrderId: string; labelUrl: string | null }> {
    if (!this.token) throw new BadRequestException('Melhor Envio não configurado.');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, user: true, shipment: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const addr = order.shippingAddress as Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = order.items.map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unitary_value: i.price.toNumber(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalValue = order.items.reduce(
      (acc: number, i: any) => acc + i.price.toNumber() * i.quantity,
      0,
    );
    const { height, width, length, weight } = this.calcPackage(order.items);
    const serviceId = (order.shipment as { serviceId?: number } | null)?.serviceId ?? 1;

    const cartRes = await fetch(`${this.baseUrl}/me/cart`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        service: serviceId,
        from: {
          name: addr.name,
          email: order.user.email,
          phone: '',
          document: '',
          address: addr.street,
          complement: addr.complement ?? '',
          number: addr.number,
          district: addr.neighborhood,
          city: addr.city,
          state_abbr: addr.state,
          country_id: 'BR',
          postal_code: addr.cep.replace(/\D/g, ''),
        },
        to: this.from,
        products,
        volumes: [{ height, width, length, weight }],
        options: {
          insurance_value: totalValue,
          receipt: false,
          own_hand: false,
          reverse: true,
          non_commercial: true,
        },
        tag: `return-${orderId.slice(-8).toUpperCase()}`,
      }),
    });

    if (!cartRes.ok) {
      const body = await cartRes.text();
      throw new BadRequestException(`Erro ao gerar etiqueta reversa: ${body}`);
    }

    const cartData = (await cartRes.json()) as { id: string };
    const meOrderId = cartData.id;

    const checkRes = await fetch(`${this.baseUrl}/me/shipment/checkout`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ orders: [meOrderId] }),
    });
    if (!checkRes.ok) {
      const body = await checkRes.text();
      throw new BadRequestException(`Erro ao comprar etiqueta reversa: ${body}`);
    }

    await fetch(`${this.baseUrl}/me/shipment/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ orders: [meOrderId] }),
    });

    let labelUrl: string | null = null;
    const printRes = await fetch(`${this.baseUrl}/me/shipment/print`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ mode: 'public', orders: [meOrderId] }),
    });
    if (printRes.ok) {
      const printData = (await printRes.json()) as { url?: string };
      labelUrl = printData.url ?? null;
    }

    this.logger.log(`Reverse label: orderId=${orderId} meOrderId=${meOrderId}`);
    return { meOrderId, labelUrl };
  }

  async fetchMeTrackingRaw(meOrderId: string): Promise<MeTracking | null> {
    if (!this.token) return null;
    try {
      const res = await fetch(`${this.baseUrl}/me/shipment/tracking?orders[]=${meOrderId}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, MeTracking>;
      return data[meOrderId] ?? null;
    } catch {
      return null;
    }
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(body: MeRaw, authHeader?: string) {
    if (this.webhookToken) {
      const bearer = authHeader?.replace('Bearer ', '');
      if (bearer !== this.webhookToken) {
        this.logger.warn('ME webhook: invalid token');
        throw new UnauthorizedException('Token inválido.');
      }
    }

    const meOrderId = body.id as string | undefined;
    const meStatus = body.status as string | undefined;
    const tracking = body.tracking as string | null | undefined;
    const message = body.message as string | undefined;

    if (!meOrderId || !meStatus) return { received: true };

    const shipment = await this.prisma.shipment.findUnique({
      where: { meOrderId },
      include: { order: true },
    });
    if (!shipment) {
      this.logger.warn(`ME webhook: meOrderId=${meOrderId} not found`);
      return { received: true };
    }

    const newStatus = this.mapMeStatus(meStatus);
    const newOrderStatus = this.toOrderStatus(newStatus);

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: newStatus,
          ...(tracking ? { trackingCode: tracking } : {}),
          ...(newStatus === 'SHIPPED' && !shipment.shippedAt ? { shippedAt: new Date() } : {}),
          ...(newStatus === 'DELIVERED' && !shipment.deliveredAt
            ? { deliveredAt: new Date() }
            : {}),
          rawData: body as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          event: `webhook.${meStatus}`,
          status: meStatus,
          description: message,
        },
      });

      if (newOrderStatus && newOrderStatus !== shipment.order.status) {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: newOrderStatus },
        });

        if (newOrderStatus === OrderStatus.SHIPPED) {
          this.prisma.order
            .findUnique({ where: { id: shipment.orderId }, include: { user: true } })
            .then((o) => {
              if (o?.user)
                this.mail
                  .sendOrderShippedEmail(
                    o.user.email,
                    o.user.name,
                    shipment.orderId,
                    tracking ?? undefined,
                  )
                  .catch((e) => this.logger.error('Order shipped email failed', e));
            })
            .catch(() => {});
        }
      }

      await tx.auditLog.create({
        data: {
          action: `shipment.webhook.${meStatus}`,
          metadata: {
            shipmentId: shipment.id,
            meOrderId,
            orderId: shipment.orderId,
            from: shipment.status,
            to: newStatus,
          },
        },
      });
    });

    this.logger.log(`ME webhook: shipment=${shipment.id} ${shipment.status}→${newStatus}`);
    return { received: true };
  }

  // ── Private: sync tracking from ME ───────────────────────────────────────

  private async syncTracking(shipmentId: string, meOrderId: string, currentStatus: ShipmentStatus) {
    const res = await fetch(`${this.baseUrl}/me/shipment/tracking?orders[]=${meOrderId}`, {
      headers: this.headers(),
    });
    if (!res.ok) return;

    const data = (await res.json()) as Record<string, MeTracking>;
    const tracking = data[meOrderId];
    if (!tracking) return;

    const histories = tracking.histories ?? [];
    const newStatus = this.mapMeStatus(tracking.status);

    // Load existing events to deduplicate
    const existing = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      select: { event: true, createdAt: true },
    });
    const existingKeys = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (existing as any[]).map((e) => `${e.event}::${new Date(e.createdAt).toISOString()}`),
    );

    const toCreate = histories.filter((h) => {
      const key = `${h.status}::${new Date(h.created_at).toISOString()}`;
      return !existingKeys.has(key);
    });

    if (toCreate.length) {
      await this.prisma.shipmentEvent.createMany({
        data: toCreate.map((h) => ({
          shipmentId,
          event: h.status,
          status: h.status,
          description: h.message,
          location: h.city ? `${h.city}/${h.state ?? ''}` : null,
          rawData: h as unknown as Prisma.InputJsonValue,
          createdAt: new Date(h.created_at),
        })),
      });
    }

    if (newStatus !== currentStatus) {
      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
          ...(tracking.tracking ? { trackingCode: tracking.tracking } : {}),
          ...(newStatus === 'SHIPPED' ? { shippedAt: new Date() } : {}),
          ...(newStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
      });
    }
  }

  // ── Private: package dimensions ───────────────────────────────────────────

  private calcPackage(
    items: {
      quantity: number;
      product: { weight?: { toNumber(): number } | null; dimensions?: unknown } | null;
    }[],
  ) {
    let weight = 0;
    let height = 10;
    let width = 15;
    let length = 20;

    for (const item of items) {
      const p = item.product;
      if (p?.weight) {
        weight += p.weight.toNumber() * item.quantity;
      } else {
        weight += 0.3 * item.quantity;
      }
      if (p?.dimensions) {
        const d = p.dimensions as Record<string, number>;
        height = Math.max(height, d.height ?? 10);
        width = Math.max(width, d.width ?? 15);
        length = Math.max(length, d.length ?? 20);
      }
    }

    return {
      weight: Math.max(0.1, Math.round(weight * 100) / 100),
      height,
      width,
      length,
    };
  }

  // ── Private: fallback options ─────────────────────────────────────────────

  private fallbackOptions(): ShippingQuoteOption[] {
    return [
      {
        serviceId: 0,
        method: 'PAC',
        name: 'PAC',
        carrier: 'Correios',
        description: '5–8 dias úteis',
        price: 19.9,
        deliveryMin: 5,
        deliveryMax: 8,
      },
      {
        serviceId: 0,
        method: 'SEDEX',
        name: 'SEDEX',
        carrier: 'Correios',
        description: '1–3 dias úteis',
        price: 34.9,
        deliveryMin: 1,
        deliveryMax: 3,
      },
    ];
  }

  // ── Private: status mapping ───────────────────────────────────────────────

  private mapMeStatus(status: string): ShipmentStatus {
    const map: Record<string, ShipmentStatus> = {
      pending: 'PENDING',
      released: 'LABEL_PURCHASED',
      posted: 'SHIPPED',
      delivered: 'DELIVERED',
      undelivered: 'IN_TRANSIT',
      canceled: 'CANCELLED',
      cancelled: 'CANCELLED',
      shipped: 'SHIPPED',
      in_transit: 'IN_TRANSIT',
    };
    return map[status.toLowerCase()] ?? 'IN_TRANSIT';
  }

  private toOrderStatus(s: ShipmentStatus): OrderStatus | null {
    if (s === 'SHIPPED' || s === 'IN_TRANSIT') return 'SHIPPED';
    if (s === 'DELIVERED') return 'DELIVERED';
    if (s === 'CANCELLED') return 'CANCELLED';
    return null;
  }

  // ── Private: headers ──────────────────────────────────────────────────────

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': this.userAgent,
    };
  }

  // ── Private: serialize ────────────────────────────────────────────────────

  private serializeShipment(s: {
    id: string;
    orderId: string;
    meOrderId: string | null;
    carrier: string;
    service: string;
    serviceId: number;
    trackingCode: string | null;
    status: string;
    labelUrl: string | null;
    price: { toNumber(): number };
    deliveryMin: number | null;
    deliveryMax: number | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    events: {
      id: string;
      event: string;
      status: string | null;
      description: string | null;
      location: string | null;
      createdAt: Date;
    }[];
  }) {
    return { ...s, price: s.price.toNumber() };
  }
}
