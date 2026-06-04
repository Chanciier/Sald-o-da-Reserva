import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('checkout/shipping')
  getShipping(@Query('subtotal') subtotal: string, @Query('cep') cep?: string) {
    const amount = parseFloat(subtotal) || 0;
    return this.checkout.getShippingOptions(amount, cep);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  createOrder(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.checkout.createOrder(userId, dto);
  }

  @Get('orders')
  findMyOrders(@CurrentUser('id') userId: string) {
    return this.checkout.findUserOrders(userId);
  }

  @Get('orders/:id')
  findOrder(@CurrentUser('id') userId: string, @Param('id') orderId: string) {
    return this.checkout.findOrderById(userId, orderId);
  }
}
