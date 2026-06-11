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
import { ShippingService } from './shipping.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('quote')
  quote(@Query('cep') cep: string) {
    return this.shipping.quote(cep ?? '');
  }

  @Get(':orderId')
  getShipment(@CurrentUser('id') userId: string, @Param('orderId') orderId: string) {
    return this.shipping.getShipmentByOrder(orderId, userId);
  }

  @Get(':orderId/tracking')
  getTracking(@CurrentUser('id') userId: string, @Param('orderId') orderId: string) {
    return this.shipping.getTracking(orderId, userId);
  }

  @Patch(':orderId/carrier')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  updateCarrier(
    @Param('orderId') orderId: string,
    @Body()
    body: {
      serviceId: number;
      serviceCode?: string;
      carrier: string;
      service: string;
      price: number;
      deliveryMin?: number | null;
      deliveryMax?: number | null;
    },
  ) {
    return this.shipping.updateCarrier(orderId, body);
  }

  @Post('label/:orderId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  purchaseLabel(@Param('orderId') orderId: string) {
    return this.shipping.purchaseLabel(orderId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  webhook(@Body() body: Record<string, unknown>) {
    return this.shipping.handleWebhook(body);
  }
}
