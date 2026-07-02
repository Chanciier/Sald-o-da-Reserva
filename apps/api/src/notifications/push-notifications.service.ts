import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type {
  RemovePushSubscriptionDto,
  SavePushSubscriptionDto,
} from './dto/push-subscription.dto';

interface PushPayload {
  title: string;
  body: string;
  orderId?: string;
  productId?: string;
  url?: string;
  type: string;
}

interface WebPushError {
  statusCode?: number;
  message?: string;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly publicKey: string;
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicKey = config.get<string>('VAPID_PUBLIC_KEY', '');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY', '');
    const subject = config.get<string>('VAPID_SUBJECT', '');
    let configured = false;
    if (this.publicKey && privateKey && subject) {
      try {
        webpush.setVapidDetails(subject, this.publicKey, privateKey);
        configured = true;
      } catch (error) {
        this.logger.error('Configuração VAPID inválida.', error);
      }
    }
    this.configured = configured;

    if (!this.configured) {
      this.logger.warn(
        'Web Push desativado: configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.',
      );
    }
  }

  getPublicKey() {
    this.ensureConfigured();
    return { publicKey: this.publicKey };
  }

  async subscribe(userId: string, dto: SavePushSubscriptionDto) {
    this.ensureConfigured();
    await this.ensureActiveUser(userId);
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, dto: RemovePushSubscriptionDto) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: dto.endpoint },
    });
    return { subscribed: false };
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<boolean> {
    if (!this.configured) return false;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return false;
    const url =
      payload.url ??
      (payload.orderId
        ? `/pedidos/${payload.orderId}`
        : payload.productId
          ? `/admin/produtos`
          : '/');
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url,
      tag: `${payload.type}:${payload.orderId ?? payload.productId ?? 'geral'}`,
    });

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            { TTL: 300, urgency: 'high' },
          );
        } catch (error) {
          const pushError = error as WebPushError;
          if (pushError.statusCode === 404 || pushError.statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
            return;
          }
          this.logger.warn(
            `Falha no Web Push user=${userId}: ${pushError.message ?? 'erro desconhecido'}`,
          );
          throw error;
        }
      }),
    );
    void results;
    return true;
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException('Web Push ainda não está configurado.');
    }
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      throw new ForbiddenException('Usuário inativo não pode ativar Web Push.');
    }
  }
}
