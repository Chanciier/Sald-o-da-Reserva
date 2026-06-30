import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../../redis/redis.service';

const KEY_ACCESS = 'ml:access_token';
const KEY_REFRESH = 'ml:refresh_token';
const ACCESS_TTL = 19_800; // 5.5h — expires before ML's 6h window
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

@Injectable()
export class MlTokenService implements OnModuleInit {
  private readonly logger = new Logger(MlTokenService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly envAccessToken: string;
  private readonly envRefreshToken: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.clientId = this.config.get<string>('ML_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('ML_CLIENT_SECRET', '');
    this.envAccessToken = this.config.get<string>('ML_ACCESS_TOKEN', '');
    this.envRefreshToken = this.config.get<string>('ML_REFRESH_TOKEN', '');
  }

  async onModuleInit() {
    if (!this.clientId || !this.clientSecret || !this.envAccessToken) return;
    const existing = await this.redis.get(KEY_ACCESS);
    if (!existing && this.envAccessToken) {
      await this.redis.set(KEY_ACCESS, this.envAccessToken, ACCESS_TTL);
    }
    if (!existing && this.envRefreshToken) {
      await this.redis.set(KEY_REFRESH, this.envRefreshToken, 0);
    }
  }

  async getToken(): Promise<string> {
    const cached = await this.redis.get(KEY_ACCESS);
    if (cached) return cached;
    // Redis TTL expired — try refresh before falling back to env
    const refreshed = await this.refreshToken().catch(() => null);
    return refreshed ?? this.envAccessToken;
  }

  async refreshToken(): Promise<string | null> {
    const refreshToken = (await this.redis.get(KEY_REFRESH)) ?? this.envRefreshToken;
    if (!refreshToken || !this.clientId || !this.clientSecret) return null;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      });
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        this.logger.warn(`ML token refresh falhou: HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
      };
      await this.redis.set(KEY_ACCESS, data.access_token, ACCESS_TTL);
      if (data.refresh_token) {
        await this.redis.set(KEY_REFRESH, data.refresh_token, 0);
      }
      this.logger.log('ML access token renovado com sucesso');
      return data.access_token;
    } catch (err) {
      this.logger.error('Erro ao renovar token ML', err);
      return null;
    }
  }

  // Roda a cada 5 horas para renovar proativamente antes do vencimento (6h).
  @Cron('0 */5 * * *')
  async scheduledRefresh() {
    if (!this.clientId || !this.clientSecret) return;
    await this.refreshToken();
  }

  isConfigured(): boolean {
    return Boolean(
      this.clientId && this.clientSecret && (this.envAccessToken || this.envRefreshToken),
    );
  }
}
