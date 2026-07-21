import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';
import { QrCodeService } from './qr-code.service';
import { PrintStorageService } from './print-storage.service';

export interface PickupLabelOrder {
  id: string;
  buyerName: string | null;
  customerPhone: string | null;
  pickupCode: string | null;
  createdAt: Date;
  items: Array<{ name: string; sku: string | null; quantity: number }>;
}

const WIDTH = 600;
const HEADER_HEIGHT = 80;
const CODE_BLOCK_HEIGHT = 110;
const INFO_LINE_HEIGHT = 26;
const INFO_LINES = 4; // Cliente, Telefone, Data, Tipo
const INFO_BLOCK_HEIGHT = INFO_LINES * INFO_LINE_HEIGHT + 20;
const QR_SIZE = 180;
const QR_BLOCK_HEIGHT = QR_SIZE + 28;
const ITEMS_HEADER_HEIGHT = 40;
const ROW_HEIGHT = 26;

const CODE_Y = HEADER_HEIGHT;
const INFO_Y = CODE_Y + CODE_BLOCK_HEIGHT;
const QR_Y = INFO_Y + INFO_BLOCK_HEIGHT;
const ITEMS_START_Y = QR_Y + QR_BLOCK_HEIGHT;
const BASE_HEIGHT = ITEMS_START_Y + ITEMS_HEADER_HEIGHT;

@Injectable()
export class PickupLabelService {
  private readonly logger = new Logger(PickupLabelService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly qr: QrCodeService,
    private readonly storage: PrintStorageService,
  ) {}

  /** Gera a etiqueta interna de retirada (PNG) e retorna a URL pública. */
  async generate(order: PickupLabelOrder): Promise<string> {
    const shortId = order.id.slice(-8).toUpperCase();
    const code = order.pickupCode ?? `#${shortId}`;
    // Domínio impresso no QR — dedicado (não usa FRONTEND_URL, que também
    // serve pra CORS e pode legitimamente ter mais de um valor) pra sempre
    // apontar pro domínio canônico, nunca pro *.vercel.app nem misturar
    // vários domínios num link só.
    const baseUrl = this.config
      .get<string>('PICKUP_LABEL_BASE_URL', 'https://saldaodareversa.com')
      .split(',')[0]
      .trim();
    const target = `${baseUrl}/admin/print-center/pickup/${order.id}`;

    const qrBuffer = await this.qr.toPngBuffer(target, 220);
    const itemLines = order.items.map(
      (item) => `${item.quantity}x ${item.name}${item.sku ? ` — SKU: ${item.sku}` : ''}`,
    );

    const svg = this.buildSvg({
      code,
      buyerName: order.buyerName ?? '—',
      phone: order.customerPhone ?? '—',
      date: order.createdAt.toLocaleDateString('pt-BR'),
      itemLines,
      qrBase64: qrBuffer.toString('base64'),
    });

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const url = await this.storage.uploadPng(png, 'print-jobs');
    this.logger.log(`Etiqueta de retirada gerada para o pedido ${code}`);
    return url;
  }

  private buildSvg(input: {
    code: string;
    buyerName: string;
    phone: string;
    date: string;
    itemLines: string[];
    qrBase64: string;
  }): string {
    const height = BASE_HEIGHT + input.itemLines.length * ROW_HEIGHT;
    const itemsSvg = input.itemLines
      .map(
        (line, i) =>
          `<text x="32" y="${ITEMS_START_Y + 30 + i * ROW_HEIGHT}" font-family="DejaVu Sans Mono, monospace" font-size="16">${this.escapeXml(
            line,
          )}</text>`,
      )
      .join('\n');

    return `<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${height}" fill="white" stroke="black" stroke-width="2"/>
  <line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="black" stroke-width="2"/>
  <text x="${WIDTH / 2}" y="36" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="bold">SALDÃO DA REVERSA</text>
  <text x="${WIDTH / 2}" y="62" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="16" font-weight="bold" letter-spacing="2">ETIQUETA DE RETIRADA</text>

  <rect x="${WIDTH / 2 - 170}" y="${CODE_Y + 15}" width="340" height="72" rx="10" fill="none" stroke="black" stroke-width="3"/>
  <text x="${WIDTH / 2}" y="${CODE_Y + 63}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="44" font-weight="bold" letter-spacing="3">${this.escapeXml(input.code)}</text>
  <line x1="0" y1="${INFO_Y}" x2="${WIDTH}" y2="${INFO_Y}" stroke="black" stroke-width="1"/>

  <text x="32" y="${INFO_Y + 26}" font-family="DejaVu Sans, sans-serif" font-size="15"><tspan font-weight="bold">Cliente:</tspan> ${this.escapeXml(input.buyerName)}</text>
  <text x="32" y="${INFO_Y + 52}" font-family="DejaVu Sans, sans-serif" font-size="15"><tspan font-weight="bold">Telefone:</tspan> ${this.escapeXml(input.phone)}</text>
  <text x="32" y="${INFO_Y + 78}" font-family="DejaVu Sans, sans-serif" font-size="15"><tspan font-weight="bold">Data:</tspan> ${this.escapeXml(input.date)}</text>
  <text x="32" y="${INFO_Y + 104}" font-family="DejaVu Sans, sans-serif" font-size="15" font-weight="bold">Tipo: RETIRADA</text>

  <line x1="0" y1="${QR_Y}" x2="${WIDTH}" y2="${QR_Y}" stroke="black" stroke-width="1"/>
  <image x="${WIDTH / 2 - QR_SIZE / 2}" y="${QR_Y + 14}" width="${QR_SIZE}" height="${QR_SIZE}" href="data:image/png;base64,${input.qrBase64}"/>
  <line x1="0" y1="${ITEMS_START_Y - 30}" x2="${WIDTH}" y2="${ITEMS_START_Y - 30}" stroke="black" stroke-width="1"/>

  <text x="32" y="${ITEMS_START_Y}" font-family="DejaVu Sans, sans-serif" font-size="14" font-weight="bold">ITENS:</text>
${itemsSvg}
</svg>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
