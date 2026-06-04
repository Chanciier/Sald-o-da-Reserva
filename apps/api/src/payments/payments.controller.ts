import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ) {
    return this.payments.handleWebhook(body, xSignature, xRequestId);
  }
}
