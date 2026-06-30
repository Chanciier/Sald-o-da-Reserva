import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhookSource } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';
import { MarketplaceWebhooksService } from './marketplace-webhooks.service';

@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly marketplaceWebhooks: MarketplaceWebhooksService,
  ) {}

  @Post('mercadopago')
  @Public()
  @HttpCode(HttpStatus.OK)
  mercadopago(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query('data.id') dataId?: string,
    @Query('id') queryId?: string,
  ) {
    return this.webhooks.handleMercadoPago(
      req.rawBody ?? Buffer.alloc(0),
      xSignature,
      xRequestId,
      dataId ?? queryId,
    );
  }

  @Post('mercadolivre')
  @Public()
  @HttpCode(HttpStatus.OK)
  mercadolivre(@Body() body: unknown) {
    return this.marketplaceWebhooks.ingest(WebhookSource.MERCADO_LIVRE, body);
  }

  @Post('shopee')
  @Public()
  @HttpCode(HttpStatus.OK)
  shopee(@Body() body: unknown) {
    return this.marketplaceWebhooks.ingest(WebhookSource.SHOPEE, body);
  }
}
