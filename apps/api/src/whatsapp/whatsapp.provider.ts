import { Injectable } from '@nestjs/common';
import { BaileysService } from './baileys.service';

@Injectable()
export class WhatsappProvider {
  constructor(private readonly baileys: BaileysService) {}

  async sendMessage(groupJid: string, text: string): Promise<string | undefined> {
    return this.baileys.sendMessage(groupJid, text);
  }

  async sendMedia(
    groupJid: string,
    mediaUrl: string,
    caption: string,
  ): Promise<string | undefined> {
    return this.baileys.sendImage(groupJid, mediaUrl, caption);
  }

  async deleteMessage(groupJid: string, messageId: string): Promise<void> {
    await this.baileys.deleteMessage(groupJid, messageId);
  }
}
