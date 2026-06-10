import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { FocusNfeProvider } from './focusnfe.provider';
import { InvoiceRepository } from './invoice.repository';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly focus: FocusNfeProvider,
    private readonly repo: InvoiceRepository,
    private readonly mail: MailService,
  ) {}

  // ── Emit for order (called from payments webhook, idempotent) ─────────────

  async emitForOrder(orderId: string): Promise<void> {
    const existing = await this.repo.findByOrderId(orderId);

    // Skip only if already authorized or currently being processed by Focus NFe
    if (existing?.status === 'AUTHORIZED') {
      this.logger.log(`Invoice for order ${orderId} is AUTHORIZED – skip`);
      return;
    }
    if (existing?.status === 'PROCESSING') {
      this.logger.log(`Invoice for order ${orderId} is PROCESSING – skip`);
      return;
    }
    // PENDING with a focusReference means it was submitted but not yet confirmed — skip
    if (existing?.status === 'PENDING' && existing.focusReference) {
      this.logger.log(
        `Invoice for order ${orderId} is PENDING with ref=${existing.focusReference} – skip`,
      );
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { product: true } },
        payment: true,
      },
    });

    if (!order) {
      this.logger.warn(`emitForOrder: order ${orderId} not found`);
      return;
    }
    const BLOCKED = ['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'];
    if (BLOCKED.includes(order.status)) {
      this.logger.warn(
        `emitForOrder: order ${orderId} status=${order.status} – not emittable, skip`,
      );
      return;
    }

    // Reuse existing PENDING/REJECTED invoice or create a new one
    const invoice = existing ?? (await this.repo.create({ order: { connect: { id: orderId } } }));

    if (!this.focus.isConfigured()) {
      this.logger.warn('Focus NFe not configured – invoice created as PENDING');
      return;
    }

    try {
      const address = order.shippingAddress as Record<string, string> | null;
      // Unique ref per attempt — avoids Focus NFe caching stale rejections for the same ref
      const reference = `${invoice.id.replace(/-/g, '').slice(0, 20)}${Date.now()}`;

      const result = await this.focus.issueInvoice({
        reference,
        customer: {
          name: order.user.name ?? order.user.email,
          email: order.user.email,
          cpf: order.user.cpf ?? undefined,
          address: address?.cep
            ? {
                cep: address.cep,
                street: address.street ?? address.logradouro ?? '',
                number: address.number ?? address.numero ?? 'S/N',
                complement: address.complement ?? address.complemento,
                neighborhood: address.neighborhood ?? address.bairro ?? '',
                city: address.city ?? address.cidade ?? '',
                state: address.state ?? address.estado ?? '',
              }
            : undefined,
        },
        items: order.items.map((item) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.price),
          total: Number(item.subtotal),
          ncm: item.product?.ncm ?? undefined,
        })),
        paymentMethod: order.payment?.method ?? 'PIX',
        total: Number(order.total),
        freight: Number(order.shipping),
        discount: Number(order.discount),
        additionalInfo: `Pedido #${order.id.slice(-8).toUpperCase()}`,
      });

      await this.repo.update(invoice.id, {
        focusReference: reference,
        status: result.status,
        invoiceNumber: result.invoiceNumber ?? null,
        accessKey: result.accessKey ?? null,
        protocol: result.protocol ?? null,
        xmlUrl: result.xmlUrl ?? null,
        danfeUrl: result.danfeUrl ?? null,
        issueDate: result.issueDate ?? null,
        errorMessage: result.errorMessage ?? null,
      });

      await this.audit('INVOICE_EMITTED', order.userId, {
        invoiceId: invoice.id,
        orderId,
        reference,
      });

      if (result.status === 'AUTHORIZED' && result.danfeUrl) {
        this.mail
          .sendInvoiceEmail(
            order.user.email,
            order.user.name,
            result.danfeUrl,
            result.xmlUrl,
            result.invoiceNumber,
            result.accessKey,
          )
          .catch((e) => this.logger.warn('Invoice email failed', e));
      }

      this.logger.log(`Invoice ${invoice.id} emitted → ref=${reference} status=${result.status}`);
    } catch (err) {
      this.logger.error(`emitForOrder failed for order ${orderId}`, err);
      await this.repo.update(invoice.id, {
        status: 'REJECTED',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Manual emit / re-emit ─────────────────────────────────────────────────

  async emit(orderId: string, user: AuthenticatedUser) {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing && existing.status === 'AUTHORIZED') {
      throw new ConflictException('Já existe uma nota autorizada para este pedido.');
    }
    await this.emitForOrder(orderId);
    await this.audit('INVOICE_MANUAL_EMIT', user.id, { orderId });
    return this.repo.findByOrderId(orderId);
  }

  async reemit(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (invoice.status === 'AUTHORIZED') {
      throw new ConflictException('Nota já autorizada. Cancele antes de reemitir.');
    }

    await this.repo.update(invoiceId, {
      status: 'PENDING',
      focusReference: null,
      invoiceNumber: null,
      accessKey: null,
      protocol: null,
      xmlUrl: null,
      danfeUrl: null,
      errorMessage: null,
    });

    await this.emitForOrder(invoice.orderId);
    await this.audit('INVOICE_REEMITTED', user.id, { invoiceId, orderId: invoice.orderId });
    return this.repo.findById(invoiceId);
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async cancel(invoiceId: string, reason: string, user: AuthenticatedUser) {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Nota já cancelada.');
    if (invoice.status !== 'AUTHORIZED') {
      throw new BadRequestException('Somente notas autorizadas podem ser canceladas.');
    }

    if (invoice.focusReference && this.focus.isConfigured()) {
      await this.focus.cancelInvoice(invoice.focusReference, reason);
    }

    const updated = await this.repo.update(invoiceId, {
      status: 'CANCELLED',
      cancellationDate: new Date(),
    });

    await this.audit('INVOICE_CANCELLED', user.id, { invoiceId, orderId: invoice.orderId, reason });
    return updated;
  }

  // ── Sync status ───────────────────────────────────────────────────────────

  async syncStatus(invoiceId: string, requestUser?: AuthenticatedUser) {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) throw new NotFoundException('Nota não encontrada.');
    if (!invoice.focusReference) return invoice;
    if (!this.focus.isConfigured()) return invoice;

    const result = await this.focus.getInvoice(invoice.focusReference);

    const updated = await this.repo.update(invoiceId, {
      status: result.status,
      invoiceNumber: result.invoiceNumber ?? invoice.invoiceNumber ?? null,
      accessKey: result.accessKey ?? invoice.accessKey ?? null,
      protocol: result.protocol ?? invoice.protocol ?? null,
      xmlUrl: result.xmlUrl ?? invoice.xmlUrl ?? null,
      danfeUrl: result.danfeUrl ?? invoice.danfeUrl ?? null,
      issueDate: result.issueDate ?? invoice.issueDate ?? null,
      cancellationDate: result.cancellationDate ?? invoice.cancellationDate ?? null,
      errorMessage: result.errorMessage ?? null,
    });

    if (requestUser) {
      await this.audit('INVOICE_SYNCED', requestUser.id, {
        invoiceId,
        from: invoice.status,
        to: result.status,
      });
    }

    if (result.status === 'AUTHORIZED' && invoice.status !== 'AUTHORIZED' && result.danfeUrl) {
      const { user } = invoice.order;
      this.mail
        .sendInvoiceEmail(
          user.email,
          user.name,
          result.danfeUrl,
          result.xmlUrl ?? undefined,
          result.invoiceNumber,
          result.accessKey,
        )
        .catch((e) => this.logger.warn('Invoice email failed', e));
    }

    return updated;
  }

  // ── Download helpers ──────────────────────────────────────────────────────

  async getXmlUrl(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.getWithAccess(invoiceId, user);
    await this.audit('INVOICE_DOWNLOAD_XML', user.id, { invoiceId });
    return { url: invoice.xmlUrl };
  }

  async getDanfeUrl(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.getWithAccess(invoiceId, user);
    await this.audit('INVOICE_DOWNLOAD_DANFE', user.id, { invoiceId });
    return { url: invoice.danfeUrl };
  }

  async streamDanfe(invoiceId: string, user: AuthenticatedUser): Promise<Buffer> {
    const invoice = await this.getWithAccess(invoiceId, user);
    if (!invoice.focusReference) throw new NotFoundException('Nota sem referência Focus NFe.');
    if (!this.focus.isConfigured()) throw new BadRequestException('Focus NFe não configurado.');
    await this.audit('INVOICE_DOWNLOAD_DANFE', user.id, { invoiceId });
    try {
      return await this.focus.downloadDanfe(invoice.focusReference);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`streamDanfe failed for invoice ${invoiceId}: ${msg}`);
      throw new BadGatewayException(`Erro ao buscar DANFE: ${msg}`);
    }
  }

  async streamXml(invoiceId: string, user: AuthenticatedUser): Promise<Buffer> {
    const invoice = await this.getWithAccess(invoiceId, user);
    if (!invoice.focusReference) throw new NotFoundException('Nota sem referência Focus NFe.');
    if (!this.focus.isConfigured()) throw new BadRequestException('Focus NFe não configurado.');
    await this.audit('INVOICE_DOWNLOAD_XML', user.id, { invoiceId });
    try {
      return await this.focus.downloadXmlBuffer(invoice.focusReference);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`streamXml failed for invoice ${invoiceId}: ${msg}`);
      throw new BadGatewayException(`Erro ao buscar XML: ${msg}`);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async findAll(query: QueryInvoiceDto, user: AuthenticatedUser) {
    const createdById = user.role === Role.VENDEDOR ? user.id : query.createdById;
    return this.repo.findAll(query, createdById);
  }

  async findById(id: string, user: AuthenticatedUser) {
    return this.getWithAccess(id, user);
  }

  async stats() {
    return this.repo.countByStatus();
  }

  // ── Focus NFe status webhook ──────────────────────────────────────────────

  async handleWebhook(body: Record<string, unknown>) {
    const ref = (body.ref ?? body.reference) as string;
    const focusStatus = body.status as string;

    if (!ref || !focusStatus) return { received: true };

    const invoice = await this.prisma.invoice.findUnique({ where: { focusReference: ref } });
    if (!invoice) {
      this.logger.warn(`Focus NFe webhook: ref=${ref} not found`);
      return { received: true };
    }

    const newStatus = this.focus.mapStatus(focusStatus);
    if (invoice.status === newStatus) return { received: true };

    await this.repo.update(invoice.id, {
      status: newStatus,
      invoiceNumber: (body.numero as string) ?? invoice.invoiceNumber ?? null,
      accessKey: (body.chave_nfe as string) ?? invoice.accessKey ?? null,
      protocol: (body.protocolo as string) ?? invoice.protocol ?? null,
      xmlUrl: (body.url as string) ?? invoice.xmlUrl ?? null,
      danfeUrl: (body.danfe_url as string) ?? invoice.danfeUrl ?? null,
      issueDate: body.data_emissao
        ? new Date(body.data_emissao as string)
        : (invoice.issueDate ?? null),
      errorMessage: newStatus === 'REJECTED' ? ((body.mensagem_sefaz as string) ?? null) : null,
    });

    this.logger.log(`Focus NFe webhook: invoice=${invoice.id} ${invoice.status}→${newStatus}`);
    return { received: true };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getWithAccess(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.repo.findById(invoiceId);
    if (!invoice) throw new NotFoundException('Nota não encontrada.');

    if (user.role === Role.VENDEDOR && invoice.order.user.id !== user.id) {
      throw new ForbiddenException('Acesso negado.');
    }
    return invoice;
  }

  private async audit(action: string, userId?: string, metadata?: object) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId,
          metadata: metadata as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
    } catch {
      // fire-and-forget
    }
  }
}
