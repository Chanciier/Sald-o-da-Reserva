import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { EnotasService } from './enotas.service';
import { InvoiceRepository } from './invoice.repository';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly enotas: EnotasService,
    private readonly repo: InvoiceRepository,
    private readonly config: ConfigService,
  ) {
    const resendKey = this.config.get<string>('RESEND_API_KEY', '');
    this.resend = resendKey ? new Resend(resendKey) : null;
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@saldaodareserva.com.br');
  }

  // ── Emit for order (called from payments webhook, idempotent) ─────────────

  async emitForOrder(orderId: string): Promise<void> {
    const existing = await this.repo.findByOrderId(orderId);
    if (existing && ['PENDING', 'PROCESSING', 'AUTHORIZED'].includes(existing.status)) {
      this.logger.log(`Invoice already exists for order ${orderId} (${existing.status}) – skip`);
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
    if (order.status !== 'PAID') {
      this.logger.warn(`emitForOrder: order ${orderId} status=${order.status} – not PAID, skip`);
      return;
    }

    const invoice = await this.repo.create({ order: { connect: { id: orderId } } });

    if (!this.enotas.isConfigured()) {
      this.logger.warn('eNotas not configured – invoice created as PENDING');
      return;
    }

    try {
      const address = order.shippingAddress as Record<string, string>;
      const payload = {
        consumidor: {
          nome: order.user.name ?? order.user.email,
          email: order.user.email,
          ...(address?.cep
            ? {
                endereco: {
                  pais: 'Brasil',
                  cep: address.cep,
                  logradouro: address.street ?? address.logradouro ?? '',
                  numero: address.number ?? address.numero ?? 'S/N',
                  complemento: address.complement ?? address.complemento,
                  bairro: address.neighborhood ?? address.bairro ?? '',
                  cidade: address.city ?? address.cidade ?? '',
                  estado: address.state ?? address.estado ?? '',
                },
              }
            : {}),
        },
        itens: order.items.map((item) => ({
          nome: item.name,
          cfop: '5102',
          quantidade: item.quantity,
          quantidadeUnidade: 'UN',
          valorUnitario: Number(item.price),
          totalItem: Number(item.subtotal),
        })),
        formaPagamento: this.mapPaymentMethod(order.payment?.method ?? 'PIX'),
        totalVenda: Number(order.total),
        totalFrete: Number(order.shipping),
        totalDesconto: Number(order.discount),
        informacoesAdicionais: `Pedido #${order.id.slice(-8).toUpperCase()}`,
        enviarEmailDestinatario: false,
      };

      await this.repo.update(invoice.id, { status: 'PROCESSING' });
      const result = await this.enotas.emitInvoice(payload);

      await this.repo.update(invoice.id, {
        enotasId: result.id,
        status: this.enotas.mapStatus(result.status),
        invoiceNumber: result.numero ?? null,
        accessKey: result.chaveAcesso ?? null,
        xmlUrl: result.xmlUrl ?? null,
        pdfUrl: result.pdfUrl ?? null,
        issueDate: result.dataEmissao ? new Date(result.dataEmissao) : null,
        errorMessage: result.mensagemErro ?? null,
      });

      await this.audit('INVOICE_EMITTED', order.userId, { invoiceId: invoice.id, orderId });

      if (result.pdfUrl) {
        this.sendInvoiceEmail(
          order.user.email,
          order.user.name,
          result.pdfUrl,
          result.xmlUrl,
        ).catch((e) => this.logger.warn('Email send failed', e));
      }

      this.logger.log(
        `Invoice ${invoice.id} emitted → eNotasId=${result.id} status=${result.status}`,
      );
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
      enotasId: null,
      invoiceNumber: null,
      accessKey: null,
      xmlUrl: null,
      pdfUrl: null,
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

    if (invoice.enotasId && this.enotas.isConfigured()) {
      await this.enotas.cancelInvoice(invoice.enotasId, reason);
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
    if (!invoice.enotasId) return invoice;
    if (!this.enotas.isConfigured()) return invoice;

    const result = await this.enotas.getInvoice(invoice.enotasId);
    const newStatus = this.enotas.mapStatus(result.status);

    const updated = await this.repo.update(invoiceId, {
      status: newStatus,
      invoiceNumber: result.numero ?? invoice.invoiceNumber,
      accessKey: result.chaveAcesso ?? invoice.accessKey,
      xmlUrl: result.xmlUrl ?? invoice.xmlUrl,
      pdfUrl: result.pdfUrl ?? invoice.pdfUrl,
      issueDate: result.dataEmissao ? new Date(result.dataEmissao) : invoice.issueDate,
      errorMessage: result.mensagemErro ?? null,
    });

    if (requestUser) {
      await this.audit('INVOICE_SYNCED', requestUser.id, {
        invoiceId,
        from: invoice.status,
        to: newStatus,
      });
    }

    if (newStatus === 'AUTHORIZED' && invoice.status !== 'AUTHORIZED' && result.pdfUrl) {
      const { user } = invoice.order;
      this.sendInvoiceEmail(user.email, user.name, result.pdfUrl, result.xmlUrl ?? undefined).catch(
        (e) => this.logger.warn('Email send failed', e),
      );
    }

    return updated;
  }

  // ── Download helpers ──────────────────────────────────────────────────────

  async getXmlUrl(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.getWithAccess(invoiceId, user);
    await this.audit('INVOICE_DOWNLOAD_XML', user.id, { invoiceId });
    return { url: invoice.xmlUrl };
  }

  async getPdfUrl(invoiceId: string, user: AuthenticatedUser) {
    const invoice = await this.getWithAccess(invoiceId, user);
    await this.audit('INVOICE_DOWNLOAD_PDF', user.id, { invoiceId });
    return { url: invoice.pdfUrl };
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

  // ── eNotas webhook handler ────────────────────────────────────────────────

  async handleWebhook(body: Record<string, unknown>) {
    const event = body.event as string;
    const enotasId = (body.notaId ?? body.id) as string;

    if (!enotasId) return { received: true };

    const invoice = await this.prisma.invoice.findUnique({ where: { enotasId } });
    if (!invoice) {
      this.logger.warn(`eNotas webhook: enotasId=${enotasId} not found`);
      return { received: true };
    }

    const statusMap: Record<
      string,
      'PENDING' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED'
    > = {
      'invoice.created': 'PROCESSING',
      'invoice.processing': 'PROCESSING',
      'invoice.authorized': 'AUTHORIZED',
      notaEmitida: 'AUTHORIZED',
      notaAutorizada: 'AUTHORIZED',
      'invoice.rejected': 'REJECTED',
      notaRejeitada: 'REJECTED',
      'invoice.cancelled': 'CANCELLED',
      notaCancelada: 'CANCELLED',
    };

    const newStatus = statusMap[event];
    if (!newStatus || invoice.status === newStatus) return { received: true };

    await this.repo.update(invoice.id, {
      status: newStatus,
      invoiceNumber: (body.numeroNota as string) ?? invoice.invoiceNumber ?? undefined,
      accessKey: (body.chaveAcesso as string) ?? invoice.accessKey ?? undefined,
      xmlUrl: (body.xmlUrl as string) ?? invoice.xmlUrl ?? undefined,
      pdfUrl: (body.pdfUrl as string) ?? invoice.pdfUrl ?? undefined,
      issueDate: body.dataEmissao
        ? new Date(body.dataEmissao as string)
        : (invoice.issueDate ?? undefined),
      errorMessage: (body.mensagemErro as string) ?? null,
    });

    this.logger.log(`eNotas webhook: invoice=${invoice.id} ${invoice.status}→${newStatus}`);
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

  private mapPaymentMethod(method: string): string {
    const map: Record<string, string> = {
      PIX: 'Pix',
      CREDIT_CARD: 'Cartão de Crédito',
      DEBIT_CARD: 'Cartão de Débito',
      BOLETO: 'Boleto Bancário',
    };
    return map[method] ?? method;
  }

  private async sendInvoiceEmail(
    to: string,
    name: string | null,
    pdfUrl: string,
    xmlUrl?: string | null,
  ) {
    if (!this.resend) return;

    await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Sua Nota Fiscal está disponível – Saldão da Reversa',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Olá${name ? `, ${name}` : ''}!</h2>
          <p>Sua Nota Fiscal Eletrônica foi emitida com sucesso. Você pode baixá-la pelos links abaixo:</p>
          <p>
            <a href="${pdfUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-right:8px;">
              Baixar DANFE (PDF)
            </a>
            ${xmlUrl ? `<a href="${xmlUrl}" style="display:inline-block;background:#555;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Baixar XML</a>` : ''}
          </p>
          <p style="color:#888;font-size:12px;">Saldão da Reversa</p>
        </div>
      `,
    });
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
