import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const GRAPH_API = 'https://graph.facebook.com/v20.0';
const RETRY_DELAYS = [0, 1_000, 3_000]; // ms between attempts

type ActionSource = 'website';

interface UserData {
  em?: string[]; // SHA-256 hashed email
}

interface CustomData {
  currency: 'BRL';
  value: number;
  content_ids: string[];
  content_type: 'product';
  num_items: number;
}

interface CAPIEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: ActionSource;
  event_source_url: string;
  user_data: UserData;
  custom_data: CustomData;
}

export interface PurchaseInput {
  orderId: string;
  amount: number;
  contentIds: string[];
  numItems: number;
  email?: string;
}

export interface InitiateCheckoutInput {
  orderId: string;
  value: number;
  contentIds: string[];
  numItems: number;
  email?: string;
}

export interface AddToCartInput {
  productId: string;
  value: number;
  email?: string;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly pixelId: string;
  private readonly accessToken: string;
  private readonly siteUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.pixelId = this.config.get<string>('META_PIXEL_ID', '');
    this.accessToken = this.config.get<string>('META_CONVERSIONS_API_TOKEN', '');
    this.siteUrl = this.config
      .get<string>('FRONTEND_URL', 'https://saldaodareserva.com.br')
      .replace(/\/$/, '');
    this.enabled = Boolean(this.pixelId && this.accessToken);

    if (!this.enabled) {
      this.logger.warn('Meta CAPI desativado: META_PIXEL_ID ou META_CONVERSIONS_API_TOKEN ausentes');
    }
  }

  purchase(input: PurchaseInput): void {
    if (!this.enabled) return;
    const event: CAPIEvent = {
      event_name: 'Purchase',
      event_time: unixNow(),
      event_id: `${input.orderId}-purchase`,
      action_source: 'website',
      event_source_url: `${this.siteUrl}/pagamento/${input.orderId}`,
      user_data: buildUserData(input.email),
      custom_data: {
        currency: 'BRL',
        value: input.amount,
        content_ids: input.contentIds,
        content_type: 'product',
        num_items: input.numItems,
      },
    };
    this.sendWithRetry(event).catch(() => undefined);
  }

  initiateCheckout(input: InitiateCheckoutInput): void {
    if (!this.enabled) return;
    const event: CAPIEvent = {
      event_name: 'InitiateCheckout',
      event_time: unixNow(),
      event_id: `${input.orderId}-initiate-checkout`,
      action_source: 'website',
      event_source_url: `${this.siteUrl}/checkout`,
      user_data: buildUserData(input.email),
      custom_data: {
        currency: 'BRL',
        value: input.value,
        content_ids: input.contentIds,
        content_type: 'product',
        num_items: input.numItems,
      },
    };
    this.sendWithRetry(event).catch(() => undefined);
  }

  addToCart(input: AddToCartInput): void {
    if (!this.enabled) return;
    const event: CAPIEvent = {
      event_name: 'AddToCart',
      event_time: unixNow(),
      event_id: `${input.productId}-atc-${unixNow()}`,
      action_source: 'website',
      event_source_url: `${this.siteUrl}/produtos/${input.productId}`,
      user_data: buildUserData(input.email),
      custom_data: {
        currency: 'BRL',
        value: input.value,
        content_ids: [input.productId],
        content_type: 'product',
        num_items: 1,
      },
    };
    this.sendWithRetry(event).catch(() => undefined);
  }

  private async sendWithRetry(event: CAPIEvent): Promise<void> {
    const url = `${GRAPH_API}/${this.pixelId}/events`;
    const body = JSON.stringify({
      data: [event],
      access_token: this.accessToken,
    });

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt] > 0) {
        await delay(RETRY_DELAYS[attempt]);
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (res.ok) {
          const json = (await res.json()) as { events_received?: number };
          this.logger.log(
            `Meta CAPI: ${event.event_name} enviado (received=${json.events_received ?? '?'}) orderId/id=${event.event_id}`,
          );
          return;
        }

        const err = await res.text();
        if (attempt < RETRY_DELAYS.length - 1) {
          this.logger.warn(
            `Meta CAPI: tentativa ${attempt + 1} falhou para ${event.event_name} — ${res.status} ${err}`,
          );
        } else {
          this.logger.error(
            `Meta CAPI: ${event.event_name} falhou após ${RETRY_DELAYS.length} tentativas — ${res.status} ${err}`,
          );
        }
      } catch (err) {
        if (attempt < RETRY_DELAYS.length - 1) {
          this.logger.warn(
            `Meta CAPI: tentativa ${attempt + 1} erro de rede para ${event.event_name}`,
            err,
          );
        } else {
          this.logger.error(
            `Meta CAPI: ${event.event_name} erro de rede após ${RETRY_DELAYS.length} tentativas`,
            err,
          );
        }
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function buildUserData(email?: string): UserData {
  return email ? { em: [sha256(email)] } : {};
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
