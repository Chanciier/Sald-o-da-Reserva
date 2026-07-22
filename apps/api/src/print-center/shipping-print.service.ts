import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrintJobStatus, Role } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';
import { PrintStorageService } from './print-storage.service';

export const PrintQueueNames = {
  ShippingLabelWatch: 'print.shipping.watch',
} as const;

interface ShippingWatchJob {
  orderId: string;
  printJobId: string;
}

// `purchaseLabel` (Melhor Envio) roda fire-and-forget logo após o pagamento
// aprovado e normalmente resolve em segundos, mas não há webhook de "etiqueta
// pronta" — por isso o polling. 60 tentativas a cada ~2s de tick dá bastante
// margem (~2min) antes de desistir e marcar o job como FAILED.
const MAX_ATTEMPTS = 60;

// Etiqueta de envio física: padrão "4x6" (101,6x152,4mm), usado pela
// esmagadora maioria das transportadoras — diferente do rolo de retirada
// (104x150mm, específico da loja).
const LABEL_WIDTH_PT = 288; // 101.6mm = 4in
const LABEL_HEIGHT_PT = 432; // 152.4mm = 6in

/**
 * Observa `Shipment.labelUrl`/`meOrderId` (preenchidos pelo ShippingService,
 * nunca por este módulo) até a etiqueta oficial do Melhor Envio ficar
 * disponível, sem tocar em nenhum arquivo de `shipping/`. Zero webhook novo,
 * zero linha alterada no fluxo de pagamento/frete existente.
 */
