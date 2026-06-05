import {
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
import { Public } from '../auth/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

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
}
