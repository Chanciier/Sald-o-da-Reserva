import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CheckoutService } from './checkout.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

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

  @Get('orders/admin/all')
  @Roles(Role.ADMIN)
  findAllOrders(
    @Query('page') page?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.checkout.findAllOrders({
      page: page ? parseInt(page, 10) : 1,
      status: status || undefined,
      search: search || undefined,
    });
  }

  @Patch('orders/admin/:id/status')
  @Roles(Role.ADMIN)
  updateOrderStatus(@Param('id') orderId: string, @Body('status') status: string) {
    return this.checkout.updateOrderStatus(orderId, status);
  }

  @Patch('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOrder(@CurrentUser('id') userId: string, @Param('id') orderId: string) {
    return this.checkout.cancelUserOrder(userId, orderId);
  }

  @Get('orders/:id')
  findOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    const isStaff = user.role === Role.ADMIN || user.role === Role.VENDEDOR;
    return this.checkout.findOrderById(isStaff ? null : user.id, orderId);
  }
}
