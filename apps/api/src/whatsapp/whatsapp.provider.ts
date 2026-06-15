import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappProvider {
  private readonly logger = new Logger(WhatsappProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('WPPCONNECT_URL') ?? '';
  }

  private get secret(): string {
    return this.config.get<string>('WPPCONNECT_SECRET') ?? '';
  }

  private get session(): string {
    return this.config.get<string>('WPPCONNECT_SESSION') ?? 'saldao';
  }

  private get configured(): boolean {
    return !!(this.baseUrl && this.secret);
  }

  async sendMessage(groupJid: string, text: string): Promise<void> {
    if (!this.configured) {
      this.logger.warn('WPPConnect não configurado. Mensagem não enviada.');
      return;
    }

    const res = await fetch(`${this.baseUrl}/api/${this.secret}/${this.session}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: groupJid, message: text, isGroup: true }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WPPConnect error ${res.status}: ${body}`);
    }
  }

  async sendMedia(groupJid: string, mediaUrl: string, caption: string): Promise<void> {
    if (!this.configured) {
      this.logger.warn('WPPConnect não configurado. Mídia não enviada.');
      return;
    }

    let base64 = '';
    try {
      const imgRes = await fetch(mediaUrl);
      const buf = await imgRes.arrayBuffer();
      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
      base64 = `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      this.logger.warn('Falha ao baixar imagem — enviando só texto');
      return this.sendMessage(groupJid, caption);
    }

    const res = await fetch(`${this.baseUrl}/api/${this.secret}/${this.session}/send-file-base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: groupJid,
        base64,
        filename: 'produto.jpg',
        caption,
        isGroup: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WPPConnect error ${res.status}: ${body}`);
    }
  }
}
