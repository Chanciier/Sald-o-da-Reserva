import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminSection, Role } from '@prisma/client';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.CUPONS)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.CUPONS)
  findAll() {
    return this.coupons.findAll();
  }

  @Get(':code')
  @Public()
  // Limite apertado para mitigar brute-force/enumeração de códigos de cupom.
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  findByCode(@Param('code') code: string) {
    return this.coupons.findByCode(code);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.CUPONS)
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.CUPONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
