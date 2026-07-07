import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHmac, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';

const KEY_SHOP_ID = 'shopee:shop_id';
const KEY_ACCESS = 'shopee:access_token';
const KEY_REFRESH = 'shopee:refresh_token';
const KEY_STATE_PREFIX = 'shopee:oauth_state:';
const ACCESS_TTL = 13_800; // 3h50 — expira antes da janela de 4h da Shopee
const STATE_TTL = 600; // 10 min para o admin concluir a autorização

interface ShopeeAuthResponse {
  access_token?: string;
  refresh_token?: string;
  shop_id?: number;
  expire_in?: number;
  error?: string;
  message?: string;
}

/**
 * Autenticação da Shopee Open Platform (API v2): assinatura HMAC-SHA256 por
 * requisição e OAuth por loja (shop_id + access_token + refresh_token).
 *
 * Diferente do Mercado Livre (client_id/secret globais), a Shopee exige que
 * cada loja seja autorizada individualmente — por isso o fluxo "Conectar
 * Shopee" (ver shopee-oauth.controller.ts) guarda o shop_id obtido na
 * autorização, e não apenas os tokens.
 */
@Injectable()
export class ShopeeTokenService implements OnModuleInit {
  private readonly logger = new Logger(ShopeeTokenService.name);
  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly baseUrl: string;
  private readonly apiPublicUrl: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.partnerId = this.config.get<string>('SHOPEE_PARTNER_ID', '');
    this.partnerKey = this.config.get<string>('SHOPEE_PARTNER_KEY', '');
    this.baseUrl = this.config.get<string>('SHOPEE_API_URL', 'https://partner.shopeemobile.com');
    this.apiPublicUrl = (
      this.config.get<string>('API_PUBLIC_URL', 'http://localhost:3001') || 'http://localhost:3001'
    ).replace(/\/$/, '');
  }

  // Espelho em memória de "há loja conectada" — MarketplaceProvider.isEnabled()
  // é síncrono (usado em health() sem await), então não pode ler o Redis direto.
  private connectedCache = false;

  async onModuleInit(): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Shopee: SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY ausentes — integração desativada.',
      );
      return;
    }
    this.connectedCache = Boolean(await this.redis.get(KEY_SHOP_ID));
  }

  isConfigured(): boolean {
    return Boolean(this.partnerId && this.partnerKey);
  }

  /** Versão síncrona (cache em memória) para uso em MarketplaceProvider.isEnabled(). */
  isEnabledSync(): boolean {
    return this.isConfigured() && this.connectedCache;
  }

  async isConnected(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const shopId = await this.redis.get(KEY_SHOP_ID);
    return Boolean(shopId);
  }

  // ── Assinatura HMAC ─────────────────────────────────────────────────────────

  /** Base string pública: partner_id + path + timestamp (sem shop/access_token). */
  private signPublic(path: string, timestamp: number): string {
    return this.hmac(`${this.partnerId}${path}${timestamp}`);
  }

  /** Base string autenticada: partner_id + path + timestamp + access_token + shop_id. */
  private signShop(path: string, timestamp: number, accessToken: string, shopId: string): string {
    return this.hmac(`${this.partnerId}${path}${timestamp}${accessToken}${shopId}`);
  }

  private hmac(base: string): string {
    return createHmac('sha256', this.partnerKey).update(base).digest('hex');
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  // ── Autorização (fluxo "Conectar Shopee") ──────────────────────────────────

  /** Gera a URL para o admin autorizar a loja no site da Shopee. */
  async buildAuthorizeUrl(): Promise<string> {
    const state = randomState();
    await this.redis.set(`${KEY_STATE_PREFIX}${state}`, '1', STATE_TTL);

    const path = '/api/v2/shop/auth_partner';
    const timestamp = this.now();
    const sign = this.signPublic(path, timestamp);
    const redirect = `${this.apiPublicUrl}/api/v1/marketplaces/shopee/oauth/callback?state=${state}`;

    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
      redirect,
    });
    return `${this.baseUrl}${path}?${params.toString()}`;
  }

  async consumeState(state: string | undefined): Promise<boolean> {
    if (!state) return false;
    const key = `${KEY_STATE_PREFIX}${state}`;
    const exists = await this.redis.exists(key);
    if (exists) await this.redis.del(key);
    return exists;
  }

  /** Troca o `code` retornado pela Shopee por access/refresh token e salva o shop_id. */
  async exchangeCode(code: string, shopId: string): Promise<boolean> {
    const path = '/api/v2/auth/token/get';
    const timestamp = this.now();
    const sign = this.signPublic(path, timestamp);
    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&sign=${sign}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          shop_id: Number(shopId),
          partner_id: Number(this.partnerId),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ShopeeAuthResponse;
      if (!res.ok || !data.access_token) {
        this.logger.error(
          `Shopee: falha ao trocar code por token — ${data.error ?? res.status} ${data.message ?? ''}`,
        );
        return false;
      }
      await this.persistTokens(shopId, data);
      this.connectedCache = true;
      this.logger.log(`Shopee: loja ${shopId} conectada com sucesso`);
      return true;
    } catch (err) {
      this.logger.error('Shopee: erro ao trocar code por token', err as Error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.redis.del(KEY_SHOP_ID),
      this.redis.del(KEY_ACCESS),
      this.redis.del(KEY_REFRESH),
    ]);
    this.connectedCache = false;
  }

  // ── Uso corrente (provider / catalog / order import) ───────────────────────

  async getShopId(): Promise<string | null> {
    return this.redis.get(KEY_SHOP_ID);
  }

  async getAccessToken(): Promise<string | null> {
    const cached = await this.redis.get(KEY_ACCESS);
    if (cached) return cached;
    return this.refreshToken();
  }

  /** Assina e monta a URL completa de uma chamada autenticada (shop-level). */
  async buildAuthenticatedUrl(
    path: string,
    extraParams?: Record<string, string>,
  ): Promise<{
    url: string;
    accessToken: string;
  } | null> {
    const shopId = await this.getShopId();
    const accessToken = await this.getAccessToken();
    if (!shopId || !accessToken) return null;

    const timestamp = this.now();
    const sign = this.signShop(path, timestamp, accessToken, shopId);
    const params = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp: String(timestamp),
      sign,
      shop_id: shopId,
      access_token: accessToken,
      ...extraParams,
    });
    return { url: `${this.baseUrl}${path}?${params.toString()}`, accessToken };
  }

  async refreshToken(): Promise<string | null> {
    const shopId = await this.redis.get(KEY_SHOP_ID);
    const refreshToken = await this.redis.get(KEY_REFRESH);
    if (!shopId || !refreshToken || !this.isConfigured()) return null;

    const path = '/api/v2/auth/access_token/get';
    const timestamp = this.now();
    const sign = this.signPublic(path, timestamp);
    const url = `${this.baseUrl}${path}?partner_id=${this.partnerId}&timestamp=${timestamp}&sign=${sign}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: refreshToken,
          shop_id: Number(shopId),
          partner_id: Number(this.partnerId),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ShopeeAuthResponse;
      if (!res.ok || !data.access_token) {
        this.logger.warn(`Shopee: refresh de token falhou — ${data.error ?? res.status}`);
        return null;
      }
      await this.persistTokens(shopId, data);
      return data.access_token;
    } catch (err) {
      this.logger.error('Shopee: erro ao renovar token', err as Error);
      return null;
    }
  }

  // Renova proativamente antes do vencimento (access token expira em ~4h).
  @Cron('0 */3 * * *')
  async scheduledRefresh(): Promise<void> {
    if (!(await this.isConnected())) return;
    await this.refreshToken();
  }

  private async persistTokens(shopId: string, data: ShopeeAuthResponse): Promise<void> {
    await this.redis.set(KEY_SHOP_ID, shopId, 0);
    if (data.access_token) {
      await this.redis.set(KEY_ACCESS, data.access_token, data.expire_in ?? ACCESS_TTL);
    }
    // A Shopee rotaciona o refresh_token a cada uso — sempre persistir o novo.
    if (data.refresh_token) {
      await this.redis.set(KEY_REFRESH, data.refresh_token, 0);
    }
  }
}

function randomState(): string {
  return randomBytes(24).toString('hex');
}
