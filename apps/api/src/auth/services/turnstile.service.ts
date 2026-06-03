import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly configService: ConfigService) {}

  async verify(token: string, ip?: string): Promise<void> {
    const secret = this.configService.get<string>('TURNSTILE_SECRET_KEY', 'skip');

    if (secret === 'skip') {
      this.logger.warn('Turnstile verification skipped (development mode)');
      return;
    }

    if (!token) {
      throw new UnauthorizedException('Token de segurança é obrigatório.');
    }

    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.set('remoteip', ip);

    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data: TurnstileResponse = (await res.json()) as TurnstileResponse;

      if (!data.success) {
        this.logger.warn(`Turnstile failed: ${data['error-codes']?.join(', ')}`);
        throw new UnauthorizedException('Verificação de segurança falhou. Tente novamente.');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Turnstile verification error', (err as Error).message);
      throw new UnauthorizedException('Verificação de segurança falhou. Tente novamente.');
    }
  }
}
