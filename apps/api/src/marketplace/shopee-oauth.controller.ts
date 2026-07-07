import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopeeTokenService } from './providers/shopee-token.service';

/**
 * Fluxo "Conectar Shopee" (self-service, ver /admin/marketplaces): o admin
 * clica em Conectar, é levado ao site da Shopee para autorizar a loja, e a
 * Shopee redireciona de volta para /callback com `code` + `shop_id`. Este
 * controller nunca expõe partner_key/tokens ao frontend.
 */
@Controller('marketplaces/shopee/oauth')
export class ShopeeOauthController {
  private readonly frontendUrl: string;

  constructor(
    private readonly tokens: ShopeeTokenService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();
  }

  @Get('authorize')
  @Roles(Role.ADMIN)
  async authorize(): Promise<{ url: string }> {
    if (!this.tokens.isConfigured()) {
      throw new BadRequestException(
        'Shopee não configurada: defina SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY no Railway antes de conectar.',
      );
    }
    const url = await this.tokens.buildAuthorizeUrl();
    return { url };
  }

  /** Redirect da Shopee após o admin autorizar (ou recusar) a conexão. */
  @Get('callback')
  @Public()
  @Roles()
  @HttpCode(HttpStatus.FOUND)
  async callback(
    @Query('code') code: string | undefined,
    @Query('shop_id') shopId: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const validState = await this.tokens.consumeState(state);
    if (!validState || !code || !shopId) {
      res.redirect(`${this.frontendUrl}/admin/marketplaces?shopee=error`);
      return;
    }

    const ok = await this.tokens.exchangeCode(code, shopId);
    res.redirect(`${this.frontendUrl}/admin/marketplaces?shopee=${ok ? 'connected' : 'error'}`);
  }

  @Delete()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(): Promise<void> {
    await this.tokens.disconnect();
  }
}
