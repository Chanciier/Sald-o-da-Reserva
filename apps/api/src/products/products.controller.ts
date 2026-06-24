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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.create(dto, user.id);
  }

  // Public catalog endpoint. OptionalJwtAuthGuard populates req.user when a
  // staff token is sent (admin/vendedor panels reuse this route) so they keep
  // receiving full data, while anonymous visitors get a stripped response.
  @Get()
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Query() query: QueryProductDto, @CurrentUser() user?: AuthenticatedUser) {
    const isStaff = user?.role === Role.ADMIN || user?.role === Role.VENDEDOR;
    return this.productsService.findAll(query, isStaff);
  }

  // Must be declared BEFORE :slug to avoid route conflict
  @Get('offers-discount')
  @Public()
  getMinOfferDiscount() {
    return this.productsService.getMinOfferDiscount();
  }

  @Get('id/:id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  updateStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updateStock(id, dto.stock, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.remove(id, user);
  }
}
