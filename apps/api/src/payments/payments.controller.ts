import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('order/:orderId')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payments.create(orderId, userId, dto);
  }

  @Get('order/:orderId')
  getByOrder(@Param('orderId') orderId: string, @CurrentUser('id') userId: string) {
    return this.payments.getByOrder(orderId, userId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    return this.payments.handleWebhook(req.rawBody ?? Buffer.alloc(0), signature);
  }
}
