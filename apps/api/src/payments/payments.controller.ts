import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AdminSection, Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePixPaymentDto } from './dto/create-pix-payment.dto';
import { CreateCardPaymentDto } from './dto/create-card-payment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('pix')
  @HttpCode(HttpStatus.CREATED)
  createPix(@CurrentUser('id') userId: string, @Body() dto: CreatePixPaymentDto) {
    return this.payments.createPix(dto.orderId, userId);
  }

  @Post('card')
  @HttpCode(HttpStatus.CREATED)
  createCard(@CurrentUser('id') userId: string, @Body() dto: CreateCardPaymentDto) {
    return this.payments.createCard(dto.orderId, userId, dto);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.FINANCEIRO)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
  ) {
    return this.payments.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      method: method || undefined,
      status: status || undefined,
    });
  }

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

  @Get(':paymentId/status')
  getStatus(@Param('paymentId') paymentId: string, @CurrentUser('id') userId: string) {
    return this.payments.getStatus(paymentId, userId);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.payments.getById(id, userId);
  }
}