@Injectable()
export class ShippingPrintService implements OnModuleInit {
  private readonly logger = new Logger(ShippingPrintService.name);
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly userAgent = 'Saldão da Reserva (saldaodareserva.com.br)';

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly printAgentWs: PrintAgentWsGateway,
    private readonly config: ConfigService,
    private readonly storage: PrintStorageService,
  ) {
    // Mesmas credenciais/config já usadas pelo ShippingService — só lidas de
    // novo aqui (não importa o serviço) pra manter o Print Center sem
    // nenhuma dependência do módulo de shipping.
    const sandbox = this.config.get<string>('MELHOR_ENVIO_SANDBOX', 'true') !== 'false';
    this.token = this.config.get<string>('MELHOR_ENVIO_TOKEN', '');
    this.baseUrl = sandbox
      ? 'https://sandbox.melhorenvio.com.br/api/v2'
      : 'https://melhorenvio.com.br/api/v2';
  }

  onModuleInit(): void {
    // maxAttempts alto o bastante para nunca dar dead-letter antes da nossa
    // própria contagem (PrintJob.attempts) decidir desistir.
    this.queue.register<ShippingWatchJob>(
      PrintQueueNames.ShippingLabelWatch,
      (data) => this.watch(data),
      { maxAttempts: MAX_ATTEMPTS + 10 },
    );
  }

  enqueueWatch(orderId: string, printJobId: string): Promise<void> {
    return this.queue.enqueue(PrintQueueNames.ShippingLabelWatch, { orderId, printJobId });
  }

  private async watch({ orderId, printJobId }: ShippingWatchJob): Promise<void> {
    const job = await this.prisma.printJob.findUnique({ where: { id: printJobId } });
    // Job já não está mais PENDING (cancelado, reimpresso, ou já resolvido por
    // uma tentativa anterior) — encerra o polling sem relançar.
    if (!job || job.status !== PrintJobStatus.PENDING) return;

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      select: { labelUrl: true, meOrderId: true },
    });

    if (shipment?.labelUrl && shipment.meOrderId) {
      const documentUrl = await this.buildPrintableLabel(shipment.meOrderId);
      if (documentUrl) {
        const updated = await this.prisma.printJob.update({
          where: { id: printJobId },
          data: { status: PrintJobStatus.READY, documentUrl },
        });
        await this.notifyReady(orderId);
        this.printAgentWs.pushJobReady(updated);
        return;
      }
      // labelUrl já existe mas o arquivo em si ainda não — cai pro mesmo
      // caminho de "tenta de novo" abaixo, em vez de falhar na hora.
    }

    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.printJob.update({
        where: { id: printJobId },
        data: {
          status: PrintJobStatus.FAILED,
          attempts,
          lastError: 'Etiqueta do Melhor Envio não ficou pronta a tempo.',
        },
      });
      await this.notifications.notifyPrintError({
        title: 'Erro ao gerar etiqueta de envio',
        message: `Etiqueta de envio do pedido #${orderId.slice(-8).toUpperCase()} não ficou pronta a tempo.`,
        orderId,
      });
      return;
    }

    await this.prisma.printJob.update({ where: { id: printJobId }, data: { attempts } });
    throw new Error('Etiqueta do Melhor Envio ainda não está pronta.');
  }

  /**
   * Busca o PDF de verdade da etiqueta — e, se existir, o da DACE (Declaração
   * Auxiliar de Conteúdo Eletrônica; nem todo envio tem uma) — e devolve a
   * URL de um PDF único, reencaixado no tamanho físico real (4x6"), com a
   * etiqueta na primeira página e a DACE na segunda quando aplicável.
   * Null se a etiqueta em si falhar — tratado como "ainda não pronta". Se só
   * a DACE falhar, segue sem ela (nem todo envio precisa).
   */
  private async buildPrintableLabel(meOrderId: string): Promise<string | null> {
    const labelBytes = await this.fetchPdfBytes(`/me/imprimir/pdf/${meOrderId}`, 'etiqueta');
    if (!labelBytes) return null;

    const daceBytes = await this.fetchPdfBytes(`/me/imprimir/dace/pdf/${meOrderId}`, 'DACE');

    try {
      const sources = daceBytes ? [labelBytes, daceBytes] : [labelBytes];
      const fitted = await this.fitToLabelSize(sources);
      return this.storage.uploadPdf(fitted, 'print-jobs');
    } catch (err) {
      this.logger.warn(`Erro ao processar PDF da etiqueta: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * `Shipment.labelUrl` (usado pelo botão "Ver Etiqueta") aponta pra página
   * interativa do Melhor Envio (`/imprimir/{code}`, `POST /me/shipment/print`)
   * — feita pra um humano abrir no navegador, não um PDF baixável por
   * servidor/script (o Print Agent recebia HTML e rejeitava por não começar
   * com a assinatura "%PDF"). Os endpoints certos pra automação são
   * `GET /me/imprimir/pdf/{meOrderId}` (etiqueta) e
   * `GET /me/imprimir/dace/pdf/{meOrderId}` (DACE, quando existe) — cada um
   * devolve um link S3 público apontando direto pro arquivo, sem precisar
   * de sessão de navegador. Esta função busca o link e já baixa os bytes.
   */
  private async fetchPdfBytes(path: string, label: string): Promise<Buffer | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
        },
      });
      if (!res.ok) {
        this.logger.warn(`Falha ao obter link da ${label}: HTTP ${res.status}`);
        return null;
      }

      const text = (await res.text()).trim();
      // A API já devolveu isso como string JSON pura, `{ "url"/"pdf": "..." }`
      // e `["https://..."]` em observações diferentes — aceita todos.
      let fileUrl: string | null = null;
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'string') fileUrl = parsed;
        else if (Array.isArray(parsed) && typeof parsed[0] === 'string') fileUrl = parsed[0];
        else if (parsed && typeof parsed === 'object') {
          const value = Object.values(parsed as Record<string, unknown>)[0];
          if (typeof value === 'string') fileUrl = value;
        }
      } catch {
        fileUrl = text.startsWith('http') ? text : null;
      }
      if (!fileUrl) return null;

      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        this.logger.warn(
          `Falha ao baixar arquivo da ${label} (${fileUrl}): HTTP ${fileRes.status}`,
        );
        return null;
      }
      return Buffer.from(await fileRes.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Erro ao buscar ${label}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Os PDFs que o Melhor Envio devolve nesses endpoints não vêm no tamanho
   * físico da etiqueta (num pedido de teste vieram numa página de
   * ~204x287mm, bem maior que o rolo de 4x6") — encaixar por recorte é
   * arriscado (já cortou parte do conteúdo real numa tentativa). Em vez
   * disso, cada página de cada PDF de origem é reencaixada (mesma lógica de
   * `object-fit: contain` já usada na etiqueta de retirada) numa página nova
   * de 4x6" exata, preservando a proporção — nada é cortado, só reduzido.
   * Todas as páginas de todos os PDFs de origem viram páginas sequenciais
   * de um único PDF de saída (etiqueta primeiro, depois DACE se houver).
   */
  private async fitToLabelSize(sourcesBytes: Buffer[]): Promise<Buffer> {
    const outDoc = await PDFDocument.create();

    for (const sourceBytes of sourcesBytes) {
      const srcDoc = await PDFDocument.load(sourceBytes);
      const pageIndices = srcDoc.getPages().map((_, i) => i);
      const embeddedPages = await outDoc.embedPdf(srcDoc, pageIndices);

      for (const embedded of embeddedPages) {
        const scale = Math.min(LABEL_WIDTH_PT / embedded.width, LABEL_HEIGHT_PT / embedded.height);
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        const x = (LABEL_WIDTH_PT - width) / 2;
        const y = (LABEL_HEIGHT_PT - height) / 2;

        const page = outDoc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);
        page.drawPage(embedded, { x, y, width, height });
      }
    }

    return Buffer.from(await outDoc.save());
  }

  private async notifyReady(orderId: string): Promise<void> {
    await this.notifications.notify({
      role: Role.VENDEDOR,
      type: 'PRINT_JOB_READY',
      title: 'Etiqueta de envio pronta',
      message: `Etiqueta de envio do pedido #${orderId.slice(-8).toUpperCase()} pronta para impressão.`,
      orderId,
    });
  }
}
