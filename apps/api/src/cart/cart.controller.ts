import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  getCart(@CurrentUser('id') userId: string) {
    return this.cart.getCart(userId);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(@CurrentUser('id') userId: string, @Body() dto: AddItemDto) {
    return this.cart.addItem(userId, dto.productId, dto.quantity);
  }

  @Put('items/:productId')
  updateItem(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.cart.updateItem(userId, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  removeItem(@CurrentUser('id') userId: string, @Param('productId') productId: string) {
    return this.cart.removeItem(userId, productId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearCart(@CurrentUser('id') userId: string) {
    return this.cart.clearCart(userId);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  applyCoupon(@CurrentUser('id') userId: string, @Body() dto: ApplyCouponDto) {
    return this.cart.applyCoupon(userId, dto.code);
  }

  @Delete('coupon')
  @HttpCode(HttpStatus.OK)
  removeCoupon(@CurrentUser('id') userId: string) {
    return this.cart.removeCoupon(userId);
  }
}
