import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';
import { QrCodeService } from './qr-code.service';
import { PrintStorageService } from './print-storage.service';

export interface PickupLabelOrder {
  id: string;
  buyerName: string | null;
  customerPhone: string | null;
  createdAt: Date;
  items: Array<{ name: string; sku: string | null; quantity: number }>;
}

const WIDTH = 600;
const ROW_HEIGHT = 26;
// Y onde a seção de itens começa (abaixo do cabeçalho, dos dados do pedido e do QR).
const ITEMS_START_Y = 500;
const BASE_HEIGHT = ITEMS_START_Y + 40;

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
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const target = `${frontendUrl}/admin/print-center/pickup/${order.id}`;

    const qrBuffer = await this.qr.toPngBuffer(target, 220);
    const itemLines = order.items.map(
      (item) => `${item.quantity}x ${item.name}${item.sku ? ` — SKU: ${item.sku}` : ''}`,
    );

    const svg = this.buildSvg({
      shortId,
      buyerName: order.buyerName ?? '—',
      phone: order.customerPhone ?? '—',
      date: order.createdAt.toLocaleDateString('pt-BR'),
      itemLines,
      qrBase64: qrBuffer.toString('base64'),
    });

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const url = await this.storage.uploadPng(png, 'print-jobs');
    this.logger.log(`Etiqueta de retirada gerada para o pedido ${shortId}`);
    return url;
  }

  private buildSvg(input: {
    shortId: string;
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
          `<text x="32" y="${ITEMS_START_Y + 30 + i * ROW_HEIGHT}" font-family="monospace" font-size="16">${this.escapeXml(
            line,
          )}</text>`,
      )
      .join('\n');

    return `<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${height}" fill="white" stroke="black" stroke-width="2"/>
  <line x1="0" y1="80" x2="${WIDTH}" y2="80" stroke="black" stroke-width="2"/>
  <text x="${WIDTH / 2}" y="36" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold">SALDÃO DA RESERVA</text>
  <text x="${WIDTH / 2}" y="62" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="bold" letter-spacing="2">ETIQUETA DE RETIRADA</text>

  <text x="32" y="112" font-family="sans-serif" font-size="15"><tspan font-weight="bold">Pedido:</tspan> #${this.escapeXml(input.shortId)}</text>
  <text x="32" y="138" font-family="sans-serif" font-size="15"><tspan font-weight="bold">Cliente:</tspan> ${this.escapeXml(input.buyerName)}</text>
  <text x="32" y="164" font-family="sans-serif" font-size="15"><tspan font-weight="bold">Telefone:</tspan> ${this.escapeXml(input.phone)}</text>
  <text x="32" y="190" font-family="sans-serif" font-size="15"><tspan font-weight="bold">Data:</tspan> ${this.escapeXml(input.date)}</text>
  <text x="32" y="216" font-family="sans-serif" font-size="15" font-weight="bold">Tipo: RETIRADA</text>

  <line x1="0" y1="234" x2="${WIDTH}" y2="234" stroke="black" stroke-width="1"/>
  <image x="${WIDTH / 2 - 90}" y="248" width="180" height="180" href="data:image/png;base64,${input.qrBase64}"/>
  <line x1="0" y1="${ITEMS_START_Y - 30}" x2="${WIDTH}" y2="${ITEMS_START_Y - 30}" stroke="black" stroke-width="1"/>

  <text x="32" y="${ITEMS_START_Y}" font-family="sans-serif" font-size="14" font-weight="bold">ITENS:</text>
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
