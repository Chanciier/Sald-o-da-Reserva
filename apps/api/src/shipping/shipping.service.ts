import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

interface FrenetService {
  ServiceCode: string;
  ServiceDescription: string;
  Carrier: string;
  ShippingPrice: number;
  DeliveryTime: number;
  Error: boolean;
  Msg: string;
}

interface FrenetShipmentOrder {
  Success: boolean;
  TrackingCode: string;
  Ticket: string;
  ShippingLabel: string;
  Error: boolean;
  Msg: string;
}

interface FrenetTrackingInfo {
  TrackingCode: string;
  IsDelivered: boolean;
  EventsArray: {
    EventType: string;
    EventDateTime: string;
    EventDescription: string;
    EventLocation: string;
  }[];
}

export interface ShippingQuoteOption {
  serviceId: number;
  serviceCode: string;
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
  private readonly sellerCep: string;
  private readonly sender: Record<string, string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.token = this.config.get<string>('FRENET_TOKEN', '');
    this.baseUrl = 'https://api.frenet.com.br';
    this.sellerCep = this.config.get<string>('FRENET_SELLER_CEP', '').replace(/\D/g, '');
    this.sender = {
      name: this.config.get<string>('FRENET_SENDER_NAME', ''),
      cpf: this.config.get<string>('FRENET_SENDER_CPF_CNPJ', '').replace(/\D/g, ''),
      email: this.config.get<string>('FRENET_SENDER_EMAIL', ''),
      phone: this.config.get<string>('FRENET_SENDER_PHONE', '').replace(/\D/g, ''),
      address: this.config.get<string>('FRENET_SENDER_ADDRESS', ''),
      number: this.config.get<string>('FRENET_SENDER_NUMBER', ''),
      complement: this.config.get<string>('FRENET_SENDER_COMPLEMENT', ''),
      district: this.config.get<string>('FRENET_SENDER_DISTRICT', ''),
      city: this.config.get<string>('FRENET_SENDER_CITY', ''),
      state: this.config.get<string>('FRENET_SENDER_STATE', ''),
    };
  }

  private isConfigured(): boolean {
    return !!this.token && !!this.sellerCep;
  }

  // ── Quote ─────────────────────────────────────────────────────────────────

  async quote(cep: string): Promise<ShippingQuoteOption[]> {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) throw new BadRequestException('CEP inválido.');

    if (!this.isConfigured()) {
      this.logger.warn('Frenet não configurado — sem opções de frete.');
      return [];
    }

    try {
      const res = await fetch(`${this.baseUrl}/shipping/quote`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          SellerCEP: this.sellerCep,
          RecipientCEP: cleaned,
          ShipmentInvoiceValue: 150.0,
          ShippingServiceCode: null,
          ShippingItemArray: [
            {
              Height: 15,
              Length: 20,
              Quantity: 1,
              Weight: 1.0,
              Width: 20,
              SKU: 'PROD-001',
              Category: 'Produto',
              isFragile: false,
            },
          ],
          RecipientCountry: 'BR',
        }),
      });

      if (!res.ok) {
        this.logger.warn(`Frenet quote failed: ${res.status}`);
        return [];
      }

      const data = (await res.json()) as { ShippingSevicesArray: FrenetService[] };
      const services = data.ShippingSevicesArray ?? [];

      this.logger.log(
        `Frenet quote raw: ${services.length} serviços. ` +
          services
            .map(
              (s) =>
                `[code=${s.ServiceCode} name="${s.ServiceDescription}" price=${s.ShippingPrice} error=${s.Error}]`,
            )
            .join(', '),
      );

      const filtered = services.filter((s) => !s.Error && s.ShippingPrice > 0 && s.ServiceCode);
      this.logger.log(`Frenet quote filtered: ${filtered.length} serviços disponíveis`);

      return filtered.map((s) => ({
        serviceId: 1,
        serviceCode: s.ServiceCode,
        method: s.ServiceCode.toUpperCase().replace(/\s+/g, '_'),
        name: s.ServiceDescription,
        carrier: s.Carrier,
        description: `${s.DeliveryTime} dias úteis`,
        price: s.ShippingPrice,
        deliveryMin: s.DeliveryTime,
        deliveryMax: s.DeliveryTime,
      }));
    } catch (err) {
      this.logger.error('Frenet quote error', err);
      return [];
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

  // ── Update carrier (admin only) ──────────────────────────────────────────

  async updateCarrier(
    orderId: string,
    body: {
      serviceId: number;
      serviceCode?: string;
      carrier: string;
      service: string;
      price: number;
      deliveryMin?: number | null;
      deliveryMax?: number | null;
    },
  ) {
    const shipment = await this.prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment) throw new NotFoundException('Remessa não encontrada.');
    if (shipment.status !== 'PENDING') {
      throw new BadRequestException(
        'Não é possível trocar a transportadora após a etiqueta ser gerada.',
      );
    }
    return this.prisma.shipment.update({
      where: { orderId },
      data: {
        serviceId: body.serviceId,
        ...(body.serviceCode !== undefined ? { serviceCode: body.serviceCode } : {}),
        carrier: body.carrier,
        service: body.service,
        price: body.price,
        deliveryMin: body.deliveryMin ?? null,
        deliveryMax: body.deliveryMax ?? null,
      },
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

    if (shipment.trackingCode && this.isConfigured()) {
      try {
        await this.syncTracking(
          shipment.id,
          shipment.trackingCode,
          (shipment as unknown as { serviceCode?: string }).serviceCode ?? '',
          shipment.status as ShipmentStatus,
        );
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
    if (!this.isConfigured()) throw new BadRequestException('Frenet não configurado.');

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
    if (!shipment.serviceId) {
      throw new BadRequestException(
        'Pedido sem serviço de envio configurado. Recrie o pedido para obter as opções de frete.',
      );
    }

    const serviceCode =
      (shipment as unknown as { serviceCode?: string | null }).serviceCode ?? null;
    if (!serviceCode) {
      throw new BadRequestException(
        'Código do serviço Frenet não encontrado. Atualize o transportador antes de gerar a etiqueta.',
      );
    }

    const order = shipment.order;
    const addr = order.shippingAddress as Record<string, string>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalValue = order.items.reduce(
      (acc: number, i: any) => acc + i.price.toNumber() * i.quantity,
      0,
    );
    const { height, width, length, weight } = this.calcPackage(order.items);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shipmentItems = order.items.map((i: any) => ({
      SKU: i.product?.sku ?? 'PROD',
      Category: 'Produto',
      Name: (i.name ?? i.product?.name ?? 'Produto') as string,
      UnitaryValue: i.price.toNumber() as number,
      Quantity: i.quantity as number,
    }));

    this.logger.log(`purchaseLabel: serviceCode="${serviceCode}" serviceId=${shipment.serviceId}`);

    const createRes = await fetch(`${this.baseUrl}/shipment/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        ShipmentRequest: this.buildShipmentRequest({
          sellerCep: this.sellerCep,
          recipientName: addr.name,
          recipientPhone: '',
          recipientCpf: order.user.cpf ?? '',
          recipientEmail: order.user.email,
          recipientAddress: addr.street,
          recipientNumber: addr.number,
          recipientComplement: addr.complement ?? '',
          recipientDistrict: addr.neighborhood,
          recipientCity: addr.city,
          recipientState: addr.state,
          recipientCep: addr.cep.replace(/\D/g, ''),
          invoiceValue: totalValue,
          serviceCode,
          weight,
          height,
          length,
          width,
          items: shipmentItems,
        }),
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new BadRequestException(`Erro ao criar envio Frenet: ${body}`);
    }

    const createData = (await createRes.json()) as {
      ShipmentOrderArray: FrenetShipmentOrder[];
    };
    const result = createData.ShipmentOrderArray?.[0];

    if (!result?.Success) {
      throw new BadRequestException(
        `Frenet recusou a criação do envio: ${result?.Msg ?? 'erro desconhecido'}`,
      );
    }

    const frenetTicket = result.Ticket;
    const trackingCode = result.TrackingCode;
    const labelUrl = result.ShippingLabel ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          frenetTicket,
          trackingCode,
          status: 'LABEL_PURCHASED',
          labelUrl,
          rawData: result as unknown as Prisma.InputJsonValue,
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
          metadata: { shipmentId: shipment.id, orderId, frenetTicket, trackingCode, labelUrl },
        },
      });
    });

    this.logger.log(
      `Label purchased: shipment=${shipment.id} frenetTicket=${frenetTicket} tracking=${trackingCode}`,
    );
    return { frenetTicket, trackingCode, labelUrl };
  }

  // ── Reverse label (returns) ───────────────────────────────────────────────

  async generateReverseLabel(
    orderId: string,
  ): Promise<{ frenetTicket: string; trackingCode: string | null; labelUrl: string | null }> {
    if (!this.isConfigured()) throw new BadRequestException('Frenet não configurado.');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, user: true, shipment: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const addr = order.shippingAddress as Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalValue = order.items.reduce(
      (acc: number, i: any) => acc + i.price.toNumber() * i.quantity,
      0,
    );
    const { height, width, length, weight } = this.calcPackage(order.items);

    const serviceCode =
      (order.shipment as unknown as { serviceCode?: string | null } | null)?.serviceCode ?? 'PAC';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shipmentItems = order.items.map((i: any) => ({
      SKU: i.product?.sku ?? 'PROD',
      Category: 'Produto',
      Name: (i.name ?? i.product?.name ?? 'Produto') as string,
      UnitaryValue: i.price.toNumber() as number,
      Quantity: i.quantity as number,
    }));

    // Reverse: from = customer address, to = seller address
    const createRes = await fetch(`${this.baseUrl}/shipment/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        ShipmentRequest: this.buildShipmentRequest({
          sellerCep: addr.cep.replace(/\D/g, ''),
          recipientName: this.sender.name,
          recipientPhone: this.sender.phone,
          recipientCpf: this.sender.cpf,
          recipientEmail: this.sender.email,
          recipientAddress: this.sender.address,
          recipientNumber: this.sender.number,
          recipientComplement: this.sender.complement,
          recipientDistrict: this.sender.district,
          recipientCity: this.sender.city,
          recipientState: this.sender.state,
          recipientCep: this.sellerCep,
          invoiceValue: totalValue,
          serviceCode,
          weight,
          height,
          length,
          width,
          items: shipmentItems,
        }),
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new BadRequestException(`Erro ao gerar etiqueta reversa: ${body}`);
    }

    const createData = (await createRes.json()) as {
      ShipmentOrderArray: FrenetShipmentOrder[];
    };
    const result = createData.ShipmentOrderArray?.[0];

    if (!result?.Success) {
      throw new BadRequestException(
        `Frenet recusou a etiqueta reversa: ${result?.Msg ?? 'erro desconhecido'}`,
      );
    }

    const frenetTicket = result.Ticket;
    const trackingCode = result.TrackingCode ?? null;
    const labelUrl = result.ShippingLabel ?? null;

    this.logger.log(
      `Reverse label: orderId=${orderId} frenetTicket=${frenetTicket} tracking=${trackingCode}`,
    );
    return { frenetTicket, trackingCode, labelUrl };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(body: Record<string, unknown>) {
    this.logger.log(`Frenet webhook received: ${JSON.stringify(body)}`);
    return { received: true };
  }

  // ── Private: sync tracking from Frenet ───────────────────────────────────

  private async syncTracking(
    shipmentId: string,
    trackingCode: string,
    serviceCode: string,
    currentStatus: ShipmentStatus,
  ) {
    const res = await fetch(`${this.baseUrl}/tracking/trackinginfo`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        ShippingServiceCode: serviceCode || 'PAC',
        TrackingCodeArray: [trackingCode],
      }),
    });
    if (!res.ok) return;

    const data = (await res.json()) as { TrackingInfoArray: FrenetTrackingInfo[] };
    const info = data.TrackingInfoArray?.[0];
    if (!info) return;

    const events = info.EventsArray ?? [];
    const newStatus: ShipmentStatus = info.IsDelivered ? 'DELIVERED' : currentStatus;

    const existing = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      select: { event: true, createdAt: true },
    });
    const existingKeys = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (existing as any[]).map((e) => `${e.event}::${new Date(e.createdAt).toISOString()}`),
    );

    const toCreate = events.filter((ev) => {
      const key = `${ev.EventType}::${new Date(ev.EventDateTime).toISOString()}`;
      return !existingKeys.has(key);
    });

    if (toCreate.length) {
      await this.prisma.shipmentEvent.createMany({
        data: toCreate.map((ev) => ({
          shipmentId,
          event: ev.EventType,
          status: ev.EventType,
          description: ev.EventDescription,
          location: ev.EventLocation ?? null,
          rawData: ev as unknown as Prisma.InputJsonValue,
          createdAt: new Date(ev.EventDateTime),
        })),
      });
    }

    if (newStatus !== currentStatus) {
      await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status: newStatus,
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

  private buildShipmentRequest(p: {
    sellerCep: string;
    recipientName: string;
    recipientPhone: string;
    recipientCpf: string;
    recipientEmail: string;
    recipientAddress: string;
    recipientNumber: string;
    recipientComplement: string;
    recipientDistrict: string;
    recipientCity: string;
    recipientState: string;
    recipientCep: string;
    invoiceValue: number;
    serviceCode: string;
    weight: number;
    height: number;
    length: number;
    width: number;
    items: {
      SKU: string;
      Category: string;
      Name: string;
      UnitaryValue: number;
      Quantity: number;
    }[];
  }) {
    return {
      SellerCEP: p.sellerCep,
      RecipientName: p.recipientName,
      RecipientPhoneNumber: p.recipientPhone,
      RecipientCPF: p.recipientCpf,
      RecipientEmail: p.recipientEmail,
      RecipientAddress: p.recipientAddress,
      RecipientAddressNumber: p.recipientNumber,
      RecipientAddressComplement: p.recipientComplement,
      RecipientAddressReference: '',
      RecipientAddressDistrict: p.recipientDistrict,
      RecipientAddressCity: p.recipientCity,
      RecipientAddressStateInietion: p.recipientState,
      RecipientCEP: p.recipientCep,
      ShipmentInvoiceValue: p.invoiceValue,
      ShippingServiceCode: p.serviceCode,
      ShipmentWeight: p.weight,
      ShipmentHeight: p.height,
      ShipmentLength: p.length,
      ShipmentWidth: p.width,
      ShipmentItem: p.items,
    };
  }

  private mapStatus(status: string): ShipmentStatus {
    const map: Record<string, ShipmentStatus> = {
      PostedAfterCollect: 'SHIPPED',
      PostedAfterCollectWithModule: 'SHIPPED',
      Delivered: 'DELIVERED',
      DeliveredToNeighbor: 'DELIVERED',
      InTransit: 'IN_TRANSIT',
      OutForDelivery: 'IN_TRANSIT',
      DeliveryFailed: 'IN_TRANSIT',
      Returned: 'CANCELLED',
      Cancelled: 'CANCELLED',
    };
    return map[status] ?? 'IN_TRANSIT';
  }

  private toOrderStatus(s: ShipmentStatus): OrderStatus | null {
    if (s === 'SHIPPED' || s === 'IN_TRANSIT') return 'SHIPPED';
    if (s === 'DELIVERED') return 'DELIVERED';
    if (s === 'CANCELLED') return 'CANCELLED';
    return null;
  }

  private headers() {
    return { token: this.token, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

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
