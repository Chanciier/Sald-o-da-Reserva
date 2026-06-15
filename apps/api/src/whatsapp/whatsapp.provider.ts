import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappProvider {
  private readonly logger = new Logger(WhatsappProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('EVOLUTION_API_URL') ?? '';
  }

  private get apiKey(): string {
    return this.config.get<string>('EVOLUTION_API_KEY') ?? '';
  }

  private get instance(): string {
    return this.config.get<string>('EVOLUTION_INSTANCE') ?? '';
  }

  private get configured(): boolean {
    return !!(this.baseUrl && this.apiKey && this.instance);
  }

  async sendMessage(groupJid: string, text: string): Promise<void> {
    if (!this.configured) {
      this.logger.warn('Evolution API não configurada. Mensagem não enviada.');
      return;
    }

    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({ number: groupJid, text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Evolution API error ${res.status}: ${body}`);
    }
  }

  async sendMedia(groupJid: string, mediaUrl: string, caption: string): Promise<void> {
    if (!this.configured) {
      this.logger.warn('Evolution API não configurada. Mídia não enviada.');
      return;
    }

    const res = await fetch(`${this.baseUrl}/message/sendMedia/${this.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({
        number: groupJid,
        mediatype: 'image',
        caption,
        media: mediaUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Evolution API error ${res.status}: ${body}`);
    }
  }
}
