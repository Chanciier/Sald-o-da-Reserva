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
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @Roles(Role.CLIENTE, Role.ADMIN, Role.VENDEDOR)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.create(dto, user);
  }

  @Get('my')
  @Roles(Role.CLIENTE, Role.ADMIN, Role.VENDEDOR)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.findMine(user);
  }

  @Get('order/:orderId')
  @Roles(Role.CLIENTE, Role.ADMIN, Role.VENDEDOR)
  findByOrder(@Param('orderId') orderId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.findByOrder(orderId, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.returnsService.findAll(page ? Number(page) : 1, limit ? Number(limit) : 20, status);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.returnsService.updateStatus(id, dto, user);
  }

  @Post(':id/sync-tracking')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @HttpCode(HttpStatus.OK)
  syncTracking(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.returnsService.syncTracking(id, user);
  }

  @Post(':id/refund')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  processRefund(
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.returnsService.processRefund(id, dto, user);
  }
}
