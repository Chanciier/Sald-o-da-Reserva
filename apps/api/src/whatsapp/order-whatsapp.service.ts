import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaileysService } from './baileys.service';

export interface OrderNotifyTarget {
  phone?: string | null;
  name?: string | null;
  orderId: string;
}

const STORE_NAME = 'Saldão da Reversa';

/**
 * Avisos transacionais 1:1 do pedido enviados pelo WhatsApp da loja (Baileys).
 *
 * Regras de robustez (nunca devem quebrar o fluxo de expedição):
 * - Todo envio é "fire-and-forget" e tolerante a falha — retorna boolean, não lança.
 * - Pula silenciosamente quando não há telefone válido ou o WhatsApp está offline.
 */
@Injectable()
export class OrderWhatsappService {
  private readonly logger = new Logger(OrderWhatsappService.name);

  constructor(
    private readonly baileys: BaileysService,
    private readonly config: ConfigService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Normaliza telefone BR (apenas dígitos) para o JID do WhatsApp. */
  private toJid(phone?: string | null): string | null {
    if (!phone) return null;
    let d = phone.replace(/\D/g, '');
    if (!d) return null;
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length < 10 || d.length > 11) return null;
    return `55${d}@s.whatsapp.net`;
  }

  private greeting(name?: string | null): string {
    return name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!';
  }

  private shortId(orderId: string): string {
    return orderId.slice(-8).toUpperCase();
  }

  private orderUrl(orderId: string): string {
    const base = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .split(',')[0]
      .trim();
    return `${base}/pedidos/${orderId}`;
  }

  private get pickupAddress(): string {
    return this.config.get<string>(
      'STORE_PICKUP_ADDRESS',
      'Rua Andorra, 500 — Shopping Jardim Oriente, Jardim América, São José dos Campos/SP',
    );
  }

  private get pickupHours(): string {
    return this.config.get<string>('STORE_PICKUP_HOURS', 'Seg a Sáb, 10h às 22h');
  }

  private async send(phone: string | null | undefined, text: string): Promise<boolean> {
    const jid = this.toJid(phone);
    if (!jid) {
      this.logger.warn('Aviso WhatsApp ignorado: telefone ausente ou inválido.');
      return false;
    }
    if (!this.baileys.isReady()) {
      this.logger.warn('Aviso WhatsApp ignorado: WhatsApp não conectado.');
      return false;
    }
    try {
      await this.baileys.sendMessage(jid, text);
      return true;
    } catch (e) {
      this.logger.error(`Falha ao enviar aviso WhatsApp: ${(e as Error).message}`);
      return false;
    }
  }

  // ── Envio (SHIPPING) ────────────────────────────────────────────────────────

  /** Pedido separado e indo para embalagem/postagem. */
  notifyReadyToShip(t: OrderNotifyTarget): Promise<boolean> {
    const msg =
      `${this.greeting(t.name)} 📦\n\n` +
      `Seu pedido *#${this.shortId(t.orderId)}* foi separado e já está sendo embalado para postagem.\n\n` +
      `Avisaremos por aqui assim que ele for enviado com o código de rastreio. 💛\n` +
      `${STORE_NAME}`;
    return this.send(t.phone, msg);
  }

  /** Pedido postado — com código de rastreio quando disponível. */
  notifyShipped(
    t: OrderNotifyTarget,
    trackingCode?: string | null,
    carrier?: string | null,
  ): Promise<boolean> {
    const lines = [
      `${this.greeting(t.name)} 🚚`,
      '',
      `Seu pedido *#${this.shortId(t.orderId)}* foi postado e está a caminho!`,
    ];
    if (carrier) lines.push(`Transportadora: ${carrier}`);
    if (trackingCode) {
      lines.push('', `Código de rastreio: *${trackingCode}*`);
      lines.push('Rastreie em: https://rastreamento.correios.com.br/app/index.php');
    }
    lines.push('', `Acompanhe: ${this.orderUrl(t.orderId)}`, STORE_NAME);
    return this.send(t.phone, lines.join('\n'));
  }

  /** Pedido entregue (envio). */
  notifyDelivered(t: OrderNotifyTarget): Promise<boolean> {
    const msg =
      `${this.greeting(t.name)} 🎉\n\n` +
      `Seu pedido *#${this.shortId(t.orderId)}* foi entregue!\n\n` +
      `Esperamos que goste. Qualquer coisa, é só chamar. 💛\n` +
      `${STORE_NAME}`;
    return this.send(t.phone, msg);
  }

  // ── Retirada (PICKUP) ─────────────────────────────────────────────────────

  /** Pedido pronto para retirada na loja — com código e endereço. */
  notifyPickupReady(t: OrderNotifyTarget, pickupCode?: string | null): Promise<boolean> {
    const lines = [
      `${this.greeting(t.name)} ✅`,
      '',
      `Seu pedido *#${this.shortId(t.orderId)}* está *pronto para retirada*!`,
    ];
    if (pickupCode) lines.push('', `Código de retirada: *${pickupCode}*`);
    lines.push(
      '',
      `📍 ${this.pickupAddress}`,
      `🕒 ${this.pickupHours}`,
      '',
      'Leve um documento com foto. Te esperamos! 💛',
      STORE_NAME,
    );
    return this.send(t.phone, lines.join('\n'));
  }

  /** Lembrete de retirada pendente. */
  notifyPickupReminder(t: OrderNotifyTarget, pickupCode?: string | null): Promise<boolean> {
    const lines = [
      `${this.greeting(t.name)} 🔔`,
      '',
      `Seu pedido *#${this.shortId(t.orderId)}* ainda está aguardando retirada na loja.`,
    ];
    if (pickupCode) lines.push('', `Código de retirada: *${pickupCode}*`);
    lines.push(
      '',
      `📍 ${this.pickupAddress}`,
      `🕒 ${this.pickupHours}`,
      '',
      'Te esperamos! 💛',
      STORE_NAME,
    );
    return this.send(t.phone, lines.join('\n'));
  }

  /** Retirada confirmada (pedido entregue ao cliente na loja). */
  notifyPickupConfirmed(t: OrderNotifyTarget): Promise<boolean> {
    const msg =
      `${this.greeting(t.name)} 🙌\n\n` +
      `Pedido *#${this.shortId(t.orderId)}* retirado com sucesso. Obrigado pela compra!\n\n` +
      `Volte sempre. 💛\n` +
      `${STORE_NAME}`;
    return this.send(t.phone, msg);
  }
}
